import React from "react";
import Cookies from "js-cookie";
import { getOAuthReturnUrl } from "@/components/shared/utils/config/config";
import ChunkLoader from "@/components/loader/chunk-loader";
import { generateDerivApiInstance } from "@/external/bot-skeleton/services/api/appId";
import {
  setAccountList,
  setAuthData,
} from "@/external/bot-skeleton/services/api/observables/connection-status-stream";
import { observer as globalObserver } from "@/external/bot-skeleton/utils/observer";
import { persistAuthAccounts } from "@/utils/account-storage";
import { clearAuthData } from "@/utils/auth-utils";
import {
  buildOAuthAuthorizeData,
  canUseOAuthAccountApiForCurrentOrigin,
  choosePreferredAccount,
  clearOAuthConnectionState,
  clearStoredOAuthSession,
  cleanupLegacyAuthUrl,
  cleanupOAuthCallbackUrl,
  clearStoredOAuthRedirectUrl,
  completeOAuthCallback,
  getStoredOAuthRedirectUrl,
  hasOAuthCallbackParams,
  isOAuthSessionActive,
  parseLegacyTokensFromUrl,
  startOAuthLogin,
} from "@/utils/deriv-oauth";
import { localize } from "@deriv-com/translations";
import { URLUtils } from "@deriv-com/utils";
import App from "./App";

// Extend Window interface to include is_tmb_enabled property
declare global {
  interface Window {
    is_tmb_enabled?: boolean;
  }
}

const setLocalStorageToken = async (
  loginInfo: Array<{ loginid: string; token: string; currency?: string }>,
  paramsToDelete: string[] = [],
  setIsAuthComplete: React.Dispatch<React.SetStateAction<boolean>>,
) => {
  if (loginInfo.length) {
    try {
      const normalized_accounts = loginInfo.map((account) => ({
        ...account,
        currency: account.currency || "",
      }));
      const firstOrderedAccount = normalized_accounts[0];
      const oauth_token = firstOrderedAccount?.token || "";
      const is_oauth_login = isOAuthSessionActive(oauth_token);
      const defaultActiveAccount = is_oauth_login
        ? firstOrderedAccount
        : choosePreferredAccount(normalized_accounts) || firstOrderedAccount;
      if (!defaultActiveAccount) return;

      persistAuthAccounts(loginInfo);

      if (paramsToDelete.length) {
        URLUtils.filterSearchParams(paramsToDelete);
      }

      if (is_oauth_login) {
        clearOAuthConnectionState();
        localStorage.setItem("authToken", defaultActiveAccount.token);
        localStorage.setItem("active_loginid", defaultActiveAccount.loginid);
        const optimistic_auth = buildOAuthAuthorizeData(
          defaultActiveAccount.loginid,
          {
            balance: defaultActiveAccount.balance as
              | number
              | string
              | undefined,
            currency: defaultActiveAccount.currency,
          },
        );
        setAccountList(optimistic_auth.account_list || []);
        setAuthData(optimistic_auth);

        Cookies.set("logged_state", "true", {
          domain: window.location.hostname,
          expires: 30,
          path: "/",
          secure: window.location.protocol === "https:",
        });

        return;
      }

      const api = await generateDerivApiInstance();

      if (api) {
        const { authorize, error } = await api.authorize(loginInfo[0].token);
        api.disconnect();
        if (error) {
          // Check if the error is due to an invalid token
          if (error.code === "InvalidToken") {
            // Set isAuthComplete to true to prevent the app from getting stuck in loading state
            setIsAuthComplete(true);

            const is_tmb_enabled = window.is_tmb_enabled === true;
            // Only emit the InvalidToken event if logged_state is true
            if (Cookies.get("logged_state") === "true" && !is_tmb_enabled) {
              // Emit an event that can be caught by the application to retrigger OIDC authentication
              globalObserver.emit("InvalidToken", { error });
            }

            if (Cookies.get("logged_state") === "false") {
              // If the user is not logged out, we need to clear the local storage
              clearAuthData();
            }
          }
        } else {
          localStorage.setItem("client.country", authorize.country);
          const firstId = authorize?.account_list[0]?.loginid;
          const filteredTokens = loginInfo.filter(
            (token) => token.loginid === firstId,
          );
          if (filteredTokens.length) {
            localStorage.setItem("authToken", filteredTokens[0].token);
            localStorage.setItem("active_loginid", filteredTokens[0].loginid);

            // CRITICAL: Set logged_state cookie to ensure session persists
            Cookies.set("logged_state", "true", {
              domain: window.location.hostname,
              expires: 30,
              path: "/",
              secure: window.location.protocol === "https:",
            });
            return;
          }
        }
      }

      // Fallback: Set tokens even if API authorization fails
      localStorage.setItem("authToken", loginInfo[0].token);
      localStorage.setItem("active_loginid", loginInfo[0].loginid);

      // CRITICAL: Set logged_state cookie to ensure session persists
      Cookies.set("logged_state", "true", {
        domain: window.location.hostname,
        expires: 30,
        path: "/",
        secure: window.location.protocol === "https:",
      });
    } catch (error) {}
  }
};

const getSanitizedCurrentUrl = () => {
  const url = new URL(window.location.href);
  ["code", "state", "error", "error_description", "scope"].forEach((key) => {
    url.searchParams.delete(key);
  });

  return url.toString();
};

const redirectAfterOAuthCallback = () => {
  const redirect_target = getStoredOAuthRedirectUrl();
  const sanitized_current_url = getSanitizedCurrentUrl();

  clearStoredOAuthRedirectUrl();

  if (redirect_target && redirect_target !== sanitized_current_url) {
    window.location.replace(redirect_target);
    return true;
  }

  cleanupOAuthCallbackUrl();
  return false;
};

export const AuthWrapper = () => {
  const [isAuthComplete, setIsAuthComplete] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const { loginInfo, paramsToDelete } = URLUtils.getLoginInfoFromURL();

  React.useEffect(() => {
    const initializeAuth = async () => {
      try {
        if (hasOAuthCallbackParams()) {
          if (!canUseOAuthAccountApiForCurrentOrigin()) {
            clearStoredOAuthSession();
            cleanupOAuthCallbackUrl();
            await startOAuthLogin({ redirectUrl: getSanitizedCurrentUrl() });
            return;
          }

          const oauthLoginInfo = await completeOAuthCallback();
          if (oauthLoginInfo.length) {
            await setLocalStorageToken(oauthLoginInfo, [], setIsAuthComplete);
            URLUtils.filterSearchParams(["lang"]);

            if (redirectAfterOAuthCallback()) {
              return;
            }
          } else {
            cleanupOAuthCallbackUrl();
          }
        } else {
          const legacyLoginInfo = parseLegacyTokensFromUrl();

          if (legacyLoginInfo.length) {
            clearStoredOAuthSession();
            await setLocalStorageToken(legacyLoginInfo, [], setIsAuthComplete);
            cleanupLegacyAuthUrl();
          } else {
            await setLocalStorageToken(
              loginInfo,
              paramsToDelete,
              setIsAuthComplete,
            );
          }

          URLUtils.filterSearchParams(["lang"]);
        }
      } catch (error) {
        const error_message = error instanceof Error ? error.message : error;
        clearStoredOAuthRedirectUrl();
        cleanupOAuthCallbackUrl();
        setAuthError(
          typeof error_message === "string" && error_message
            ? error_message
            : localize("Failed to complete sign in."),
        );
      } finally {
        setIsAuthComplete(true);
      }
    };

    void initializeAuth();
  }, [loginInfo, paramsToDelete]);

  if (!isAuthComplete) {
    return <ChunkLoader message={localize("Initializing...")} />;
  }

  if (authError) {
    return (
      <div className="callback-page">
        <p>{authError}</p>
        <button
          className="callback-return-button"
          onClick={() => {
            window.location.replace(getOAuthReturnUrl());
          }}
        >
          {localize("Return to Bot")}
        </button>
      </div>
    );
  }

  return <App />;
};
