import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cookies from "js-cookie";
import { removeCookies } from "@/components/shared/utils/storage/storage";
import { api_base } from "@/external/bot-skeleton";
import { setAuthData } from "@/external/bot-skeleton/services/api/observables/connection-status-stream";
import { triggerOAuthLogin } from "@/hooks/auth/useOauth2";
import { TAuthData } from "@/types/api-types";
import { isDemoLoginId } from "@/utils/account-prefixes";
import { requestSessionActive } from "@deriv-com/auth-client";

// Extend Window interface to include is_tmb_enabled property
declare global {
  interface Window {
    is_tmb_enabled?: boolean;
  }
}

type UseTMBReturn = {
  handleLogout: () => void;
  isOAuth2Enabled: boolean;
  is_tmb_enabled: boolean;
  onRenderTMBCheck: (
    fromLoginButton?: boolean,
    setIsAuthenticating?: (value: boolean) => void,
  ) => Promise<void>;
  isTmbEnabled: () => Promise<boolean>;
  isInitialized: boolean;
  isTmbCheckComplete: boolean;
};

interface TokenItem {
  loginid?: string;
  token?: string;
  cur?: string;
}

interface TMBWebsocketTokens {
  active: boolean;
  tokens: TokenItem[];
  [key: string]: any;
}

const TMBState = {
  isInitialized: false,
  checkInProgress: false,
};

const useTMB = (): UseTMBReturn => {
  const hasLoggedRef = useRef(false);

  if (!hasLoggedRef.current) {
    hasLoggedRef.current = true;
  }

  const domains = useMemo(
    () => [
      "deriv.com",
      "deriv.dev",
      "binary.sx",
      "pages.dev",
      "localhost",
      "deriv.be",
      "deriv.me",
      "https://hh6ws6mh-3000.inc1.devtunnels.ms/",
      "https://www.kingsmantradinghub.com/",
    ],
    [],
  );
  const currentDomain = useMemo(
    () => window.location.hostname.split(".").slice(-2).join("."),
    [],
  );
  const is_local_environment = useMemo(() => {
    const { hostname } = window.location;

    return (
      ["localhost", "127.0.0.1"].includes(hostname) ||
      hostname.endsWith(".devtunnels.ms") ||
      hostname.includes(".devtunnels.ms")
    );
  }, []);

  const is_staging = useMemo(
    () => window.location.hostname.includes("staging"),
    [],
  );
  const is_production = useMemo(() => !is_staging, [is_staging]);
  const supportsActiveSessionRequest = useMemo(() => {
    const { hostname } = window.location;

    return !(
      hostname.endsWith(".vercel.app") ||
      hostname === "kingsmantradinghub.com" ||
      hostname.endsWith(".kingsmantradinghub.com") ||
      hostname.endsWith(".devtunnels.ms") ||
      hostname.includes(".devtunnels.ms")
    );
  }, []);
  const isOAuth2Enabled = useMemo(
    () => !is_local_environment && (is_production || is_staging),
    [is_local_environment, is_production, is_staging],
  );
  const [is_tmb_enabled, setIsTmbEnabled] = useState(false);
  const [, setIsApiInitialized] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTmbCheckComplete, setIsTmbCheckComplete] = useState(false);
  const authTokenRef = useRef(localStorage.getItem("authToken"));
  const activeSessionsRef = useRef<TMBWebsocketTokens | undefined>(undefined);

  const getActiveSessions = useCallback(async (): Promise<
    TMBWebsocketTokens | undefined
  > => {
    if (!supportsActiveSessionRequest) {
      return undefined;
    }

    try {
      return (await requestSessionActive()) as TMBWebsocketTokens;
    } catch (error) {
      // eslint-disable-next-line no-console
      return undefined;
    }
  }, [supportsActiveSessionRequest]);

  const processTokens = useCallback((tokens: TokenItem[]) => {
    const accountsList: Record<string, string> = {};
    const clientAccounts: Record<
      string,
      { loginid: string; token: string; currency: string }
    > = {};

    tokens.forEach((token: TokenItem) => {
      if (token.loginid && token.token) {
        accountsList[token.loginid] = token.token;
        clientAccounts[token.loginid] = {
          loginid: token.loginid,
          token: token.token,
          currency: token.cur || "",
        };
      }
    });

    return { accountsList, clientAccounts };
  }, []);

  // Use a ref to track if we've already determined TMB status
  const tmbStatusDeterminedRef = useRef(false);
  const tmbStatusPromiseRef = useRef<Promise<boolean> | null>(null);

  const isTmbEnabled = useCallback(async () => {
    // If we've already determined the status, return the cached value
    if (tmbStatusDeterminedRef.current) {
      return window.is_tmb_enabled === true;
    }

    // If we're already in the process of determining the status, wait for that promise
    if (tmbStatusPromiseRef.current) {
      return tmbStatusPromiseRef.current;
    }

    // Create a new promise to determine the status
    tmbStatusPromiseRef.current = (async () => {
      try {
        if (!isOAuth2Enabled) {
          window.is_tmb_enabled = false;
          setIsTmbEnabled(false);
          tmbStatusDeterminedRef.current = true;
          return false;
        }

        // Check if we have a manually set value in localStorage
        const storedValue = localStorage.getItem("is_tmb_enabled");

        // If localStorage value is explicitly set, use that value
        if (storedValue === "true") {
          window.is_tmb_enabled = true;
          setIsTmbEnabled(true);
          tmbStatusDeterminedRef.current = true;
          return true;
        } else if (storedValue === "false") {
          window.is_tmb_enabled = false;
          setIsTmbEnabled(false);
          tmbStatusDeterminedRef.current = true;
          return false;
        }

        // Otherwise, use the API value
        const url = is_staging
          ? "https://app-config-staging.firebaseio.com/remote_config/oauth/is_tmb_enabled.json"
          : "https://app-config-prod.firebaseio.com/remote_config/oauth/is_tmb_enabled.json";
        const response = await fetch(url);
        const result = await response.json();

        const isEnabled = !!result.dbot;

        // Update window property with API value and mark as determined
        window.is_tmb_enabled = isEnabled;
        setIsTmbEnabled(isEnabled);
        tmbStatusDeterminedRef.current = true;
        return isEnabled;
      } catch (e) {
        // eslint-disable-next-line no-console

        // Check if we have a manually set value in localStorage
        const storedValue = localStorage.getItem("is_tmb_enabled");

        // If localStorage value is explicitly set, use that value
        if (storedValue === "true") {
          window.is_tmb_enabled = true;
          setIsTmbEnabled(true);
          tmbStatusDeterminedRef.current = true;
          return true;
        } else if (storedValue === "false") {
          window.is_tmb_enabled = false;
          setIsTmbEnabled(false);
          tmbStatusDeterminedRef.current = true;
          return false;
        }

        // By default it will fallback to false if firebase error happens
        window.is_tmb_enabled = false;
        setIsTmbEnabled(false);
        tmbStatusDeterminedRef.current = true;
        return false;
      }
    })();

    return tmbStatusPromiseRef.current;
  }, [isOAuth2Enabled, is_staging]);

  // Initialize the hook and check TMB status - only run once
  useEffect(() => {
    if (TMBState.isInitialized) {
      return; // Only run initialization once
    }

    TMBState.isInitialized = true;

    // Don't set states to true until all async operations are complete
    setIsInitialized(false);
    setIsTmbCheckComplete(false);

    // Add a safety timeout to ensure the hook always completes initialization
    const safetyTimeout = setTimeout(() => {
      setIsInitialized(true);
      setIsTmbCheckComplete(true);
    }, 2500);

    const initializeHook = async () => {
      try {
        // Pre-fetch active sessions if needed
        if (
          isOAuth2Enabled &&
          window.is_tmb_enabled &&
          supportsActiveSessionRequest
        ) {
          try {
            // This is a critical step - we need to await this
            const activeSessions = await getActiveSessions();
            activeSessionsRef.current = activeSessions;

            // Process tokens in advance if available
            if (
              activeSessions?.active &&
              Array.isArray(activeSessions.tokens) &&
              activeSessions.tokens.length > 0
            ) {
              const { accountsList, clientAccounts } = processTokens(
                activeSessions.tokens,
              );
              localStorage.setItem(
                "accountsList",
                JSON.stringify(accountsList),
              );
              localStorage.setItem(
                "clientAccounts",
                JSON.stringify(clientAccounts),
              );
            }
          } catch (error) {
          } finally {
            setIsApiInitialized(true);
          }
        } else {
          setIsApiInitialized(true);
        }

        // Only after all operations are complete, mark as initialized
        setIsInitialized(true);
        setIsTmbCheckComplete(true);

        // Clear the safety timeout since we completed normally
        clearTimeout(safetyTimeout);
      } catch (error) {
        // Still mark as initialized to avoid blocking the app completely
        setIsInitialized(true);
        setIsTmbCheckComplete(true);

        // Clear the safety timeout since we're handling the error
        clearTimeout(safetyTimeout);
      }
    };

    // Start initialization immediately
    initializeHook();

    // Clean up the safety timeout if the component unmounts
    return () => {
      clearTimeout(safetyTimeout);
    };
  }, [
    isOAuth2Enabled,
    isTmbEnabled,
    processTokens,
    getActiveSessions,
    supportsActiveSessionRequest,
  ]);

  const logout = useCallback(async () => {
    try {
      localStorage.removeItem("authToken");
      localStorage.removeItem("active_loginid");
      localStorage.removeItem("clientAccounts");
      localStorage.removeItem("accountsList");
      // Go to logged out version of the app instead of redirecting to OAuth
      window.location.reload();
    } catch (error) {
      // eslint-disable-next-line no-console
      return handleLogout();
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      if (authTokenRef.current) await logout();
    } catch (error) {
      // eslint-disable-next-line no-console
    }
    removeCookies(
      "affiliate_token",
      "affiliate_tracking",
      "utm_data",
      "onfido_token",
      "gclid",
    );
    if (domains.includes(currentDomain)) {
      Cookies.set("logged_state", "false", {
        domain: currentDomain,
        expires: 30,
        path: "/",
        secure: true,
      });
    }
  }, [logout, domains, currentDomain]);

  // Get account from URL query parameter
  const getAccountFromURL = useCallback(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("account");
  }, []);

  const onRenderTMBCheck = useCallback(
    async (
      fromLoginButton = false,
      setIsAuthenticating?: (value: boolean) => void,
    ) => {
      if (TMBState.checkInProgress) return;

      TMBState.checkInProgress = true;

      try {
        // Use pre-fetched active sessions if available, otherwise fetch them
        if (!window.is_tmb_enabled) {
          return;
        }
        if (!supportsActiveSessionRequest && !fromLoginButton) {
          return;
        }
        let activeSessions = activeSessionsRef.current;

        if (!activeSessions && window.is_tmb_enabled) {
          activeSessions = await getActiveSessions();
          activeSessionsRef.current = activeSessions;
        }

        // Only redirect if explicitly from login button
        if (!activeSessions?.active && fromLoginButton) {
          TMBState.checkInProgress = false;
          if (setIsAuthenticating) {
            setIsAuthenticating(false);
          }
          try {
            await triggerOAuthLogin();
          } catch (error) {
            if (setIsAuthenticating) {
              setIsAuthenticating(false);
            }
            return handleLogout();
          }
          return;
        } else if (activeSessions?.active) {
          if (
            Array.isArray(activeSessions.tokens) &&
            activeSessions.tokens.length > 0
          ) {
            const { accountsList, clientAccounts } = processTokens(
              activeSessions.tokens,
            );

            localStorage.setItem("accountsList", JSON.stringify(accountsList));
            localStorage.setItem(
              "clientAccounts",
              JSON.stringify(clientAccounts),
            );

            const accountParam = getAccountFromURL();

            let selectedToken = activeSessions.tokens[0];
            if (accountParam) {
              if (accountParam === "demo") {
                const demoToken = activeSessions.tokens.find(
                  (token: TokenItem) => isDemoLoginId(token.loginid),
                );
                if (demoToken) {
                  selectedToken = demoToken;
                }
              } else {
                const matchingToken = activeSessions.tokens.find(
                  (token: TokenItem) => token.cur === accountParam,
                );
                if (matchingToken) {
                  selectedToken = matchingToken;
                }
              }
            }

            if (selectedToken.loginid && selectedToken.token) {
              localStorage.setItem("authToken", selectedToken.token);
              localStorage.setItem("active_loginid", selectedToken.loginid);

              authTokenRef.current = selectedToken.token;

              if (api_base) {
                api_base.init(true).then(() => {
                  if (selectedToken.loginid) {
                    setAuthData({
                      loginid: selectedToken.loginid,
                      currency: selectedToken.cur || "",
                      token: selectedToken.token,
                    } as TAuthData & { token: string });
                  }
                });
              }
            }
          }

          if (domains.includes(currentDomain)) {
            Cookies.set("logged_state", "true", {
              domain: currentDomain,
              expires: 30,
              path: "/",
              secure: true,
            });
          }
        }
      } finally {
        TMBState.checkInProgress = false;
        if (setIsAuthenticating) {
          setIsAuthenticating(false);
        }
      }
    },
    [
      getActiveSessions,
      handleLogout,
      processTokens,
      domains,
      currentDomain,
      supportsActiveSessionRequest,
    ],
  );

  return useMemo(
    () => ({
      handleLogout,
      isOAuth2Enabled,
      is_tmb_enabled,
      onRenderTMBCheck,
      isTmbEnabled,
      isInitialized,
      isTmbCheckComplete,
    }),
    [
      handleLogout,
      isOAuth2Enabled,
      is_tmb_enabled,
      onRenderTMBCheck,
      isTmbEnabled,
      isInitialized,
      isTmbCheckComplete,
    ],
  );
};

export default useTMB;
