import React from "react";
import Cookies from "js-cookie";
import ChunkLoader from "@/components/loader/chunk-loader";
import { getOAuthReturnUrl } from "@/components/shared/utils/config/config";
import {
  crypto_currencies_display_order,
  fiat_currencies_display_order,
} from "@/components/shared";
import { generateDerivApiInstance } from "@/external/bot-skeleton/services/api/appId";
import {
  setAccountList,
  setAuthData,
} from "@/external/bot-skeleton/services/api/observables/connection-status-stream";
import { observer as globalObserver } from "@/external/bot-skeleton/utils/observer";
import { TStoredClientAccount } from "@/utils/account-storage";
import { isDemoLoginId } from "@/utils/account-prefixes";
import { clearAuthData } from "@/utils/auth-utils";
import {
  buildOAuthAuthorizeData,
  cleanupOAuthCallbackUrl,
  clearOAuthConnectionState,
  clearStoredOAuthRedirectUrl,
  completeOAuthCallback,
  isOAuthSessionActive,
  getStoredOAuthRedirectUrl,
} from "@/utils/deriv-oauth";
import { localize } from "@deriv-com/translations";
import { Button } from "@deriv-com/ui";

const getSelectedCurrency = (accounts: TStoredClientAccount[]): string => {
  const query_params = new URLSearchParams(window.location.search);
  const currency =
    query_params.get("account") ||
    sessionStorage.getItem("query_param_currency") ||
    "";
  const first_account = accounts[0];
  const valid_currencies = [
    ...fiat_currencies_display_order,
    ...crypto_currencies_display_order,
  ];

  if (isDemoLoginId(first_account?.loginid)) return "demo";
  if (currency && valid_currencies.includes(currency.toUpperCase()))
    return currency;

  return first_account?.currency || "USD";
};

const finalizeLoginAccounts = async (
  normalizedAccounts: TStoredClientAccount[],
) => {
  const primary_account = normalizedAccounts[0];
  const primary_token = primary_account?.token || "";

  localStorage.setItem(
    "accountsList",
    JSON.stringify(
      Object.fromEntries(
        normalizedAccounts.map((account) => [account.loginid, account.token]),
      ),
    ),
  );
  localStorage.setItem(
    "clientAccounts",
    JSON.stringify(
      Object.fromEntries(
        normalizedAccounts.map((account) => [account.loginid, account]),
      ),
    ),
  );
  localStorage.setItem(
    "deriv_tokens",
    JSON.stringify(
      normalizedAccounts.map((account) => ({
        acct: account.loginid,
        token: account.token,
      })),
    ),
  );

  if (!primary_token || !primary_account?.loginid) {
    clearAuthData();
    return;
  }

  if (isOAuthSessionActive(primary_token)) {
    clearOAuthConnectionState();
    localStorage.setItem("authToken", primary_token);
    localStorage.setItem("active_loginid", primary_account.loginid);
    const optimistic_auth = buildOAuthAuthorizeData(primary_account.loginid, {
      balance: primary_account.balance as number | string | undefined,
      currency: primary_account.currency,
    });
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

  let is_token_set = false;
  const api = await generateDerivApiInstance();

  if (api) {
    const { authorize, error } = await api.authorize(primary_token);
    api.disconnect();

    if (error) {
      if (error.code === "InvalidToken") {
        is_token_set = true;

        const is_tmb_enabled = window.is_tmb_enabled === true;
        if (Cookies.get("logged_state") === "true" && !is_tmb_enabled) {
          globalObserver.emit("InvalidToken", { error });
        }

        if (Cookies.get("logged_state") === "false") {
          clearAuthData();
        }
      }
    } else {
      localStorage.setItem("callback_token", authorize.toString());
      const first_id = authorize?.account_list[0]?.loginid;
      const selected_account = normalizedAccounts.find(
        (account) => account.loginid === first_id,
      );

      if (selected_account) {
        localStorage.setItem("authToken", selected_account.token);
        localStorage.setItem("active_loginid", selected_account.loginid);
        is_token_set = true;
      }
    }
  }

  if (!is_token_set) {
    localStorage.setItem("authToken", primary_token);
    localStorage.setItem("active_loginid", primary_account.loginid);
  }

  Cookies.set("logged_state", "true", {
    domain: window.location.hostname,
    expires: 30,
    path: "/",
    secure: window.location.protocol === "https:",
  });
};

const CallbackPage = () => {
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const completeLogin = async () => {
      try {
        const normalized_accounts = await completeOAuthCallback();

        if (!normalized_accounts.length) {
          clearStoredOAuthRedirectUrl();
          cleanupOAuthCallbackUrl();
          window.location.replace(getOAuthReturnUrl());
          return;
        }

        await finalizeLoginAccounts(normalized_accounts);

        const redirect_target = new URL(
          getStoredOAuthRedirectUrl(),
          window.location.origin,
        );
        const selected_currency = getSelectedCurrency(normalized_accounts);

        if (selected_currency) {
          redirect_target.searchParams.set("account", selected_currency);
        }

        clearStoredOAuthRedirectUrl();
        window.location.replace(redirect_target.toString());
      } catch (auth_error) {
        const message =
          auth_error instanceof Error
            ? auth_error.message
            : localize("Failed to complete sign in.");
        clearStoredOAuthRedirectUrl();
        cleanupOAuthCallbackUrl();
        setError(message);
      }
    };

    void completeLogin();
  }, []);

  if (!error) {
    return <ChunkLoader message={localize("Completing sign in...")} />;
  }

  return (
    <div className="callback-page">
      <p>{error}</p>
      <Button
        className="callback-return-button"
        onClick={() => {
          window.location.replace(getOAuthReturnUrl());
        }}
      >
        {localize("Return to Bot")}
      </Button>
    </div>
  );
};

export default CallbackPage;
