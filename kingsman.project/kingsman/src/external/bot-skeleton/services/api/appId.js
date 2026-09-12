import { DERIV_BRAND, getAppId, getSocketURL } from "@/components/shared";
import {
  getActiveTradingLoginId,
  getActiveTradingToken,
} from "@/utils/account-storage";
import {
  buildOAuthAuthorizeData,
  getStoredOAuthWebSocketUrl,
  isOAuthSessionActive,
} from "@/utils/deriv-oauth";
import DerivAPIBasic from "@deriv/deriv-api/dist/DerivAPIBasic";
import { getInitialLanguage } from "@deriv-com/translations";
import APIMiddleware from "./api-middleware";

// Track the app_id used for the current WebSocket connection
let currentConnectionAppId = null;

const createOAuthOtpApi = (connection) => {
  let nextReqId = 1;
  const pendingRequests = new Map();
  const messageSubscribers = new Set();
  const getActiveLoginId = () =>
    getActiveTradingLoginId() || localStorage.getItem("active_loginid") || "";
  const normalizeNumber = (value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  };
  const normalizeTradingParameters = (parameters) => {
    if (!parameters || typeof parameters !== "object") return parameters;

    const nextParameters = { ...parameters };
    if (nextParameters.symbol && !nextParameters.underlying_symbol) {
      nextParameters.underlying_symbol = nextParameters.symbol;
    }

    delete nextParameters.symbol;
    delete nextParameters.loginid;
    delete nextParameters.barrier_range;
    delete nextParameters.product_type;
    delete nextParameters.date_start;
    delete nextParameters.trade_risk_profile;
    delete nextParameters.trading_period_start;

    return nextParameters;
  };
  const normalizeTradingRequest = (payload) => {
    if (!payload || typeof payload !== "object") return payload;

    const request = { ...payload };
    delete request.loginid;

    if (request.proposal === 1) {
      if (request.symbol && !request.underlying_symbol) {
        request.underlying_symbol = request.symbol;
      }
      delete request.symbol;
      delete request.barrier_range;
      delete request.product_type;
      delete request.date_start;
      delete request.trade_risk_profile;
      delete request.trading_period_start;
    }

    if (request.buy !== undefined && request.parameters) {
      request.parameters = normalizeTradingParameters(request.parameters);
    }

    if (request.contract_update === 1) {
      delete request.loginid;
    }

    if (request.active_symbols !== undefined) {
      delete request.product_type;
      delete request.landing_company;
      delete request.landing_company_short;
      delete request.barrier_category;
    }

    if (request.contracts_for !== undefined) {
      delete request.currency;
      delete request.landing_company;
      delete request.landing_company_short;
      delete request.product_type;
    }

    return request;
  };
  const normalizeTradingResponse = (payload) => {
    if (!payload || typeof payload !== "object") return payload;

    const response = { ...payload };

    if (response.proposal && typeof response.proposal === "object") {
      response.proposal = {
        ...response.proposal,
        ask_price: normalizeNumber(response.proposal.ask_price),
        payout: normalizeNumber(response.proposal.payout),
        commission: normalizeNumber(response.proposal.commission),
      };
    }

    // active_symbols: backfill legacy field names so existing consumers still work
    if (Array.isArray(response.active_symbols)) {
      response.active_symbols = response.active_symbols.map((item) => {
        if (!item || typeof item !== "object") return item;
        const s = { ...item };
        if (s.underlying_symbol && !s.symbol) s.symbol = s.underlying_symbol;
        if (s.underlying_symbol_type && !s.symbol_type)
          s.symbol_type = s.underlying_symbol_type;
        if (s.underlying_symbol_name && !s.display_name)
          s.display_name = s.underlying_symbol_name;
        if (s.pip_size !== undefined && s.pip === undefined) s.pip = s.pip_size;
        // market/submarket display names are removed in new API — default to empty string
        if (!s.market_display_name) s.market_display_name = s.market || "";
        if (!s.submarket_display_name)
          s.submarket_display_name = s.submarket || "";
        return s;
      });
    }

    // portfolio: backfill symbol from underlying_symbol
    if (
      response.portfolio?.contracts &&
      Array.isArray(response.portfolio.contracts)
    ) {
      response.portfolio = {
        ...response.portfolio,
        contracts: response.portfolio.contracts.map((c) => {
          if (!c || typeof c !== "object") return c;
          if (c.underlying_symbol && !c.symbol)
            return { ...c, symbol: c.underlying_symbol };
          return c;
        }),
      };
    }

    // transaction: backfill symbol from underlying_symbol
    if (response.transaction && typeof response.transaction === "object") {
      const t = response.transaction;
      if (t.underlying_symbol && !t.symbol) {
        response.transaction = { ...t, symbol: t.underlying_symbol };
      }
    }

    // proposal_open_contract: normalize numeric fields that may arrive as strings
    if (
      response.proposal_open_contract &&
      typeof response.proposal_open_contract === "object"
    ) {
      const poc = response.proposal_open_contract;
      response.proposal_open_contract = {
        ...poc,
        ask_price: normalizeNumber(poc.ask_price),
        bid_price: normalizeNumber(poc.bid_price),
        buy_price: normalizeNumber(poc.buy_price),
        sell_price: normalizeNumber(poc.sell_price),
        payout: normalizeNumber(poc.payout),
        profit: normalizeNumber(poc.profit),
        profit_percentage: normalizeNumber(poc.profit_percentage),
        // entry_tick_display_value / exit_tick_display_value are deprecated and removed
        // in the New API — backfill from the raw tick value so existing consumers work
        entry_tick_display_value:
          poc.entry_tick_display_value ??
          (poc.entry_tick != null ? String(poc.entry_tick) : undefined),
        exit_tick_display_value:
          poc.exit_tick_display_value ??
          (poc.exit_tick != null ? String(poc.exit_tick) : undefined),
      };
    }

    return response;
  };

  const settlePendingRequest = (reqId, settle) => {
    if (reqId === undefined || reqId === null) return;
    const pending = pendingRequests.get(reqId);
    if (!pending) return;
    pendingRequests.delete(reqId);
    settle(pending);
  };

  connection.addEventListener("message", (event) => {
    let payload;

    try {
      payload = normalizeTradingResponse(JSON.parse(event.data));
    } catch (error) {
      console.error("[OAuth] Failed to parse OTP WebSocket message", error);
      return;
    }

    messageSubscribers.forEach((callback) => {
      try {
        callback({ data: payload });
      } catch (error) {
        console.error(
          "[OAuth] OTP WebSocket subscriber callback failed",
          error,
        );
      }
    });

    if (payload?.req_id === undefined || payload?.req_id === null) return;

    if (payload.error) {
      settlePendingRequest(payload.req_id, (pending) =>
        pending.reject(payload),
      );
      return;
    }

    settlePendingRequest(payload.req_id, (pending) => pending.resolve(payload));
  });

  connection.addEventListener("close", (event) => {
    pendingRequests.forEach(({ reject }) => {
      reject({
        error: {
          code: "SocketClosed",
          message: `OTP WebSocket closed. Code: ${event?.code ?? "unknown"}.`,
        },
      });
    });
    pendingRequests.clear();
  });

  const send = (payload) =>
    new Promise((resolve, reject) => {
      const request = normalizeTradingRequest(payload);

      // The OAuth OTP socket accepts balance subscriptions without the legacy account selector.
      if (
        request.balance === 1 &&
        request.subscribe === 1 &&
        request.account === "all"
      ) {
        delete request.account;
      }

      if (request.req_id === undefined || request.req_id === null) {
        request.req_id = nextReqId++;
      }

      pendingRequests.set(request.req_id, { resolve, reject });

      try {
        connection.send(JSON.stringify(request));
      } catch (error) {
        pendingRequests.delete(request.req_id);
        reject(error);
      }
    });

  const authorize = async (token) => {
    if (!isOAuthSessionActive(token)) {
      try {
        const authorize = await send({ authorize: token });
        return { authorize, error: undefined };
      } catch (error) {
        return { authorize: undefined, error };
      }
    }

    const loginid = getActiveLoginId();

    return {
      authorize: buildOAuthAuthorizeData(loginid),
      error: undefined,
    };
  };

  const buy = (payload) => send(payload);
  const forget = (payload) => send(payload);
  const forgetAll = (type) => send({ forget_all: type });

  return {
    connection,
    send,
    authorize,
    buy,
    forget,
    forgetAll,
    disconnect: () => connection.close(),
    getSelfExclusion: () => send({ get_self_exclusion: 1 }),
    onMessage: () => ({
      subscribe: (callback) => {
        messageSubscribers.add(callback);
        return {
          unsubscribe: () => {
            messageSubscribers.delete(callback);
          },
        };
      },
    }),
  };
};

export const waitForSocketOpen = (connection, context = {}) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let sawError = false;
    let fallbackErrorTimer = null;
    let settled = false;

    if (!connection) {
      reject(new Error("WebSocket connection was not created."));
      return;
    }

    if (connection.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    const cleanup = () => {
      if (fallbackErrorTimer) {
        clearTimeout(fallbackErrorTimer);
        fallbackErrorTimer = null;
      }
      connection.removeEventListener("open", handleOpen);
      connection.removeEventListener("error", handleError);
      connection.removeEventListener("close", handleClose);
    };

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const handleOpen = () => {
      settle(() => {
        console.log("[OAuth] OTP WebSocket opened", {
          loginid: context.loginid || "",
          elapsed_ms: Date.now() - startedAt,
          url: connection?.url?.replace(/otp=[^&]+/i, "otp=***") || "",
        });
        resolve();
      });
    };

    const handleError = () => {
      sawError = true;
      console.error("[OAuth] OTP WebSocket error event", {
        loginid: context.loginid || "",
        elapsed_ms: Date.now() - startedAt,
        url: connection?.url?.replace(/otp=[^&]+/i, "otp=***") || "",
        ready_state: connection?.readyState,
      });
      if (context.is_oauth) {
        // Don't settle here — let handleClose fire first so we capture the close code/reason.
        // Set a fallback in case the close event never follows.
        if (fallbackErrorTimer) clearTimeout(fallbackErrorTimer);
        fallbackErrorTimer = setTimeout(() => {
          settle(() =>
            reject(
              new Error(
                "OAuth account and OTP were created, but Deriv closed the OTP WebSocket before it opened.",
              ),
            ),
          );
        }, 500);
        return;
      }
      settle(() =>
        reject(new Error("Failed to open Deriv WebSocket connection.")),
      );
    };

    const handleClose = (event) => {
      const close_details = {
        code: event?.code,
        reason: event?.reason || "",
        wasClean: !!event?.wasClean,
        url: connection?.url?.replace(/otp=[^&]+/i, "otp=***") || "",
        loginid: context.loginid || "",
        elapsed_ms: Date.now() - startedAt,
      };

      console.error("[OAuth] OTP WebSocket closed before open", close_details);

      if (context.is_oauth) {
        const reason_suffix = event?.reason ? ` Reason: ${event.reason}` : "";
        settle(() =>
          reject(
            new Error(
              `OAuth account and OTP were created, but Deriv closed the OTP WebSocket before it opened${
                sawError ? " after a handshake error" : ""
              }. Close code: ${event?.code ?? "unknown"}.${reason_suffix}`,
            ),
          ),
        );
        return;
      }

      settle(() =>
        reject(
          new Error(
            `Deriv WebSocket closed before it opened. Close code: ${event?.code ?? "unknown"}.`,
          ),
        ),
      );
    };

    connection.addEventListener("open", handleOpen);
    connection.addEventListener("error", handleError);
    connection.addEventListener("close", handleClose);
  });

export const generateDerivApiInstance = (specificAppId = null) => {
  const cleanedServer = getSocketURL().replace(/[^a-zA-Z0-9.]/g, "");
  const appId = specificAppId !== null ? specificAppId : getAppId();
  const cleanedAppId =
    appId?.toString()?.replace?.(/[^a-zA-Z0-9]/g, "") ?? appId?.toString();
  const activeToken = localStorage.getItem("authToken");
  const isOAuth = isOAuthSessionActive(activeToken);
  const oauthWsUrl = isOAuth ? getStoredOAuthWebSocketUrl("api-base") : null;

  console.log("[WEBSOCKET] generateDerivApiInstance", {
    specificAppId,
    appId,
    isOAuth,
    hasOAuthWsUrl: !!oauthWsUrl,
    activeTokenPrefix: activeToken ? activeToken.slice(0, 12) + "..." : null,
    sessionKeys: Object.keys(sessionStorage).filter((k) =>
      k.startsWith("deriv"),
    ),
  });

  if (oauthWsUrl) {
    console.log("[WEBSOCKET] Creating OAuth OTP connection");
  } else if (isOAuth) {
    console.warn(
      "[OAuth] OAuth session active but no OTP URL in sessionStorage — will use legacy socket",
      {
        sessionKeys: Object.keys(sessionStorage),
      },
    );
  } else if (specificAppId === null) {
    const previousAppId = currentConnectionAppId;
    currentConnectionAppId = appId;

    if (previousAppId !== appId) {
      console.log(
        `[WEBSOCKET] Creating new connection with App ID ${appId} ${
          previousAppId
            ? `(changed from ${previousAppId})`
            : "(initial connection)"
        }`,
      );
    } else {
      console.log(`[WEBSOCKET] Connection using App ID ${appId}`);
    }
  } else {
    console.log(
      `[WEBSOCKET] Creating connection with specific App ID ${appId}`,
    );
  }

  const socket_url =
    oauthWsUrl ||
    `wss://${cleanedServer}/websockets/v3?app_id=${cleanedAppId}&l=${getInitialLanguage()}&brand=${DERIV_BRAND}`;
  const maskedSocketUrl = socket_url.replace(/otp=[^&]+/i, "otp=***");

  if (oauthWsUrl) {
    console.log("[OAuth] Opening OTP WebSocket", {
      ws_url: maskedSocketUrl,
      active_token_type: activeToken?.startsWith?.("pat_") ? "pat" : "oauth",
    });
  }

  const deriv_socket = new WebSocket(socket_url);

  console.log("[WEBSOCKET] WebSocket created", {
    url: maskedSocketUrl,
    readyState: deriv_socket.readyState,
  });

  const deriv_api = oauthWsUrl
    ? createOAuthOtpApi(deriv_socket)
    : new DerivAPIBasic({
        connection: deriv_socket,
        middleware: new APIMiddleware({}),
      });

  if (oauthWsUrl) {
    const originalSend = deriv_api.send.bind(deriv_api);
    deriv_api.send = (payload) => {
      console.log("[OAuth] OTP WS send", payload);
      return originalSend(payload);
    };
  }

  return deriv_api;
};

export const generatePublicDerivApiInstance = (specificAppId = null) => {
  const cleanedServer = getSocketURL().replace(/[^a-zA-Z0-9.]/g, "");
  const appId = specificAppId !== null ? specificAppId : getAppId();
  const cleanedAppId =
    appId?.toString()?.replace?.(/[^a-zA-Z0-9]/g, "") ?? appId?.toString();
  const socket_url = `wss://${cleanedServer}/websockets/v3?app_id=${cleanedAppId}&l=${getInitialLanguage()}&brand=${DERIV_BRAND}`;
  const deriv_socket = new WebSocket(socket_url);

  console.log("[WEBSOCKET] Public WebSocket created", {
    url: socket_url,
    readyState: deriv_socket.readyState,
  });

  return new DerivAPIBasic({
    connection: deriv_socket,
    middleware: new APIMiddleware({}),
  });
};

const createSharedOAuthSessionApi = (api_base, consumer) => {
  const listener_map = {
    open: new Set(),
    close: new Set(),
    error: new Set(),
    message: new Set(),
  };
  let bound_connection = null;

  const getCurrentApi = () => api_base.api;

  const rebindConnection = () => {
    const current_connection = getCurrentApi()?.connection || null;

    if (current_connection === bound_connection) {
      return current_connection;
    }

    if (bound_connection) {
      Object.entries(listener_map).forEach(([event_name, callbacks]) => {
        callbacks.forEach((callback) =>
          bound_connection.removeEventListener?.(event_name, callback),
        );
      });
    }

    bound_connection = current_connection;

    if (bound_connection) {
      Object.entries(listener_map).forEach(([event_name, callbacks]) => {
        callbacks.forEach((callback) =>
          bound_connection.addEventListener?.(event_name, callback),
        );
      });
    }

    return bound_connection;
  };

  const ensureConnection = () => rebindConnection();
  const buildAuthorizeResponse = async () => {
    const loginid =
      V2GetActiveClientId() ||
      api_base.account_info?.loginid ||
      getActiveTradingLoginId() ||
      "";
    const authorize_payload = api_base.account_info?.loginid
      ? api_base.account_info
      : buildOAuthAuthorizeData(loginid);
    return { authorize: authorize_payload, error: undefined };
  };

  const ensureTradingSocket = async (action) => {
    const has_trading_socket = await api_base.ensureOAuthTradingSocket(
      `${consumer}:${action}`,
    );
    if (!has_trading_socket || !getCurrentApi()) {
      throw new Error(
        "OAuth trading socket could not be opened right now. Please try again shortly.",
      );
    }
    ensureConnection();
    return getCurrentApi();
  };

  return {
    get connection() {
      return {
        addEventListener: (event_name, callback) => {
          listener_map[event_name]?.add(callback);
          ensureConnection()?.addEventListener?.(event_name, callback);
        },
        removeEventListener: (event_name, callback) => {
          listener_map[event_name]?.delete(callback);
          bound_connection?.removeEventListener?.(event_name, callback);
        },
        get readyState() {
          return ensureConnection()?.readyState;
        },
        get url() {
          return ensureConnection()?.url;
        },
      };
    },
    send: (payload) => {
      ensureConnection();
      return getCurrentApi()?.send(payload);
    },
    authorize: (token) => {
      if (token && !isOAuthSessionActive(token) && !token.startsWith("ory_")) {
        ensureConnection();
        return getCurrentApi()?.authorize(token);
      }

      return buildAuthorizeResponse();
    },
    buy: async (payload) => {
      const api = await ensureTradingSocket("buy");
      if (typeof api.buy === "function") {
        return api.buy(payload);
      }
      return api.send(payload);
    },
    forget: (payload) => {
      ensureConnection();
      if (typeof getCurrentApi()?.forget === "function") {
        return getCurrentApi().forget(payload);
      }
      return getCurrentApi()?.send(payload);
    },
    forgetAll: (type) => {
      ensureConnection();
      if (typeof getCurrentApi()?.forgetAll === "function") {
        return getCurrentApi().forgetAll(type);
      }
      return getCurrentApi()?.send({ forget_all: type });
    },
    disconnect: () => {},
    getSelfExclusion: () => getCurrentApi()?.getSelfExclusion?.(),
    onMessage: () => ({
      subscribe: (callback) => {
        ensureConnection();
        return getCurrentApi()?.onMessage()?.subscribe(callback);
      },
    }),
  };
};

export const getStandaloneOAuthAwareApi = async (consumer = "standalone") => {
  const activeToken = localStorage.getItem("authToken") || "";
  const is_oauth_session =
    !!activeToken &&
    (isOAuthSessionActive(activeToken) || activeToken.startsWith("ory_"));

  if (is_oauth_session) {
    const { api_base } = await import("./api-base");
    if (!api_base.api || !api_base.is_authorized) {
      await api_base.init();
    }
    if (!api_base.api || !api_base.is_authorized) {
      throw new Error(
        "OAuth session initialization failed. Please refresh and sign in again.",
      );
    }

    return {
      api: createSharedOAuthSessionApi(api_base, consumer),
      is_shared: true,
    };
  }

  return {
    api: generateDerivApiInstance(),
    is_shared: false,
  };
};

export const hasAppIdChanged = () => {
  const currentAppId = getAppId();
  return (
    currentConnectionAppId !== null && currentAppId !== currentConnectionAppId
  );
};

export const getCurrentConnectionAppId = () => {
  return currentConnectionAppId;
};

export const resetConnectionAppId = () => {
  currentConnectionAppId = null;
};

export const shouldRecreateApiInstance = (storedAppId) => {
  const currentAppId = getAppId();
  return storedAppId !== currentAppId;
};

export const getLoginId = () => {
  const login_id = localStorage.getItem("active_loginid");
  if (login_id && login_id !== "null") return login_id;
  return null;
};

export const V2GetActiveToken = () => {
  const tradingToken = getActiveTradingToken();
  if (tradingToken) return tradingToken;

  const token = localStorage.getItem("authToken");
  if (token && token !== "null") return token;
  return null;
};

export const V2GetActiveClientId = () => {
  const tradingLoginId = getActiveTradingLoginId();
  if (tradingLoginId) return tradingLoginId;

  return null;
};

export const getToken = () => {
  const active_loginid = getLoginId();
  const client_accounts = getStoredAccountsList();
  const active_account =
    (client_accounts && client_accounts[active_loginid]) || {};
  return {
    token: active_account ?? undefined,
    account_id: active_loginid ?? undefined,
  };
};
