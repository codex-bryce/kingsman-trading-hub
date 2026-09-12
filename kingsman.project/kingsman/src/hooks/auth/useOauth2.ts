import { useState } from "react";
import { useEffect } from "react";
import { runInAction } from "mobx";
import Cookies from "js-cookie";
import {
  getOAuthRedirectUri,
  getOAuthReturnUrl,
} from "@/components/shared/utils/config/config";
import { startOAuthLogin } from "@/utils/deriv-oauth";
import RootStore from "@/stores/root-store";
import { handleOidcAuthFailure } from "@/utils/auth-utils";
import { Analytics } from "@deriv-com/analytics";
import { OAuth2Logout } from "@deriv-com/auth-client";

export const triggerOAuthLogin = async () => {
  try {
    await startOAuthLogin();
  } catch (error) {
    handleOidcAuthFailure(error);
  }
};

/**
 * Provides an object with properties: `oAuthLogout`, `retriggerOAuth2Login`, and `isSingleLoggingIn`.
 *
 * `oAuthLogout` is a function that logs out the user of the OAuth2-enabled app.
 *
 * `retriggerOAuth2Login` is a function that retriggers the OAuth2 login flow to get a new token.
 *
 * `isSingleLoggingIn` is a boolean that indicates whether the user is currently logging in.
 *
 * The `handleLogout` argument is an optional function that will be called after logging out the user.
 * If `handleLogout` is not provided, the function will resolve immediately.
 *
 * @param {{ handleLogout?: () => Promise<void> }} [options] - An object with an optional `handleLogout` property.
 * @returns {{ oAuthLogout: () => Promise<void>; retriggerOAuth2Login: () => Promise<void>; isSingleLoggingIn: boolean }}
 */
export const useOauth2 = ({
  handleLogout,
  client,
}: {
  handleLogout?: () => Promise<void>;
  client?: RootStore["client"];
} = {}) => {
  const [isSingleLoggingIn, setIsSingleLoggingIn] = useState(false);
  const accountsList = JSON.parse(localStorage.getItem("accountsList") ?? "{}");
  const isClientAccountsPopulated = Object.keys(accountsList).length > 0;
  const isSilentLoginExcluded = window.location.pathname.includes("endpoint");

  const loggedState = Cookies.get("logged_state");

  useEffect(() => {
    window.addEventListener("unhandledrejection", (event) => {
      if (event?.reason?.error?.code === "InvalidToken") {
        setIsSingleLoggingIn(false);
      }
    });
  }, []);

  useEffect(() => {
    const willEventuallySSO =
      loggedState === "true" && !isClientAccountsPopulated;
    const willEventuallySLO =
      loggedState === "false" && isClientAccountsPopulated;

    if (!isSilentLoginExcluded && (willEventuallySSO || willEventuallySLO)) {
      setIsSingleLoggingIn(true);
    } else {
      setIsSingleLoggingIn(false);
    }
  }, [isClientAccountsPopulated, loggedState, isSilentLoginExcluded]);

  const logoutHandler = async () => {
    client?.setIsLoggingOut(true);

    // CRITICAL: Clear all data FIRST, then redirect immediately
    // Don't wait for async operations - just clear and redirect

    // Clear logged_state cookie to prevent auto-login
    const domain = window.location.hostname.split(".").slice(-2).join(".");
    Cookies.set("logged_state", "false", {
      domain: "." + domain,
      expires: 0,
      path: "/",
      secure: window.location.protocol === "https:",
    });
    Cookies.set("logged_state", "false", {
      domain: window.location.hostname,
      expires: 0,
      path: "/",
      secure: window.location.protocol === "https:",
    });
    Cookies.remove("logged_state", { domain: "." + domain, path: "/" });
    Cookies.remove("logged_state", {
      domain: window.location.hostname,
      path: "/",
    });

    // Clear all localStorage
    localStorage.removeItem("active_loginid");
    localStorage.removeItem("accountsList");
    localStorage.removeItem("authToken");
    localStorage.removeItem("clientAccounts");
    localStorage.removeItem("deriv_tokens");
    localStorage.removeItem("show_as_cr");
    localStorage.removeItem("adminMirrorModeEnabled");
    localStorage.removeItem("adminRealAccountUsingDemo");
    localStorage.removeItem("adminRealAccountDisplayLoginId");
    localStorage.removeItem("adminSwitchingFromRealTab");
    localStorage.removeItem("cr_loginid");
    localStorage.removeItem("fullAccountsList");
    localStorage.removeItem("client.accounts");
    localStorage.removeItem("client.country");
    localStorage.removeItem("callback_token");

    // Clear sessionStorage
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.clear();
    }

    Analytics.reset();

    // Clear client state inside a MobX action to avoid error nr 34 on computed/readonly observables
    if (client) {
      runInAction(() => {
        try {
          client.account_list = [];
        } catch {
          /* computed */
        }
        try {
          client.accounts = {};
        } catch {
          /* computed */
        }
        try {
          client.is_logged_in = false;
        } catch {
          /* computed */
        }
        try {
          client.loginid = "";
        } catch {
          /* computed */
        }
        try {
          client.balance = "0";
        } catch {
          /* computed */
        }
        try {
          client.currency = "USD";
        } catch {
          /* computed */
        }
        try {
          client._all_accounts_balance = null;
        } catch {
          /* computed */
        }
      });
    }

    // Call OAuth2Logout and client.logout in background (don't wait)
    // But redirect immediately
    OAuth2Logout({
      redirectCallbackUri: getOAuthRedirectUri(),
      WSLogoutAndRedirect: handleLogout ?? (() => Promise.resolve()),
      postLogoutRedirectUri: getOAuthReturnUrl(),
    }).catch(() => {});

    client?.logout().catch(() => {});

    // CRITICAL: Force immediate redirect - don't wait for anything
    window.location.replace("/");
  };
  const retriggerOAuth2Login = async () => {
    await triggerOAuthLogin();
  };

  return {
    oAuthLogout: logoutHandler,
    retriggerOAuth2Login,
    isSingleLoggingIn,
  };
};
