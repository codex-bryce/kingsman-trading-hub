const DEMO_ACCOUNT_PREFIXES = ["VRTC", "VR", "DOT"] as const;
const NON_EU_REAL_ACCOUNT_PREFIXES = ["CR", "ROT"] as const;
const EU_REAL_ACCOUNT_PREFIXES = ["MF"] as const;

const startsWithAnyPrefix = (
  loginid: string | null | undefined,
  prefixes: readonly string[],
) => Boolean(loginid) && prefixes.some((prefix) => loginid?.startsWith(prefix));

export const isDemoLoginId = (loginid: string | null | undefined) =>
  startsWithAnyPrefix(loginid, DEMO_ACCOUNT_PREFIXES);

export const isNonEuRealLoginId = (loginid: string | null | undefined) =>
  startsWithAnyPrefix(loginid, NON_EU_REAL_ACCOUNT_PREFIXES);

export const isEuRealLoginId = (loginid: string | null | undefined) =>
  startsWithAnyPrefix(loginid, EU_REAL_ACCOUNT_PREFIXES);

export const isManagedRealLoginId = (loginid: string | null | undefined) =>
  isNonEuRealLoginId(loginid) || isEuRealLoginId(loginid);

export const isRealLoginId = (loginid: string | null | undefined) =>
  Boolean(loginid) && !isDemoLoginId(loginid);
