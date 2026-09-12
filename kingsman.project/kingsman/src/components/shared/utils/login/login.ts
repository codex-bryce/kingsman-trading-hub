import { generateOAuthURL } from "../config/config";
import {
  CookieStorage,
  isStorageSupported,
  LocalStore,
} from "../storage/storage";
import { startOAuthLogin } from "@/utils/deriv-oauth";
import { getStaticUrl } from "../url";

export const redirectToLogin = (
  is_logged_in: boolean,
  language: string,
  has_params = true,
  redirect_delay = 0,
) => {
  if (!is_logged_in && isStorageSupported(sessionStorage)) {
    const l = window.location;
    const redirect_url = has_params
      ? window.location.href
      : `${l.protocol}//${l.host}${l.pathname}`;
    sessionStorage.setItem("redirect_url", redirect_url);
    setTimeout(() => {
      void startOAuthLogin({ language, redirectUrl: redirect_url }).catch(
        (error) => {},
      );
    }, redirect_delay);
  }
};

export const redirectToSignUp = () => {
  window.open(getStaticUrl("/signup/"));
};

type TLoginUrl = {
  language: string;
};

export const loginUrl = ({ language }: TLoginUrl) => {
  const signup_device_cookie = new (CookieStorage as any)("signup_device");
  const signup_device = signup_device_cookie.get("signup_device");
  const date_first_contact_cookie = new (CookieStorage as any)(
    "date_first_contact",
  );
  const date_first_contact =
    date_first_contact_cookie.get("date_first_contact");
  const oauth_url = new URL(
    generateOAuthURL(language, {
      signup_device,
      date_first_contact,
    }),
  );

  const server_url = LocalStore.get("config.server_url");
  if (server_url && /qa/.test(server_url)) {
    oauth_url.hostname = server_url;
  }

  return oauth_url.toString();
};
