import Cookies from "js-cookie";
import CommonStore from "@/stores/common-store";
import { TAuthData } from "@/types/api-types";
import { clearAuthData } from "@/utils/auth-utils";
import {
  buildOAuthAuthorizeData,
  clearStoredOAuthWebSocketUrl,
  isOAuthSessionActive,
  prepareOAuthConnectionForAccount,
} from "@/utils/deriv-oauth";
import { observer as globalObserver } from "../../utils/observer";
import { doUntilDone, socket_state } from "../tradeEngine/utils/helpers";
import {
  CONNECTION_STATUS,
  setAccountList,
  setAuthData,
  setConnectionStatus,
  setIsAuthorized,
  setIsAuthorizing,
} from "./observables/connection-status-stream";
import ApiHelpers from "./api-helpers";
import {
  generateDerivApiInstance,
  getCurrentConnectionAppId,
  hasAppIdChanged,
  V2GetActiveClientId,
  V2GetActiveToken,
  waitForSocketOpen,
} from "./appId";
import { getAppId } from "@/components/shared";
import chart_api from "./chart-api";

type CurrentSubscription = {
  id: string;
  unsubscribe: () => void;
};

type SubscriptionPromise = Promise<{
  subscription: CurrentSubscription;
}>;

const FALLBACK_SYNTHETIC_SYMBOLS = [
  ["R_10", "Volatility 10 Index"],
  ["R_25", "Volatility 25 Index"],
  ["R_50", "Volatility 50 Index"],
  ["R_75", "Volatility 75 Index"],
  ["R_100", "Volatility 100 Index"],
  ["1HZ10V", "Volatility 10 (1s) Index"],
  ["1HZ15V", "Volatility 15 (1s) Index"],
  ["1HZ25V", "Volatility 25 (1s) Index"],
  ["1HZ30V", "Volatility 30 (1s) Index"],
  ["1HZ50V", "Volatility 50 (1s) Index"],
  ["1HZ75V", "Volatility 75 (1s) Index"],
  ["1HZ90V", "Volatility 90 (1s) Index"],
  ["1HZ100V", "Volatility 100 (1s) Index"],
] as const;

const getFallbackSyntheticSymbols = () =>
  FALLBACK_SYNTHETIC_SYMBOLS.map(([symbol, display_name]) => ({
    display_name,
    exchange_is_open: true,
    is_trading_suspended: false,
    market: "synthetic_index",
    market_display_name: "Synthetic Indices",
    pip: 2,
    submarket: "random_index",
    submarket_display_name: "Random Indices",
    symbol,
    underlying_symbol: symbol,
  }));

type TApiBaseApi = {
  connection: {
    readyState: keyof typeof socket_state;
    addEventListener: (event: string, callback: () => void) => void;
    removeEventListener: (event: string, callback: () => void) => void;
  };
  send: (data: unknown) => void;
  disconnect: () => void;
  authorize: (
    token: string,
  ) => Promise<{ authorize: TAuthData; error: unknown }>;
  getSelfExclusion: () => Promise<unknown>;
  onMessage: () => {
    subscribe: (callback: (message: unknown) => void) => {
      unsubscribe: () => void;
    };
  };
} & ReturnType<typeof generateDerivApiInstance>;

class APIBase {
  api: TApiBaseApi | null = null;
  token: string = "";
  account_id: string = "";
  pip_sizes = {};
  account_info = {};
  is_running = false;
  subscriptions: CurrentSubscription[] = [];
  time_interval: ReturnType<typeof setInterval> | null = null;
  has_active_symbols = false;
  is_stopping = false;
  active_symbols = [];
  current_auth_subscriptions: SubscriptionPromise[] = [];
  is_authorized = false;
  active_symbols_promise: Promise<void> | null = null;
  common_store: CommonStore | undefined;
  landing_company: string | null = null;
  socket_open_handler = () => this.onsocketopen();
  socket_close_handler = () => this.onsocketclose();
  last_oauth_socket_error_code: string | null = null;
  is_initializing = false;
  suppress_disconnect_modal = false;
  oauth_reconnect_timeout: ReturnType<typeof setTimeout> | null = null;
  prefer_oauth_trading_socket = false;

  unsubscribeAllSubscriptions = () => {
    this.current_auth_subscriptions?.forEach((subscription_promise) => {
      subscription_promise.then(({ subscription }) => {
        if (subscription?.id && this.api?.connection?.readyState === 1) {
          this.api?.send({
            forget: subscription.id,
          });
        }
      });
    });
    this.current_auth_subscriptions = [];
  };

  onsocketopen() {
    setConnectionStatus(CONNECTION_STATUS.OPENED);
  }

  onsocketclose() {
    setConnectionStatus(CONNECTION_STATUS.CLOSED);

    const active_token = this.token || V2GetActiveToken() || "";
    if (active_token && isOAuthSessionActive(active_token)) {
      this.is_authorized = false;
      setIsAuthorized(false);
      if (this.suppress_disconnect_modal || this.prefer_oauth_trading_socket) {
        return;
      }
      if (this.oauth_reconnect_timeout) {
        clearTimeout(this.oauth_reconnect_timeout);
      }
      const reconnect_delay =
        this.last_oauth_socket_error_code === "OAuthSocketOpenFailed"
          ? 1200
          : 400;
      this.oauth_reconnect_timeout = setTimeout(() => {
        this.oauth_reconnect_timeout = null;
        this.reconnectIfNotConnected();
      }, reconnect_delay);
      return;
    }

    this.reconnectIfNotConnected();
  }

  async init(force_create_connection = false) {
    if (this.is_initializing) {
      return;
    }
    this.is_initializing = true;
    this.toggleRunButton(true);

    if (this.api) {
      this.unsubscribeAllSubscriptions();
    }

    if (
      !this.api ||
      this.api?.connection.readyState !== 1 ||
      force_create_connection
    ) {
      if (this.api?.connection) {
        this.api.connection.removeEventListener(
          "open",
          this.socket_open_handler,
        );
        this.api.connection.removeEventListener(
          "close",
          this.socket_close_handler,
        );
        ApiHelpers.disposeInstance();
        setConnectionStatus(CONNECTION_STATUS.CLOSED);
        this.api.disconnect();
      }

      const active_token = V2GetActiveToken();
      if (active_token && isOAuthSessionActive(active_token)) {
        try {
          const result = await prepareOAuthConnectionForAccount(
            V2GetActiveClientId(),
            active_token,
          );
        } catch (error) {
          this.api = null;
          this.is_authorized = false;
          setIsAuthorized(false);
          setIsAuthorizing(false);
          this.toggleRunButton(false);
          this.is_initializing = false;
          return;
        }
      }

      this.api = generateDerivApiInstance(null);
      this.api?.connection.addEventListener("open", this.socket_open_handler);
      this.api?.connection.addEventListener("close", this.socket_close_handler);
    }

    if (!this.has_active_symbols && !V2GetActiveToken()) {
      this.active_symbols_promise = this.getActiveSymbols();
    }

    this.initEventListeners();

    if (this.time_interval) clearInterval(this.time_interval);
    this.time_interval = null;

    const current_token = V2GetActiveToken();

    if (current_token) {
      setIsAuthorizing(true);
      await this.authorizeAndSubscribe();
    }

    if (
      !current_token ||
      !isOAuthSessionActive(current_token) ||
      this.is_authorized
    ) {
      chart_api.init(force_create_connection);
    }

    this.is_initializing = false;
  }

  getConnectionStatus() {
    if (this.api?.connection) {
      const ready_state = this.api.connection.readyState;
      return (
        socket_state[ready_state as keyof typeof socket_state] || "Unknown"
      );
    }
    return "Socket not initialized";
  }

  /**
   * Ensure the WebSocket connection is using the current app_id from localStorage
   * If app_id has changed, reconnect safely (only when no active trades)
   */
  async ensureCurrentAppId() {
    // Only check if we have an active connection
    if (!this.api || this.api?.connection.readyState !== 1) {
      return;
    }

    // Check if app_id has changed
    if (hasAppIdChanged()) {
      const oldAppId = getCurrentConnectionAppId();
      const newAppId = getAppId();

      // Check if we're currently running trades - if so, don't reconnect (causes logout)
      if (this.is_running) {
        return;
      }

      // Safe to reconnect - no active trades
      const token = V2GetActiveToken();
      const savedAccountId = this.account_id;

      if (!token) {
        return;
      }

      try {
        // Save token before reconnecting
        this.token = token;

        // Reconnect
        await this.init(true);

        if (isOAuthSessionActive(token)) {
          if (this.is_authorized) {
          } else {
          }
          return;
        }

        // Wait for connection to be ready
        if (this.api && this.api.connection) {
          await new Promise<void>((resolve) => {
            if (this.api?.connection.readyState === 1) {
              resolve();
            } else {
              const onOpen = () => {
                this.api?.connection?.removeEventListener("open", onOpen);
                resolve();
              };
              this.api?.connection?.addEventListener("open", onOpen);
              setTimeout(() => resolve(), 5000); // Timeout after 5 seconds
            }
          });
        }

        // Re-authorize with saved token
        if (this.api && this.api.connection.readyState === 1) {
          const { authorize, error } = await this.api.authorize(token);
          if (error) {
            throw error;
          } else {
            this.account_id = savedAccountId;
            this.account_info = authorize;
            setAccountList(authorize?.account_list || []);
            setAuthData(authorize);
            setIsAuthorized(true);
            this.is_authorized = true;
          }
        }
      } catch (err) {
        // If reconnection fails, the old connection should still work
      }
    }
  }

  /**
   * Reconnect WebSocket with new app_id after trade completion or bot stop
   * This is safe because:
   * - Trade is already complete or bot is stopped
   * - We're between trades (no active trade to interrupt)
   * - We preserve the token and re-authorize automatically
   * - Also reconnects chart-api with new app ID
   */
  async reconnectWithNewAppId(forceReconnect = false) {
    // Check if app_id has changed, or force reconnect
    if (!forceReconnect && !hasAppIdChanged()) {
      return; // No change needed
    }

    const oldAppId = getCurrentConnectionAppId();
    const newAppId = getAppId();
    const token = V2GetActiveToken();

    if (!token) {
      return;
    }

    // Only reconnect if app ID actually changed
    if (!forceReconnect && oldAppId === newAppId) {
      return;
    }

    // Save token before reconnecting
    const savedToken = token;
    const savedAccountId = this.account_id;

    // Reconnect main API with new app_id
    await this.init(true);

    if (isOAuthSessionActive(savedToken)) {
      if (this.is_authorized) {
      } else {
      }
    }

    // Wait for connection to be ready
    if (!isOAuthSessionActive(savedToken) && this.api?.connection) {
      await new Promise<void>((resolve) => {
        if (this.api?.connection.readyState === 1) {
          resolve();
        } else {
          const onOpen = () => {
            this.api?.connection?.removeEventListener("open", onOpen);
            resolve();
          };
          this.api?.connection?.addEventListener("open", onOpen);
          setTimeout(() => resolve(), 5000); // Timeout after 5 seconds
        }
      });
    }

    // Re-authorize with saved token (init() should do this, but ensure it happens)
    if (
      savedToken &&
      !isOAuthSessionActive(savedToken) &&
      this.api &&
      this.api.connection.readyState === 1
    ) {
      try {
        const { authorize, error } = await this.api.authorize(savedToken);
        if (error) {
        } else {
          this.account_id = savedAccountId;
          // Restore account info
          this.account_info = authorize;
          setAccountList(authorize?.account_list || []);
          setAuthData(authorize);
          setIsAuthorized(true);
          this.is_authorized = true;
        }
      } catch (err) {}
    }

    // Also reconnect chart-api with new app ID (silent background operation)
    try {
      await chart_api.init(true);
    } catch (err) {}
  }

  terminate() {
    // eslint-disable-next-line no-console
    if (this.api) this.api.disconnect();
  }

  initEventListeners() {
    if (window) {
      window.addEventListener("online", this.reconnectIfNotConnected);
      window.addEventListener("focus", this.reconnectIfNotConnected);
    }
  }

  async createNewInstance(account_id: string) {
    if (this.account_id !== account_id) {
      await this.init();
    }
  }

  async ensureOAuthTradingSocket(context = "unknown") {
    const active_token = V2GetActiveToken() || this.token || "";
    if (!active_token || !isOAuthSessionActive(active_token)) {
      return true;
    }

    const current_socket_url = (
      (this.api?.connection as unknown as { url?: string })?.url || ""
    ).replace(/otp=[^&]+/i, "otp=***");
    const is_otp_socket = current_socket_url.includes("api.derivws.com");

    if (is_otp_socket && this.is_authorized) {
      return true;
    }

    this.suppress_disconnect_modal = true;
    this.prefer_oauth_trading_socket = true;

    try {
      if (this.oauth_reconnect_timeout) {
        clearTimeout(this.oauth_reconnect_timeout);
        this.oauth_reconnect_timeout = null;
      }
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        clearStoredOAuthWebSocketUrl();
        await this.init(true);

        const refreshed_socket_url = (
          (this.api?.connection as unknown as { url?: string })?.url || ""
        ).replace(/otp=[^&]+/i, "otp=***");
        const has_otp_socket = refreshed_socket_url.includes("api.derivws.com");

        if (has_otp_socket && this.is_authorized) {
          return true;
        }

        if (attempt < 5) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }

      return false;
    } finally {
      this.prefer_oauth_trading_socket = false;
      this.suppress_disconnect_modal = false;
    }
  }

  reconnectIfNotConnected = () => {
    // eslint-disable-next-line no-console
    if (
      this.api?.connection?.readyState &&
      this.api?.connection?.readyState > 1
    ) {
      // eslint-disable-next-line no-console
      this.init(true);
    }
  };

  setAuthorizedState(authorize: TAuthData) {
    this.account_info = authorize;
    setAccountList(authorize?.account_list || []);
    setAuthData(authorize);
    setIsAuthorized(true);
    this.is_authorized = true;
    localStorage.setItem(
      "client_account_details",
      JSON.stringify(authorize?.account_list),
    );
    localStorage.setItem("client.country", authorize?.country);
  }

  async waitForOAuthSocketOpen() {
    if (!this.api) {
      return {
        loginid: "",
        error: {
          code: "OAuthSocketMissing",
          message: "OAuth WebSocket connection was not created.",
        },
      };
    }

    const loginid = this.account_id || V2GetActiveClientId() || "";
    if (!loginid) {
      return {
        loginid: "",
        error: {
          code: "OAuthAccountMissing",
          message: "No active OAuth account is selected.",
        },
      };
    }

    try {
      await waitForSocketOpen(this.api.connection, {
        is_oauth: true,
        loginid,
      });

      return {
        loginid,
        error: undefined,
      };
    } catch (error) {
      return {
        loginid,
        error:
          error instanceof Error
            ? {
                code: "OAuthSocketOpenFailed",
                message: error.message,
              }
            : error,
      };
    }
  }

  async requestOAuthBalanceSnapshot(loginid: string) {
    const socket_url = (
      (this.api?.connection as unknown as { url?: string })?.url || ""
    ).replace(/otp=[^&]+/i, "otp=***");
    const is_oauth_otp_socket = socket_url.includes("api.derivws.com");
    if (
      !this.api ||
      this.api.connection.readyState !== 1 ||
      is_oauth_otp_socket
    )
      return;

    try {
      const balance_response = await this.api.send({ balance: 1 });
      const balance_error = balance_response?.error;

      if (balance_error) {
        return;
      }

      const authorize = buildOAuthAuthorizeData(loginid, {
        balance: balance_response?.balance?.balance,
        currency: balance_response?.balance?.currency,
      });
      this.setAuthorizedState(authorize);
    } catch (error) {}
  }

  async authorizeAndSubscribe() {
    const token = V2GetActiveToken();
    if (!token || !this.api) {
      setIsAuthorizing(false);
      this.toggleRunButton(false);
      return;
    }

    this.token = token;
    this.account_id = V2GetActiveClientId() ?? "";
    const is_oauth_session = isOAuthSessionActive(this.token);
    setIsAuthorizing(true);

    try {
      if (is_oauth_session) {
        let active_loginid = this.account_id || V2GetActiveClientId() || "";
        let socket_is_otp = false;

        const { loginid: otp_loginid, error: otp_error } =
          await this.waitForOAuthSocketOpen();

        if (otp_error) {
          const error_code = (otp_error as { code?: string })?.code ?? null;
          this.last_oauth_socket_error_code = error_code;

          if (error_code === "OAuthSocketOpenFailed") {
            if (this.prefer_oauth_trading_socket) {
              this.is_authorized = false;
              setIsAuthorized(false);
              return otp_error;
            }
            if (this.api?.connection) {
              this.api.connection.removeEventListener(
                "open",
                this.socket_open_handler,
              );
              this.api.connection.removeEventListener(
                "close",
                this.socket_close_handler,
              );
              try {
                this.api.disconnect();
              } catch {
                /* ignore */
              }
            }
            clearStoredOAuthWebSocketUrl();
            this.api = generateDerivApiInstance(null) as TApiBaseApi;
            this.api.connection.addEventListener(
              "open",
              this.socket_open_handler,
            );
            this.api.connection.addEventListener(
              "close",
              this.socket_close_handler,
            );
            try {
              await waitForSocketOpen(this.api.connection, {
                is_oauth: false,
                loginid: active_loginid,
              });
              socket_is_otp = false;
            } catch (legacy_fail) {
              this.is_authorized = false;
              setIsAuthorized(false);
              return;
            }
          } else {
            this.is_authorized = false;
            setIsAuthorized(false);
            return otp_error;
          }
        } else {
          active_loginid = otp_loginid;
          const socket_url =
            (this.api?.connection as unknown as { url?: string })?.url ?? "";
          socket_is_otp = socket_url.includes("api.derivws.com");
        }

        this.last_oauth_socket_error_code = null;
        const session_state = buildOAuthAuthorizeData(active_loginid);

        if (!socket_is_otp) {
          // OAuth tokens cannot authorize on legacy socket (only CR/VRTC legacy tokens work there)
          // Use session state from localStorage to mark the UI as logged in
          this.setAuthorizedState(session_state);

          if (this.has_active_symbols) {
            this.toggleRunButton(false);
          } else {
            this.active_symbols_promise = this.getActiveSymbols();
          }
          return;
        }

        // OTP socket: pre-authorized
        this.setAuthorizedState(session_state);
        if (this.has_active_symbols) {
          this.toggleRunButton(false);
        } else {
          this.active_symbols_promise = this.getActiveSymbols();
        }
        this.subscribe();
        return;
      }

      const { authorize, error } = await this.api.authorize(this.token);
      if (error) {
        this.last_oauth_socket_error_code = null;
        this.is_authorized = false;
        setIsAuthorized(false);
        if (error.code === "InvalidToken") {
          const is_tmb_enabled = window.is_tmb_enabled === true;
          if (Cookies.get("logged_state") === "true" && !is_tmb_enabled) {
            globalObserver.emit("InvalidToken", { error });
          } else {
            clearAuthData();
          }
        } else {
        }
        return error;
      }

      this.last_oauth_socket_error_code = null;
      this.setAuthorizedState(authorize);

      if (this.has_active_symbols) {
        this.toggleRunButton(false);
      } else {
        this.active_symbols_promise = this.getActiveSymbols();
      }
      this.subscribe();
      this.getSelfExclusion();
    } catch (e) {
      const is_oauth_session = isOAuthSessionActive(this.token);
      this.last_oauth_socket_error_code = is_oauth_session
        ? "OAuthSocketOpenFailed"
        : null;
      this.is_authorized = false;
      setIsAuthorized(false);
      if (!is_oauth_session) {
        clearAuthData();
      }
      globalObserver.emit("Error", e);
    } finally {
      setIsAuthorizing(false);
    }
  }

  async getSelfExclusion() {
    const socket_url = (
      (this.api?.connection as unknown as { url?: string })?.url || ""
    ).replace(/otp=[^&]+/i, "otp=***");
    const is_oauth_otp_socket = socket_url.includes("api.derivws.com");
    if (is_oauth_otp_socket) return;
    if (!this.api || !this.is_authorized) return;
    try {
      await this.api.getSelfExclusion();
    } catch (error) {}
  }

  async subscribe() {
    const is_oauth_otp_socket =
      this.api?.connection?.url?.includes?.("api.derivws.com");
    const subscribeToStream = (streamName: string) => {
      return doUntilDone(
        () => {
          const subscription = this.api?.send({
            [streamName]: 1,
            subscribe: 1,
            ...(streamName === "balance" && !is_oauth_otp_socket
              ? { account: "all" }
              : {}),
          });
          if (subscription) {
            this.current_auth_subscriptions.push(subscription);
          }
          return subscription;
        },
        [],
        this,
      );
    };

    const streamsToSubscribe = [
      "balance",
      "transaction",
      "proposal_open_contract",
    ];
    const results = await Promise.allSettled(
      streamsToSubscribe.map(subscribeToStream),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
      }
    });
  }

  getActiveSymbols = async () => {
    await doUntilDone(
      () => this.api?.send({ active_symbols: "brief" }),
      [],
      this,
    ).then(({ active_symbols = [], error = {} }) => {
      const response_symbols = Array.isArray(active_symbols)
        ? active_symbols.filter(Boolean)
        : [];
      const safe_active_symbols = response_symbols.length
        ? response_symbols
        : getFallbackSyntheticSymbols();
      const pip_sizes = {};
      if (safe_active_symbols.length) this.has_active_symbols = true;
      safe_active_symbols.forEach(
        (item: {
          symbol?: string;
          underlying_symbol?: string;
          pip?: string | number;
          pip_size?: string | number;
        }) => {
          const symbol = item?.underlying_symbol || item?.symbol;
          const raw_pip =
            item?.pip_size !== undefined ? item.pip_size : item?.pip;
          if (!symbol || raw_pip === undefined) return;
          (pip_sizes as Record<string, number>)[symbol] = +(+raw_pip)
            .toExponential()
            .substring(3);
        },
      );
      this.pip_sizes = pip_sizes as Record<string, number>;
      this.toggleRunButton(false);
      this.active_symbols = safe_active_symbols;
      return safe_active_symbols || error;
    });
  };

  toggleRunButton = (toggle: boolean) => {
    const run_button = document.querySelector("#db-animation__run-button");
    if (!run_button) return;
    (run_button as HTMLButtonElement).disabled = toggle;
  };

  setIsRunning(toggle = false) {
    this.is_running = toggle;
  }

  pushSubscription(subscription: CurrentSubscription) {
    this.subscriptions.push(subscription);
  }

  clearSubscriptions() {
    this.subscriptions.forEach((s) => s.unsubscribe());
    this.subscriptions = [];

    // Resetting timeout resolvers
    const global_timeouts = globalObserver.getState("global_timeouts") ?? [];

    global_timeouts.forEach((_: unknown, i: number) => {
      clearTimeout(i);
    });
  }
}

export const api_base = new APIBase();
