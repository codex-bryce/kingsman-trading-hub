import {
  getDemoAccountIdForSpecialCR,
  isSpecialCRAccount,
} from "./special-accounts-config";
import { isDemoLoginId } from "./account-prefixes";

export type TStoredClientAccount = {
  loginid: string;
  token: string;
  currency: string;
  is_virtual?: boolean;
  [key: string]: unknown;
};

type TRawStoredClientAccount = Partial<TStoredClientAccount> & {
  client_id?: unknown;
  clientId?: unknown;
  cur?: unknown;
  curr?: unknown;
  login?: unknown;
  login_id?: unknown;
  oauth_token?: unknown;
  oauthToken?: unknown;
  session_token?: unknown;
  sessionToken?: unknown;
};

const AUTH_PAYLOAD_COLLECTION_KEYS = [
  "accounts",
  "account_list",
  "accountList",
  "loginInfo",
  "tokens",
  "token_list",
] as const;
const MAX_AUTH_PAYLOAD_DEPTH = 5;

const isAccountLike = (value: unknown): value is TRawStoredClientAccount => {
  return typeof value === "object" && value !== null;
};

const toStoredClientAccount = (
  value: unknown,
  fallbackLoginid?: string,
): TStoredClientAccount | null => {
  if (!isAccountLike(value)) return null;

  const loginidCandidate =
    typeof value.loginid === "string"
      ? value.loginid
      : typeof value.login === "string"
        ? value.login
        : typeof value.login_id === "string"
          ? value.login_id
          : typeof value.client_id === "string"
            ? value.client_id
            : typeof value.clientId === "string"
              ? value.clientId
              : "";

  const loginid = loginidCandidate
    ? loginidCandidate
    : typeof fallbackLoginid === "string" && fallbackLoginid
      ? fallbackLoginid
      : "";
  const token =
    typeof value.token === "string"
      ? value.token
      : typeof value.oauth_token === "string"
        ? value.oauth_token
        : typeof value.oauthToken === "string"
          ? value.oauthToken
          : typeof value.session_token === "string"
            ? value.session_token
            : typeof value.sessionToken === "string"
              ? value.sessionToken
              : "";

  if (!loginid || !token) return null;

  const inferredIsVirtual =
    typeof value.is_virtual === "boolean"
      ? value.is_virtual
      : isDemoLoginId(loginid);

  return {
    currency:
      typeof value.currency === "string"
        ? value.currency
        : typeof value.cur === "string"
          ? value.cur
          : typeof value.curr === "string"
            ? value.curr
            : "",
    ...value,
    is_virtual: inferredIsVirtual,
    loginid,
    token,
  };
};

export const normalizeStoredClientAccounts = (
  input: unknown,
): Record<string, TStoredClientAccount> => {
  const entries: TStoredClientAccount[] = [];

  if (Array.isArray(input)) {
    input.forEach((account) => {
      const normalized = toStoredClientAccount(account);
      if (normalized) entries.push(normalized);
    });
  } else if (isAccountLike(input)) {
    Object.entries(input).forEach(([key, value]) => {
      const normalized = toStoredClientAccount(value, key);
      if (normalized) entries.push(normalized);
    });
  }

  return entries.reduce<Record<string, TStoredClientAccount>>(
    (acc, account) => {
      acc[account.loginid] = account;
      return acc;
    },
    {},
  );
};

const extractLegacyAccountsFromObject = (
  payload: Record<string, unknown>,
): TStoredClientAccount[] => {
  const legacyAccounts: TStoredClientAccount[] = [];

  Object.entries(payload).forEach(([key, value]) => {
    if (!/^acct\d+$/i.test(key) || typeof value !== "string" || !value) return;

    const suffix = key.replace(/^acct/i, "");
    const token = payload[`token${suffix}`];
    const currency =
      typeof payload[`cur${suffix}`] === "string"
        ? payload[`cur${suffix}`]
        : payload[`curr${suffix}`];

    if (typeof token === "string" && token) {
      legacyAccounts.push({
        currency: typeof currency === "string" ? currency : "",
        loginid: value,
        token,
      });
    }
  });

  return legacyAccounts;
};

const extractAccountsFromAuthPayloadRecursive = (
  payload: unknown,
  depth = 0,
  visited = new Set<unknown>(),
): TStoredClientAccount[] => {
  if (!payload || depth > MAX_AUTH_PAYLOAD_DEPTH || visited.has(payload)) {
    return [];
  }

  if (typeof payload !== "object") {
    return [];
  }

  visited.add(payload);

  if (Array.isArray(payload)) {
    const normalizedArrayAccounts = Object.values(
      normalizeStoredClientAccounts(payload),
    );
    if (normalizedArrayAccounts.length) {
      return normalizedArrayAccounts;
    }

    for (const item of payload) {
      const nestedAccounts = extractAccountsFromAuthPayloadRecursive(
        item,
        depth + 1,
        visited,
      );
      if (nestedAccounts.length) {
        return nestedAccounts;
      }
    }

    return [];
  }

  const objectPayload = payload as Record<string, unknown>;

  for (const key of AUTH_PAYLOAD_COLLECTION_KEYS) {
    const nestedValue = objectPayload[key];
    const nestedAccounts = extractAccountsFromAuthPayloadRecursive(
      nestedValue,
      depth + 1,
      visited,
    );
    if (nestedAccounts.length) {
      return nestedAccounts;
    }
  }

  const normalizedDirectAccounts = Object.values(
    normalizeStoredClientAccounts(objectPayload),
  );
  if (normalizedDirectAccounts.length) {
    return normalizedDirectAccounts;
  }

  const legacyAccounts = extractLegacyAccountsFromObject(objectPayload);
  if (legacyAccounts.length) {
    return legacyAccounts;
  }

  for (const nestedValue of Object.values(objectPayload)) {
    const nestedAccounts = extractAccountsFromAuthPayloadRecursive(
      nestedValue,
      depth + 1,
      visited,
    );
    if (nestedAccounts.length) {
      return nestedAccounts;
    }
  }

  return [];
};

export const extractAccountsFromAuthPayload = (
  payload: unknown,
): TStoredClientAccount[] => {
  return extractAccountsFromAuthPayloadRecursive(payload);
};

export const persistAuthAccounts = (accountsInput: unknown) => {
  const clientAccounts = normalizeStoredClientAccounts(accountsInput);
  const accountsList = Object.values(clientAccounts).reduce<
    Record<string, string>
  >((acc, account) => {
    acc[account.loginid] = account.token;
    return acc;
  }, {});
  const derivTokens = Object.values(clientAccounts).map((account) => ({
    acct: account.loginid,
    token: account.token,
  }));

  localStorage.setItem("accountsList", JSON.stringify(accountsList));
  localStorage.setItem("clientAccounts", JSON.stringify(clientAccounts));
  localStorage.setItem("deriv_tokens", JSON.stringify(derivTokens));

  return { accountsList, clientAccounts };
};

export const getStoredAccountsList = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem("accountsList") || "{}");
  } catch {
    return {};
  }
};

export const getStoredClientAccounts = (): Record<
  string,
  TStoredClientAccount
> => {
  try {
    return normalizeStoredClientAccounts(
      JSON.parse(localStorage.getItem("clientAccounts") || "{}"),
    );
  } catch {
    return {};
  }
};

export const getStoredClientAccountsArray = (): TStoredClientAccount[] => {
  return Object.values(getStoredClientAccounts());
};

export const getDisplayedSpecialAccountLoginId = (): string | null => {
  const showAsCR =
    typeof window !== "undefined" ? localStorage.getItem("show_as_cr") : null;
  return showAsCR && isSpecialCRAccount(showAsCR) ? showAsCR : null;
};

export const getPreferredDemoLoginId = (
  displayLoginId?: string | null,
): string | null => {
  const specialDisplayLoginId =
    displayLoginId || getDisplayedSpecialAccountLoginId();
  const specialDemoLoginId = specialDisplayLoginId
    ? getDemoAccountIdForSpecialCR(specialDisplayLoginId)
    : null;

  if (specialDemoLoginId) {
    return specialDemoLoginId;
  }

  const virtualAccount = getStoredClientAccountsArray().find(
    (account) => account.is_virtual || isDemoLoginId(account.loginid),
  );
  if (virtualAccount?.loginid) {
    return virtualAccount.loginid;
  }

  const accountsList = getStoredAccountsList();
  return (
    Object.keys(accountsList).find((loginid) => isDemoLoginId(loginid)) || null
  );
};

export const getPreferredDemoToken = (
  displayLoginId?: string | null,
): string | null => {
  const demoLoginId = getPreferredDemoLoginId(displayLoginId);
  if (!demoLoginId) return null;

  const accountsList = getStoredAccountsList();
  return accountsList[demoLoginId] || null;
};

export const getActiveTradingLoginId = (
  fallbackLoginId?: string | null,
): string | null => {
  const displayedSpecialAccount = getDisplayedSpecialAccountLoginId();
  const demoLoginId = displayedSpecialAccount
    ? getDemoAccountIdForSpecialCR(displayedSpecialAccount)
    : null;

  if (demoLoginId) {
    return demoLoginId;
  }

  if (fallbackLoginId) {
    return fallbackLoginId;
  }

  const activeLoginId = localStorage.getItem("active_loginid");
  return activeLoginId && activeLoginId !== "null" ? activeLoginId : null;
};

export const getActiveTradingToken = (
  fallbackLoginId?: string | null,
): string | null => {
  const tradingLoginId = getActiveTradingLoginId(fallbackLoginId);
  if (!tradingLoginId) return null;

  const accountsList = getStoredAccountsList();
  return accountsList[tradingLoginId] || null;
};
