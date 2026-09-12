import {
  AUTH_URL,
  CLIENT_ID,
  DERIV_APP_ID,
  DERIV_BRAND,
  INCLUDE_LEGACY_APP_ID_IN_PKCE,
  TOKEN_URL,
  API_BASE,
  DERIV_OPTIONS_OAUTH_APP_ID,
  DERIV_OPTIONS_PAT_APP_ID,
  DERIV_OAUTH_URL,
  getOAuthRedirectUri,
  getOAuthReturnUrl,
} from "@/components/shared/utils/config/config";
import { localize } from "@deriv-com/translations";
import { TAccount, TAuthData } from "@/types/api-types";
import { isDemoLoginId, isRealLoginId } from "./account-prefixes";
import {
  getStoredClientAccountsArray,
  persistAuthAccounts,
  TStoredClientAccount,
} from "./account-storage";

const PKCE_VERIFIER_STORAGE_KEY = "pkce_code_verifier";
const OAUTH_STATE_STORAGE_KEY = "oauth_state";
const OAUTH_ACCESS_TOKEN_STORAGE_KEY = "access_token";
const OAUTH_REDIRECT_URL_STORAGE_KEY = "redirect_url";
const OAUTH_SESSION_TYPE_STORAGE_KEY = "deriv_auth_mode";
const OAUTH_WS_URL_STORAGE_KEY = "deriv_oauth_ws_url";
const OAUTH_WS_ACCOUNT_STORAGE_KEY = "deriv_oauth_ws_account";
const OAUTH_WS_CONSUMER_STORAGE_KEY = "deriv_oauth_ws_consumer";
const OAUTH_WS_CREATED_AT_STORAGE_KEY = "deriv_oauth_ws_created_at";
const DERIV_TOKENS_STORAGE_KEY = "deriv_tokens";
const OAUTH_SCOPE = "trade";

const logOAuth = (message: string, details?: unknown) => {
  if (details === undefined) {
    return;
  }
};

type TOptionsApiAccount = {
  account_id?: string;
  balance?: number | string;
  currency?: string;
  [key: string]: unknown;
};

const createRandomString = () => {
  const random_values = new Uint8Array(64);
  crypto.getRandomValues(random_values);

  return btoa(String.fromCharCode(...random_values))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const createCodeChallenge = async (verifier: string) => {
  const encoded_verifier = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", encoded_verifier);

  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const getOAuthCallbackParams = () =>
  new URLSearchParams(window.location.search);

const PKCE_SUPPORTED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127(?:\.\d{1,3}){3}$/i,
  /(^|\.)deriv\.com$/i,
  /(^|\.)deriv\.dev$/i,
  /(^|\.)deriv\.me$/i,
  /(^|\.)deriv\.be$/i,
];

const OAUTH_PROXY_SUPPORTED_HOST_PATTERNS = [
  /(^|\.)vercel\.app$/i,
  /(^|\.)kingsmantradinghub\.com$/i,
];

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (typeof payload === "string" && payload.trim()) return payload;

  if (payload && typeof payload === "object") {
    const candidate = payload as {
      message?: string;
      error?: string;
      error_description?: string;
      errors?: Array<{ message?: string }>;
    };

    return (
      candidate.error_description ||
      candidate.message ||
      candidate.errors?.[0]?.message ||
      candidate.error ||
      fallback
    );
  }

  return fallback;
};

const cleanupOAuthState = () => {
  sessionStorage.removeItem(PKCE_VERIFIER_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
  sessionStorage.removeItem("verifier");
  sessionStorage.removeItem("state");
};

const parseJsonResponse = async (response: Response) => {
  const response_text = await response.text();
  if (!response_text) return null;

  try {
    return JSON.parse(response_text);
  } catch {
    return response_text;
  }
};

export const canUseOAuthAccountApiForCurrentOrigin = () => {
  if (typeof window === "undefined") return true;

  const hostname = window.location.hostname;
  return (
    PKCE_SUPPORTED_HOST_PATTERNS.some((pattern) => pattern.test(hostname)) ||
    OAUTH_PROXY_SUPPORTED_HOST_PATTERNS.some((pattern) =>
      pattern.test(hostname),
    )
  );
};

const shouldUseOAuthApiProxyForCurrentOrigin = () => {
  if (typeof window === "undefined") return false;

  return OAUTH_PROXY_SUPPORTED_HOST_PATTERNS.some((pattern) =>
    pattern.test(window.location.hostname),
  );
};

const getOAuthAccountsApiBase = () =>
  shouldUseOAuthApiProxyForCurrentOrigin() ? "/api/deriv" : API_BASE;

const getOptionsAppIdForToken = (token: string) => {
  if (token.startsWith("pat_")) {
    return DERIV_OPTIONS_PAT_APP_ID;
  }

  return DERIV_OPTIONS_OAUTH_APP_ID;
};

const buildOptionsApiError = (
  action: string,
  status: number,
  payload: unknown,
  token: string,
  app_id: string,
) => {
  const message = getErrorMessage(payload, `Failed to ${action}`);

  if (status === 401) {
    const token_type_hint = token.startsWith("pat_") ? "PAT" : "OAuth";
    return new Error(
      `${message}. Deriv rejected the ${token_type_hint} token for App ID ${app_id}. Check that this app ID is registered and matches the token type.`,
    );
  }

  if (status === 403) {
    return new Error(
      `${message}. The token may be missing the required Deriv scopes for this endpoint.`,
    );
  }

  return new Error(message);
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const mapStoredAccountToAuthAccount = (
  account: TStoredClientAccount,
): TAccount => ({
  account_category: account.is_virtual ? "virtual" : "real",
  account_type: account.is_virtual ? "demo" : "real",
  broker: "",
  created_at: typeof account.created_at === "number" ? account.created_at : 0,
  currency: account.currency || "USD",
  currency_type: "fiat",
  is_disabled: 0,
  is_virtual: account.is_virtual ? 1 : 0,
  landing_company_name:
    typeof account.landing_company_name === "string"
      ? account.landing_company_name
      : "",
  linked_to: Array.isArray(account.linked_to) ? account.linked_to : [],
  loginid: account.loginid,
});

const getSortedAccounts = (preferred_loginid?: string) => {
  const accounts = getStoredClientAccountsArray();
  return [...accounts].sort((left, right) => {
    if (left.loginid === preferred_loginid) return -1;
    if (right.loginid === preferred_loginid) return 1;
    return 0;
  });
};

export const persistDerivTokens = (accountsInput: unknown) => {
  const { accountsList, clientAccounts } = persistAuthAccounts(accountsInput);
  const deriv_tokens = Object.values(clientAccounts).map((account) => ({
    acct: account.loginid,
    token: account.token,
  }));

  localStorage.setItem(DERIV_TOKENS_STORAGE_KEY, JSON.stringify(deriv_tokens));
  return { accountsList, clientAccounts };
};

export const isOAuthSessionActive = (token?: string | null) => {
  if (typeof window === "undefined") return false;

  const access_token = sessionStorage.getItem(OAUTH_ACCESS_TOKEN_STORAGE_KEY);
  const auth_mode = sessionStorage.getItem(OAUTH_SESSION_TYPE_STORAGE_KEY);

  if (!access_token) return false;

  if (auth_mode && auth_mode !== "oauth") return false;

  return (
    !token ||
    token === access_token ||
    token === localStorage.getItem("authToken")
  );
};

export const markOAuthSession = (access_token: string) => {
  sessionStorage.setItem(OAUTH_ACCESS_TOKEN_STORAGE_KEY, access_token);
  sessionStorage.setItem(OAUTH_SESSION_TYPE_STORAGE_KEY, "oauth");
  sessionStorage.removeItem("deriv_otp_ws_failed");
};

export const clearOAuthConnectionState = () => {
  sessionStorage.removeItem(OAUTH_SESSION_TYPE_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_WS_URL_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_WS_ACCOUNT_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_WS_CONSUMER_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_WS_CREATED_AT_STORAGE_KEY);
};

export const clearStoredOAuthSession = () => {
  sessionStorage.removeItem(OAUTH_ACCESS_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_REDIRECT_URL_STORAGE_KEY);
  clearOAuthConnectionState();
  cleanupOAuthState();
};

export const cleanupOAuthCallbackUrl = () => {
  const url = new URL(window.location.href);
  ["code", "state", "error", "error_description", "scope"].forEach((key) => {
    url.searchParams.delete(key);
  });

  window.history.replaceState(
    {},
    document.title,
    `${url.pathname}${url.search}${url.hash}`,
  );
};

export const parseLegacyTokensFromUrl = (): TStoredClientAccount[] => {
  const search_params = new URLSearchParams(window.location.search);
  const hash_params = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );
  const tokens: TStoredClientAccount[] = [];

  const addToken = (
    login_key: string,
    token_key: string,
    params: URLSearchParams,
  ) => {
    const loginid = params.get(login_key);
    const token = params.get(token_key);
    if (loginid && token) {
      tokens.push({
        loginid,
        token,
        currency: "",
        is_virtual: isDemoLoginId(loginid),
      });
    }
  };

  for (const params of [search_params, hash_params]) {
    for (let i = 1; ; i++) {
      const login_key = `acct${i}`;
      const token_key = `token${i}`;
      if (!params.has(login_key) || !params.has(token_key)) break;
      addToken(login_key, token_key, params);
    }
  }

  if (!tokens.length) {
    addToken("acct", "token", search_params);
    addToken("acct", "token", hash_params);
  }

  return tokens;
};

export const cleanupLegacyAuthUrl = () => {
  const url = new URL(window.location.href);
  const keys_to_remove = ["acct", "token"];

  for (let i = 1; i <= 20; i++) {
    keys_to_remove.push(`acct${i}`, `token${i}`);
  }

  keys_to_remove.forEach((key) => {
    url.searchParams.delete(key);
  });

  window.history.replaceState(
    {},
    document.title,
    `${url.pathname}${url.search}`,
  );
};

export const choosePreferredAccount = (
  accounts: TStoredClientAccount[],
  preferred_loginid?: string | null,
): TStoredClientAccount | null => {
  if (!accounts.length) return null;

  const preferred = preferred_loginid || localStorage.getItem("active_loginid");
  if (preferred) {
    const preferred_match = accounts.find(
      (account) => account.loginid === preferred,
    );
    if (preferred_match) return preferred_match;
  }

  return (
    accounts.find((account) => isRealLoginId(account.loginid)) ||
    accounts[0] ||
    null
  );
};

export const reorderAccountsByPreferred = (
  accounts: TStoredClientAccount[],
  preferred_loginid?: string | null,
): TStoredClientAccount[] => {
  const chosen = choosePreferredAccount(accounts, preferred_loginid);
  if (!chosen) return accounts;

  return [
    chosen,
    ...accounts.filter((account) => account.loginid !== chosen.loginid),
  ];
};

const getFreshOAuthLoginPreferredAccount = (
  accounts: TStoredClientAccount[],
) => {
  const real_account = accounts.find((account) =>
    isRealLoginId(account.loginid),
  );
  if (real_account) {
    return real_account;
  }

  const account_param = new URLSearchParams(window.location.search).get(
    "account",
  );
  if (account_param && account_param !== "demo") {
    const matching_currency_account = accounts.find(
      (account) =>
        account.currency?.toUpperCase?.() === account_param.toUpperCase(),
    );
    if (matching_currency_account) {
      return matching_currency_account;
    }
  }

  return accounts[0] || null;
};

export const fetchOAuthAccounts = async (
  access_token: string,
): Promise<TStoredClientAccount[]> => {
  const app_id = getOptionsAppIdForToken(access_token);
  logOAuth("Fetching Deriv accounts", {
    api_base: getOAuthAccountsApiBase(),
    app_id,
    token_type: access_token.startsWith("pat_") ? "pat" : "oauth",
  });
  const response = await fetch(`${getOAuthAccountsApiBase()}/accounts`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Deriv-App-ID": app_id,
      "Content-Type": "application/json",
    },
  });
  logOAuth("Deriv accounts response received", {
    status: response.status,
    ok: response.ok,
    content_type: response.headers.get("content-type") || "",
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    logOAuth("Deriv accounts response payload (error)", payload);
    throw buildOptionsApiError(
      "fetch Deriv accounts",
      response.status,
      payload,
      access_token,
      app_id,
    );
  }

  const data =
    payload && typeof payload === "object" && "data" in payload
      ? ((payload as { data?: TOptionsApiAccount[] })
          .data as TOptionsApiAccount[]) || []
      : [];

  return data
    .filter(
      (account) =>
        typeof account?.account_id === "string" && account.account_id,
    )
    .map((account) => ({
      ...account,
      loginid: account.account_id as string,
      token: access_token,
      currency: typeof account.currency === "string" ? account.currency : "",
      is_virtual: isDemoLoginId(account.account_id),
      balance: toFiniteNumber(account.balance),
    }));
};

export const fetchOAuthWebSocketUrl = async (
  access_token: string,
  account_id: string,
): Promise<string> => {
  const app_id = getOptionsAppIdForToken(access_token);
  const endpoint = `${getOAuthAccountsApiBase()}/accounts/${account_id}/otp`;
  logOAuth("Requesting OTP WebSocket URL", {
    account_id,
    app_id,
    api_base: getOAuthAccountsApiBase(),
    endpoint,
  });
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Deriv-App-ID": app_id,
      "Content-Type": "application/json",
    },
  });
  logOAuth("OTP response received", {
    status: response.status,
    ok: response.ok,
    content_type: response.headers.get("content-type") || "",
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    logOAuth("OTP response payload (error)", payload);
    throw buildOptionsApiError(
      `get an authenticated WebSocket URL for account ${account_id}`,
      response.status,
      payload,
      access_token,
      app_id,
    );
  }

  const ws_url =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: { url?: string } }).data?.url
      : undefined;

  if (!ws_url) {
    throw new Error("Deriv did not return an authenticated WebSocket URL.");
  }

  const masked_ws_url = ws_url.replace(/otp=[^&]+/i, "otp=***");
  logOAuth("Received OTP WebSocket URL", {
    account_id,
    ws_type: ws_url.includes("/ws/demo")
      ? "demo"
      : ws_url.includes("/ws/real")
        ? "real"
        : "unknown",
    ws_url: masked_ws_url,
    payload_keys:
      payload && typeof payload === "object"
        ? Object.keys(payload as Record<string, unknown>)
        : [],
  });

  return ws_url;
};

export const prepareOAuthConnectionForAccount = async (
  loginid?: string | null,
  access_token?: string | null,
  consumer = "api-base",
) => {
  const resolved_access_token =
    access_token ||
    sessionStorage.getItem(OAUTH_ACCESS_TOKEN_STORAGE_KEY) ||
    localStorage.getItem("authToken") ||
    "";

  if (!resolved_access_token) {
    throw new Error("Missing OAuth access token");
  }

  markOAuthSession(resolved_access_token);

  const accounts = getStoredClientAccountsArray();
  const stored_active_loginid = localStorage.getItem("active_loginid");
  const preferred = loginid || stored_active_loginid;
  const chosen = choosePreferredAccount(accounts, preferred);
  const selected_loginid = chosen?.loginid || preferred || "";

  logOAuth("Preparing OAuth WebSocket connection", {
    consumer,
    requested_loginid: loginid || null,
    stored_active_loginid,
    selected_loginid,
    available_accounts: accounts.map((account) => ({
      loginid: account.loginid,
      is_virtual: !!account.is_virtual,
      currency: account.currency || "",
    })),
  });

  if (!selected_loginid) {
    throw new Error("Unable to determine which Deriv account to connect to");
  }

  sessionStorage.removeItem(OAUTH_WS_URL_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_WS_CREATED_AT_STORAGE_KEY);
  const ws_url = await fetchOAuthWebSocketUrl(
    resolved_access_token,
    selected_loginid,
  );
  localStorage.setItem("active_loginid", selected_loginid);
  sessionStorage.setItem(OAUTH_WS_URL_STORAGE_KEY, ws_url);
  sessionStorage.setItem(OAUTH_WS_ACCOUNT_STORAGE_KEY, selected_loginid);
  sessionStorage.setItem(OAUTH_WS_CONSUMER_STORAGE_KEY, consumer);
  sessionStorage.setItem(
    OAUTH_WS_CREATED_AT_STORAGE_KEY,
    Date.now().toString(),
  );

  return { ws_url, loginid: selected_loginid };
};

export const getStoredOAuthWebSocketUrl = (
  expected_consumer?: string | null,
) => {
  if (!isOAuthSessionActive()) return null;

  const ws_url = sessionStorage.getItem(OAUTH_WS_URL_STORAGE_KEY);
  const ws_account = sessionStorage.getItem(OAUTH_WS_ACCOUNT_STORAGE_KEY);
  const ws_consumer = sessionStorage.getItem(OAUTH_WS_CONSUMER_STORAGE_KEY);
  const active_loginid = localStorage.getItem("active_loginid");

  if (!ws_url) return null;
  if (ws_account && active_loginid && ws_account !== active_loginid)
    return null;
  if (!expected_consumer) return null;
  if (ws_consumer && ws_consumer !== expected_consumer) return null;

  return ws_url;
};

export const clearStoredOAuthWebSocketUrl = () => {
  sessionStorage.removeItem(OAUTH_WS_URL_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_WS_ACCOUNT_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_WS_CONSUMER_STORAGE_KEY);
  sessionStorage.removeItem(OAUTH_WS_CREATED_AT_STORAGE_KEY);
};

export const consumeStoredOAuthWebSocketUrl = (
  expected_consumer?: string | null,
) => {
  const ws_url = getStoredOAuthWebSocketUrl(expected_consumer);
  if (!ws_url) return null;

  sessionStorage.removeItem(OAUTH_WS_URL_STORAGE_KEY);

  return ws_url;
};

export const getStoredOAuthWebSocketMeta = () => ({
  account: sessionStorage.getItem(OAUTH_WS_ACCOUNT_STORAGE_KEY),
  consumer: sessionStorage.getItem(OAUTH_WS_CONSUMER_STORAGE_KEY),
  created_at: Number(
    sessionStorage.getItem(OAUTH_WS_CREATED_AT_STORAGE_KEY) || 0,
  ),
});

export const buildOAuthAuthorizeData = (
  loginid: string,
  balance_data?: { balance?: number | string; currency?: string },
): TAuthData => {
  const sorted_accounts = getSortedAccounts(loginid);
  const selected_account =
    sorted_accounts.find((account) => account.loginid === loginid) ||
    sorted_accounts[0];
  const currency =
    balance_data?.currency || selected_account?.currency || "USD";
  const balance = toFiniteNumber(
    balance_data?.balance,
    toFiniteNumber(selected_account?.balance),
  );

  return {
    account_list: sorted_accounts.map(mapStoredAccountToAuthAccount),
    balance,
    country: localStorage.getItem("client.country") || "",
    currency,
    email: "",
    fullname: "",
    is_virtual: selected_account?.is_virtual ? 1 : 0,
    landing_company_fullname: "",
    landing_company_name:
      typeof selected_account?.landing_company_name === "string"
        ? selected_account.landing_company_name
        : "",
    linked_to: [],
    local_currencies: {},
    loginid,
    preferred_language: localStorage.getItem("i18n") || "EN",
    scopes: OAUTH_SCOPE.split(" "),
    upgradeable_landing_companies: [],
    user_id: 0,
    token: localStorage.getItem("authToken") || undefined,
  };
};

export const getStoredOAuthRedirectUrl = () => {
  return (
    sessionStorage.getItem(OAUTH_REDIRECT_URL_STORAGE_KEY) ||
    getOAuthReturnUrl()
  );
};

export const clearStoredOAuthRedirectUrl = () => {
  sessionStorage.removeItem(OAUTH_REDIRECT_URL_STORAGE_KEY);
};

export const hasOAuthCallbackParams = () => {
  const callback_params = getOAuthCallbackParams();
  return callback_params.has("code") || callback_params.has("error");
};

export const buildOAuthUrl = async (
  language = "EN",
  extraParams: Record<string, string | undefined> = {},
) => {
  const verifier = createRandomString();
  const state = createRandomString();
  const challenge = await createCodeChallenge(verifier);

  sessionStorage.setItem(PKCE_VERIFIER_STORAGE_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);

  const oauth_url = new URL(AUTH_URL);
  oauth_url.searchParams.set("client_id", CLIENT_ID);
  oauth_url.searchParams.set("redirect_uri", getOAuthRedirectUri());
  oauth_url.searchParams.set("response_type", "code");
  oauth_url.searchParams.set("scope", OAUTH_SCOPE);
  oauth_url.searchParams.set("state", state);
  oauth_url.searchParams.set("code_challenge", challenge);
  oauth_url.searchParams.set("code_challenge_method", "S256");
  if (INCLUDE_LEGACY_APP_ID_IN_PKCE) {
    oauth_url.searchParams.set("app_id", DERIV_APP_ID);
  }

  if (language) {
    oauth_url.searchParams.set("l", language);
  }

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value) {
      oauth_url.searchParams.set(key, value);
    }
  });

  logOAuth("Built PKCE authorization URL", {
    redirect_uri: getOAuthRedirectUri(),
    scope: OAUTH_SCOPE,
    has_legacy_app_id: INCLUDE_LEGACY_APP_ID_IN_PKCE,
    extra_params: Object.keys(extraParams),
  });

  return oauth_url.toString();
};

export const buildLegacyOAuthUrl = (
  language = "EN",
  extraParams: Record<string, string | undefined> = {},
) => {
  const oauth_url = new URL(DERIV_OAUTH_URL);
  oauth_url.searchParams.set("app_id", DERIV_APP_ID);
  oauth_url.searchParams.set("redirect_uri", getOAuthRedirectUri());

  if (language) {
    oauth_url.searchParams.set("l", language);
  }

  if (DERIV_BRAND) {
    oauth_url.searchParams.set("brand", DERIV_BRAND);
  }

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value) {
      oauth_url.searchParams.set(key, value);
    }
  });

  return oauth_url.toString();
};

export const startOAuthLogin = async ({
  language = "EN",
  redirectUrl,
  extraParams,
}: {
  language?: string;
  redirectUrl?: string;
  extraParams?: Record<string, string | undefined>;
} = {}) => {
  sessionStorage.setItem(
    OAUTH_REDIRECT_URL_STORAGE_KEY,
    redirectUrl || window.location.href,
  );
  const should_use_pkce = canUseOAuthAccountApiForCurrentOrigin();

  logOAuth("Starting login flow", {
    mode: should_use_pkce ? "pkce" : "legacy",
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
    redirect_url: redirectUrl || window.location.href,
  });

  if (!should_use_pkce) {
    clearStoredOAuthSession();
  }

  const oauth_url = should_use_pkce
    ? await buildOAuthUrl(language, extraParams)
    : buildLegacyOAuthUrl(language, extraParams);
  window.location.assign(oauth_url);
};

const exchangeAuthorizationCode = async (code: string) => {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_STORAGE_KEY);

  logOAuth("Exchanging authorization code", {
    code_length: code.length,
    has_verifier: !!verifier,
    redirect_uri: getOAuthRedirectUri(),
  });

  if (!verifier) {
    throw new Error("Missing PKCE code verifier");
  }

  const response = await fetch("/api/deriv/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: getOAuthRedirectUri(),
      code_verifier: verifier,
    }),
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Token exchange failed"));
  }

  const access_token =
    payload && typeof payload === "object"
      ? (payload as { access_token?: string }).access_token
      : "";
  if (!access_token) {
    throw new Error("Deriv did not return an access token");
  }

  logOAuth("Access token exchange succeeded", {
    token_prefix: access_token.slice(0, 8),
    token_length: access_token.length,
  });
  markOAuthSession(access_token);
  return access_token;
};

export const completeOAuthCallback = async (): Promise<
  TStoredClientAccount[]
> => {
  const callback_params = getOAuthCallbackParams();
  const callback_error = callback_params.get("error");
  const callback_error_description = callback_params.get("error_description");

  if (callback_error) {
    cleanupOAuthState();
    throw new Error(callback_error_description || callback_error);
  }

  const code = callback_params.get("code");
  const state = callback_params.get("state");

  logOAuth("Processing OAuth callback", {
    has_code: !!code,
    has_state: !!state,
    has_error: !!callback_error,
  });

  if (!code || !state) {
    const existing_access_token = sessionStorage.getItem(
      OAUTH_ACCESS_TOKEN_STORAGE_KEY,
    );
    logOAuth("No callback code/state found", {
      has_existing_access_token: !!existing_access_token,
    });
    if (!existing_access_token) {
      return [];
    }

    const restored_accounts = await fetchOAuthAccounts(existing_access_token);
    logOAuth("Restored accounts from existing access token", {
      accounts: restored_accounts.map((account) => account.loginid),
    });
    return reorderAccountsByPreferred(restored_accounts);
  }

  const stored_state = sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
  logOAuth("Validating callback state", {
    has_stored_state: !!stored_state,
    matches: !!stored_state && stored_state === state,
  });
  if (!stored_state || stored_state !== state) {
    cleanupOAuthState();
    throw new Error("State mismatch");
  }

  const access_token = await exchangeAuthorizationCode(code);

  try {
    const fetched_accounts = await fetchOAuthAccounts(access_token);
    if (!fetched_accounts.length) {
      throw new Error("No Deriv accounts were returned for this OAuth login.");
    }

    logOAuth("Fetched accounts after token exchange", {
      accounts: fetched_accounts.map((account) => ({
        loginid: account.loginid,
        is_virtual: !!account.is_virtual,
        currency: account.currency || "",
      })),
    });

    const initial_account =
      getFreshOAuthLoginPreferredAccount(fetched_accounts);
    const ordered_accounts = initial_account
      ? reorderAccountsByPreferred(fetched_accounts, initial_account.loginid)
      : fetched_accounts;
    logOAuth("Selected initial OAuth account", {
      selected_loginid: initial_account?.loginid || null,
      ordered_accounts: ordered_accounts.map((account) => account.loginid),
    });
    return ordered_accounts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Failed to fetch") {
      throw new Error(
        localize(
          "OAuth login could not be completed from this domain. Deriv rejected the account-session request for this origin.",
        ),
      );
    }

    throw error;
  } finally {
    cleanupOAuthState();
  }
};
