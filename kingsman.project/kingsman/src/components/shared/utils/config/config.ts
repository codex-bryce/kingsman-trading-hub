import { LocalStorageConstants, LocalStorageUtils } from "@deriv-com/utils";

export const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3";
export const DERIV_APP_ID = "80976";
// export const DERIV_REDIRECT_URL = 'https://hh6ws6mh-3000.inc1.devtunnels.ms/';
export const DERIV_REDIRECT_URL = "https://www.kingsmantradinghub.com/";
export const DERIV_OAUTH_URL = "https://oauth.deriv.com/oauth2/authorize";
// export const CLIENT_ID = '33apmmZjV811fXnN8RT5h';
export const CLIENT_ID = "33maQ2YfjFHTQCNRBmshf";
export const AUTH_URL = "https://auth.deriv.com/oauth2/auth";
export const TOKEN_URL = "https://auth.deriv.com/oauth2/token";
export const API_BASE = "https://api.derivws.com/trading/v1/options";
// New OAuth/Options endpoints identify the OAuth application via Deriv-App-ID.
// Legacy WebSocket login continues to use the legacy numeric app_id.
export const DERIV_OPTIONS_OAUTH_APP_ID =
  process.env.DERIV_OPTIONS_OAUTH_APP_ID || CLIENT_ID;
export const DERIV_OPTIONS_PAT_APP_ID =
  process.env.DERIV_OPTIONS_PAT_APP_ID || DERIV_OPTIONS_OAUTH_APP_ID;
export const INCLUDE_LEGACY_APP_ID_IN_PKCE = true;
export const DERIV_BRAND = "deriv";

const SINGLE_APP_ID = Number.parseInt(DERIV_APP_ID, 10) || 106743;
const DEFAULT_SERVER_URL = DERIV_WS_URL.replace(/^wss?:\/\//, "").replace(
  /\/.*$/,
  "",
);

export const APP_IDS = {
  SINGLE: SINGLE_APP_ID,
  LOCALHOST: SINGLE_APP_ID,
  TMP_STAGING: SINGLE_APP_ID,
  STAGING: SINGLE_APP_ID,
  STAGING_BE: SINGLE_APP_ID,
  STAGING_ME: SINGLE_APP_ID,
  PRODUCTION: SINGLE_APP_ID,
  PRODUCTION_BE: SINGLE_APP_ID,
  PRODUCTION_ME: SINGLE_APP_ID,
};

export const livechat_license_id = 12049137;
export const livechat_client_id = "66aa088aad5a414484c1fd1fa8a5ace7";

export const domain_app_ids = {};

export const getCurrentProductionDomain = () => window.location.hostname;

export const isLocal = () =>
  /localhost(:\d+)?$/i.test(window.location.hostname);

export const isProduction = () => !isLocal();

export const isTestLink = () => isLocal();

const getDefaultServerURL = () => DEFAULT_SERVER_URL;

const getSanitizedUrl = (url: URL) => {
  url.search = "";
  url.hash = "";

  return url.toString();
};

export const getOAuthRedirectUri = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    const runtime_redirect_url = new URL(window.location.origin);
    runtime_redirect_url.pathname = "/";

    return getSanitizedUrl(runtime_redirect_url);
  }

  return getSanitizedUrl(new URL(DERIV_REDIRECT_URL));
};

export const getOAuthReturnUrl = () => {
  return getOAuthRedirectUri();
};

export const getDefaultAppIdAndUrl = () => ({
  app_id: SINGLE_APP_ID,
  server_url: getDefaultServerURL(),
});

export const rotateAppIdOnBotStop = (): number => SINGLE_APP_ID;

export const getCurrentRotationAppId = (): number => SINGLE_APP_ID;

export const getRotationStatus = () => ({
  currentIndex: 0,
  currentAppId: SINGLE_APP_ID,
  nextIndex: 0,
  nextAppId: SINGLE_APP_ID,
  allAppIds: [SINGLE_APP_ID],
  rotationActive: false,
});

export const switchAppIdAfterTrade = () => null;

export const forceUpdateAppId = () => {
  window.localStorage.setItem("config.app_id", SINGLE_APP_ID.toString());
  return SINGLE_APP_ID;
};

export const getAppId = () => {
  window.localStorage.setItem("config.app_id", SINGLE_APP_ID.toString());
  return SINGLE_APP_ID;
};

export const getSocketURL = () => {
  const local_storage_server_url =
    window.localStorage.getItem("config.server_url");
  return local_storage_server_url || getDefaultServerURL();
};

export const checkAndSetEndpointFromUrl = () => {
  if (isLocal()) {
    const url_params = new URLSearchParams(location.search.slice(1));

    if (url_params.has("qa_server") && url_params.has("app_id")) {
      const qa_server = url_params.get("qa_server") || "";
      const app_id = url_params.get("app_id") || "";

      url_params.delete("qa_server");
      url_params.delete("app_id");

      if (
        /^(^(www\.)?qa[0-9]{1,4}\.deriv.dev|(.*)\.derivws\.com)$/.test(
          qa_server,
        ) &&
        /^[0-9]+$/.test(app_id)
      ) {
        localStorage.setItem("config.app_id", app_id);
        localStorage.setItem("config.server_url", qa_server.replace(/"/g, ""));
      }

      const params = url_params.toString();
      const hash = location.hash;

      location.href = `${location.protocol}//${location.hostname}${location.pathname}${params ? `?${params}` : ""}${
        hash || ""
      }`;

      return true;
    }
  }

  return false;
};

export const getDebugServiceWorker = () => {
  const debug_service_worker_flag = window.localStorage.getItem(
    "debug_service_worker",
  );
  if (debug_service_worker_flag) return !!parseInt(debug_service_worker_flag);

  return false;
};

export const generateOAuthURL = (
  language = "EN",
  extraParams: Record<string, string | undefined> = {},
) => {
  const configured_server_url = (LocalStorageUtils.getValue(
    LocalStorageConstants.configServerURL,
  ) || localStorage.getItem("config.server_url")) as string | null;

  const oauth_host =
    configured_server_url && /qa/.test(configured_server_url)
      ? configured_server_url
      : new URL(DERIV_OAUTH_URL).hostname;
  const oauth_url = new URL(`https://${oauth_host}/oauth2/authorize`);

  oauth_url.searchParams.set("app_id", getAppId().toString());
  oauth_url.searchParams.set("l", language);
  oauth_url.searchParams.set("brand", DERIV_BRAND);
  oauth_url.searchParams.set("redirect_uri", getOAuthRedirectUri());

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value) {
      oauth_url.searchParams.set(key, value);
    }
  });

  return oauth_url.toString();
};
