import { useEffect, useState } from "react";
import {
  account_list$,
  authData$,
  CONNECTION_STATUS,
  connectionStatus$,
  isAuthorized$,
  isAuthorizing$,
} from "@/external/bot-skeleton/services/api/observables/connection-status-stream";
import { TAuthData } from "@/types/api-types";
import { buildOAuthAuthorizeData } from "@/utils/deriv-oauth";

export const useApiBase = () => {
  const stored_loginid =
    typeof window !== "undefined"
      ? localStorage.getItem("active_loginid") || ""
      : "";
  const initial_auth_data = stored_loginid
    ? buildOAuthAuthorizeData(stored_loginid)
    : null;
  const [connectionStatus, setConnectionStatus] = useState<CONNECTION_STATUS>(
    CONNECTION_STATUS.UNKNOWN,
  );
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);
  const [accountList, setAccountList] = useState<TAuthData["account_list"]>(
    initial_auth_data?.account_list || [],
  );
  const [authData, setAuthData] = useState<TAuthData | null>(initial_auth_data);
  const [activeLoginid, setActiveLoginid] = useState<string>(stored_loginid);

  useEffect(() => {
    const connectionStatusSubscription = connectionStatus$.subscribe(
      (status) => {
        setConnectionStatus(status as CONNECTION_STATUS);
      },
    );

    const isAuthorizedSubscription = isAuthorized$.subscribe((isAuthorized) => {
      setIsAuthorized(isAuthorized);
    });

    const isAuthorizingSubscription = isAuthorizing$.subscribe(
      (isAuthorizing) => {
        setIsAuthorizing(isAuthorizing);
      },
    );
    const accountListSubscription = account_list$.subscribe((accountList) => {
      setAccountList(accountList);
    });
    const authDataSubscription = authData$.subscribe((authData) => {
      setAuthData(authData);
      setActiveLoginid(
        authData?.loginid ?? localStorage.getItem("active_loginid") ?? "",
      );
    });

    return () => {
      connectionStatusSubscription.unsubscribe();
      isAuthorizedSubscription.unsubscribe();
      isAuthorizingSubscription.unsubscribe();
      accountListSubscription.unsubscribe();
      authDataSubscription.unsubscribe();
    };
  }, []);

  return {
    connectionStatus,
    isAuthorized,
    isAuthorizing,
    accountList,
    authData,
    activeLoginid,
  };
};
