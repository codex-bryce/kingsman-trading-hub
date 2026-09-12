import { initSurvicate } from "../public-path";
import { lazy } from "react";
import React from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Route,
  RouterProvider,
} from "react-router-dom";
import AppLoaderWrapper from "@/components/app-loader/app-loader-wrapper";
import {
  getLoaderDuration,
  isLoaderEnabled,
} from "@/components/app-loader/loader-config";
import RoutePromptDialog from "@/components/route-prompt-dialog";
import {
  getBotsManifest,
  prefetchAllXmlInBackground,
} from "@/utils/freebots-cache";
import { getStoredClientAccounts } from "@/utils/account-storage";
import { isDemoLoginId, isRealLoginId } from "@/utils/account-prefixes";
import {
  crypto_currencies_display_order,
  fiat_currencies_display_order,
} from "@/components/shared";
import {
  forceUpdateAppId,
  getRotationStatus,
} from "@/components/shared/utils/config/config";
import { StoreProvider } from "@/hooks/useStore";
import Endpoint from "@/pages/endpoint";
import {
  initializeI18n,
  localize,
  TranslationProvider,
} from "@deriv-com/translations";
import CoreStoreProvider from "./CoreStoreProvider";
import SecurityProtection from "@/components/security/security-protection";
import CopyTradingManager from "@/pages/copy-trading/copy-trading-manager";
import { initReplicator } from "@/pages/copy-trading/replicator";
import { captureAffiliateParams } from "@/components/signup-modal";
import "./app-root.scss";

const Layout = lazy(() => import("../components/layout"));
const AppRoot = lazy(() => import("./app-root"));

const TRANSLATIONS_CDN_URL =
  process.env.TRANSLATIONS_CDN_URL || "https://translations.deriv.com";
const R2_PROJECT_NAME = process.env.R2_PROJECT_NAME || "deriv-app";
const CROWDIN_BRANCH_NAME = process.env.CROWDIN_BRANCH_NAME || "master";
const i18nInstance = initializeI18n({
  cdnUrl: `${TRANSLATIONS_CDN_URL}/${R2_PROJECT_NAME}/${CROWDIN_BRANCH_NAME}`,
});

const RootLayout = () => (
  <StoreProvider>
    <TranslationProvider i18nInstance={i18nInstance}>
      <CoreStoreProvider>
        <SecurityProtection />
        <AppLoaderWrapper
          duration={getLoaderDuration()}
          enabled={isLoaderEnabled()}
        >
          <Layout />
          <RoutePromptDialog />
        </AppLoaderWrapper>
      </CoreStoreProvider>
    </TranslationProvider>
  </StoreProvider>
);

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<RootLayout />}>
      <Route index element={<AppRoot />} />
      <Route path="endpoint" element={<Endpoint />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>,
  ),
);

// Global copy trading manager instance - persists across tab changes
let globalCopyTradingManager: CopyTradingManager | null = null;
let globalReplicatorCleanup: (() => void) | null = null;

// Initialize global copy trading replicator (runs once, persists across tab changes)
function initializeGlobalCopyTrading() {
  if (globalCopyTradingManager) {
    return;
  }

  globalCopyTradingManager = new CopyTradingManager();

  // Initialize replicator immediately (don't wait)
  globalReplicatorCleanup = initReplicator(globalCopyTradingManager);

  // Wait a bit for manager to restore state, then sync tokens
  setTimeout(() => {
    if (!globalCopyTradingManager) return;

    // Sync tokens from localStorage
    const syncTokens = async () => {
      if (!globalCopyTradingManager) return;

      const isDemoToReal = localStorage.getItem("demo_to_real") === "true";
      if (isDemoToReal) {
        const accounts_list = JSON.parse(
          localStorage.getItem("accountsList") || "{}",
        );
        const keys = Object.keys(accounts_list);
        const key = keys.find((k) => isRealLoginId(k));
        if (key) {
          const value = accounts_list[key];
          globalCopyTradingManager.setMasterToken(value);
        }
      }

      const copyTokensArray = JSON.parse(
        localStorage.getItem("copyTokensArray") || "[]",
      );
      for (const token of copyTokensArray) {
        if (!globalCopyTradingManager.copiers.find((c) => c.token === token)) {
          try {
            globalCopyTradingManager.addCopier(token);
          } catch (e) {
            // Token might already exist
          }
        }
      }
    };

    syncTokens();
  }, 500);
}

// Export for use in Copy Trading component
export const getGlobalCopyTradingManager = () => globalCopyTradingManager;

function App() {
  React.useEffect(() => {
    // Capture affiliate params from URL on page load
    captureAffiliateParams();

    // Force update app ID in localStorage to ensure we use the current config value
    forceUpdateAppId();

    // Expose rotation status function globally for debugging
    (window as any).getAppIdRotationStatus = getRotationStatus;

    // Use the invalid token handler hook to automatically retrigger OIDC authentication
    // when an invalid token is detected and the cookie logged state is true

    initSurvicate();
    window?.dataLayer?.push({ event: "page_load" });

    // Initialize global copy trading replicator (persists across tab changes)
    initializeGlobalCopyTrading();

    // Prefetch BOT! BOT@ XMLs on startup for instant availability
    // Skip prefetch on very slow connections (2G)
    const shouldPrefetch =
      !(navigator as any)?.connection ||
      (navigator as any).connection?.effectiveType !== "2g";
    if (shouldPrefetch) {
      setTimeout(async () => {
        try {
          const manifest = (await getBotsManifest()) || [];
          if (manifest.length) {
            prefetchAllXmlInBackground(manifest.map((m) => m.file));
          }
        } catch (e) {}
      }, 0);
    }

    return () => {
      // Clean up the invalid token handler when the component unmounts
      const survicate_box = document.getElementById("survicate-box");
      if (survicate_box) {
        survicate_box.style.display = "none";
      }
      // Note: We DON'T cleanup the replicator here - it should persist
    };
  }, []);

  React.useEffect(() => {
    const accounts_list = localStorage.getItem("accountsList");
    const client_accounts = localStorage.getItem("clientAccounts");
    const url_params = new URLSearchParams(window.location.search);
    const account_currency = url_params.get("account");
    const validCurrencies = [
      ...fiat_currencies_display_order,
      ...crypto_currencies_display_order,
    ];

    const is_valid_currency =
      account_currency &&
      validCurrencies.includes(account_currency?.toUpperCase());

    if (!accounts_list || !client_accounts) return;

    try {
      const parsed_accounts = JSON.parse(accounts_list);
      const parsed_client_accounts = getStoredClientAccounts();

      const updateLocalStorage = (token: string, loginid: string) => {
        localStorage.setItem("authToken", token);
        localStorage.setItem("active_loginid", loginid);
      };

      // Handle demo account
      if (account_currency?.toUpperCase() === "DEMO") {
        const demo_account = Object.entries(parsed_accounts).find(([key]) =>
          isDemoLoginId(key),
        );

        if (demo_account) {
          const [loginid, token] = demo_account;
          updateLocalStorage(String(token), loginid);
          return;
        }
      }

      // Handle real account with valid currency
      if (account_currency?.toUpperCase() !== "DEMO" && is_valid_currency) {
        const real_account = Object.entries(parsed_client_accounts).find(
          ([loginid, account]) =>
            isRealLoginId(loginid) &&
            typeof account.currency === "string" &&
            account.currency.toUpperCase() === account_currency?.toUpperCase(),
        );

        if (real_account) {
          const [loginid, account] = real_account;
          if ("token" in account) {
            updateLocalStorage(String(account?.token), loginid);
          }
          return;
        }
      }
    } catch (e) {
      // eslint-disable-line no-console
    }
  }, []);

  return (
    <>
      <RouterProvider router={router} />
    </>
  );
}

export default App;
