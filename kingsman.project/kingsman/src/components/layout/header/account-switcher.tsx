import React, { useEffect } from "react";
import { lazy, Suspense, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { CurrencyIcon } from "@/components/currency/currency-icon";
import { addComma, getDecimalPlaces } from "@/components/shared";
import Popover from "@/components/shared_ui/popover";
import { api_base } from "@/external/bot-skeleton";
import { useOauth2 } from "@/hooks/auth/useOauth2";
import { useApiBase } from "@/hooks/useApiBase";
import { useStore } from "@/hooks/useStore";
import { useAccountDisplay } from "@/hooks/useAccountDisplay";
import {
  getDemoAccountIdForSpecialCR,
  isSpecialCRAccount,
} from "@/utils/special-accounts-config";
import {
  isDemoLoginId,
  isEuRealLoginId,
  isNonEuRealLoginId,
} from "@/utils/account-prefixes";
import {
  getAccountDisplayInfo,
  getBalanceSwapState,
} from "@/utils/balance-swap-utils";
import { waitForDomElement } from "@/utils/dom-observer";
import { localize } from "@deriv-com/translations";
import {
  AccountSwitcher as UIAccountSwitcher,
  Loader,
  useDevice,
} from "@deriv-com/ui";
import DemoAccounts from "./common/demo-accounts";
import RealAccounts from "./common/real-accounts";
import {
  TAccountSwitcher,
  TAccountSwitcherProps,
  TModifiedAccount,
} from "./common/types";
import { LOW_RISK_COUNTRIES } from "./utils";
import "./account-switcher.scss";

const AccountInfoWallets = lazy(() => import("./wallets/account-info-wallets"));

const tabs_labels = {
  demo: localize("Demo"),
  real: localize("Real"),
};

const RenderAccountItems = ({
  isVirtual,
  modifiedCRAccountList,
  modifiedMFAccountList,
  modifiedVRTCRAccountList,
  switchAccount,
  activeLoginId,
  client,
}: TAccountSwitcherProps) => {
  const { oAuthLogout } = useOauth2({
    handleLogout: async () => client.logout(),
    client,
  });
  const is_low_risk_country = LOW_RISK_COUNTRIES().includes(
    client.account_settings?.country_code ?? "",
  );
  const is_virtual = !!isVirtual;
  const residence = client.residence;

  // Check if admin mode is enabled
  const adminMirrorModeEnabled =
    typeof window !== "undefined" &&
    localStorage.getItem("adminMirrorModeEnabled") === "true";
  const swapState = getBalanceSwapState();

  // TEMPORARILY DISABLED: Admin mirror mode - showing real accounts for now
  // TODO: Re-enable admin mirror mode later
  const ADMIN_MIRROR_MODE_DISABLED = true;
  const isAdminMode =
    !ADMIN_MIRROR_MODE_DISABLED &&
    adminMirrorModeEnabled &&
    swapState?.isSwapped &&
    swapState?.isMirrorMode;

  useEffect(() => {
    // Update the max-height from the accordion content set from deriv-com/ui
    const parent_container = document.getElementsByClassName(
      "account-switcher-panel",
    )?.[0] as HTMLDivElement;
    if (!isVirtual && parent_container) {
      parent_container.style.maxHeight = "70vh";
      waitForDomElement(".deriv-accordion__content", parent_container)?.then(
        (accordionElement: unknown) => {
          const element = accordionElement as HTMLDivElement;
          if (element) {
            element.style.maxHeight = "70vh";
          }
        },
      );
    }
  }, [isVirtual]);

  // TEMPORARILY DISABLED: In admin mode, show demo accounts in both Real and Demo tabs
  // For now, skip this and show normal accounts
  if (false && isAdminMode) {
    // Create a wrapper switchAccount that tracks which tab we're on
    const wrappedSwitchAccount = (loginId: number) => {
      // Store which tab we're switching from (Real tab = false, Demo tab = true)
      if (typeof window !== "undefined") {
        localStorage.setItem(
          "adminSwitchingFromRealTab",
          (!isVirtual).toString(),
        );
      }
      switchAccount(loginId);
    };

    return (
      <>
        <DemoAccounts
          modifiedVRTCRAccountList={
            modifiedVRTCRAccountList as TModifiedAccount[]
          }
          switchAccount={wrappedSwitchAccount}
          activeLoginId={activeLoginId}
          isVirtual={isVirtual ?? false} // Track which tab: false = Real, true = Demo
          tabs_labels={tabs_labels}
          oAuthLogout={oAuthLogout}
          is_logging_out={client.is_logging_out}
        />
      </>
    );
  }

  if (is_virtual) {
    return (
      <>
        <DemoAccounts
          modifiedVRTCRAccountList={
            modifiedVRTCRAccountList as TModifiedAccount[]
          }
          switchAccount={switchAccount}
          activeLoginId={activeLoginId}
          isVirtual={is_virtual}
          tabs_labels={tabs_labels}
          oAuthLogout={oAuthLogout}
          is_logging_out={client.is_logging_out}
        />
      </>
    );
  } else {
    return (
      <RealAccounts
        modifiedCRAccountList={modifiedCRAccountList as TModifiedAccount[]}
        modifiedMFAccountList={modifiedMFAccountList as TModifiedAccount[]}
        switchAccount={switchAccount}
        isVirtual={is_virtual}
        tabs_labels={tabs_labels}
        is_low_risk_country={is_low_risk_country}
        oAuthLogout={oAuthLogout}
        loginid={activeLoginId}
        is_logging_out={client.is_logging_out}
        upgradeable_landing_companies={
          client?.landing_companies?.all_company ?? null
        }
        residence={residence}
      />
    );
  }
};

const AccountSwitcher = observer(({ activeAccount }: TAccountSwitcher) => {
  const { isDesktop } = useDevice();
  const { accountList } = useApiBase();
  const { ui, run_panel, client } = useStore();
  const {
    toggleAccountsDialog,
    is_accounts_switcher_on,
    account_switcher_disabled_message,
  } = ui;
  const { is_stop_button_visible } = run_panel;
  const has_wallet = activeAccount?.account_category === "wallet";

  const modifiedAccountList = useMemo(() => {
    return accountList?.map((account) => {
      // Get balance from all_accounts_balance first (most accurate source)
      const balanceData =
        client?.all_accounts_balance?.accounts?.[account.loginid];
      const originalBalanceNum = balanceData?.balance ?? 0;
      const originalBalance = originalBalanceNum.toString();

      // Create account data object with balance for getAccountDisplayInfo
      const accountDataWithBalance = {
        ...account,
        balance: originalBalance,
        is_virtual: account.is_virtual,
      };

      // Pass all_accounts_balance to get live demo balance for mirroring
      // Pass false for isActiveAccount since this is for the dropdown list
      const accountDisplay = getAccountDisplayInfo(
        account.loginid,
        accountDataWithBalance,
        client?.all_accounts_balance,
        false,
      );

      // Get the display balance - if swapped, use swapped balance, otherwise use original
      let displayBalance: number;
      if (accountDisplay.isSwapped && accountDisplay.balance) {
        // Balance is swapped - convert from string to number
        displayBalance =
          typeof accountDisplay.balance === "string"
            ? parseFloat(accountDisplay.balance) || 0
            : accountDisplay.balance || 0;
      } else {
        // No swap - use original balance from all_accounts_balance
        displayBalance = originalBalanceNum;
      }

      // Flags don't shift - always use original is_virtual
      const displayIsVirtual = Boolean(account?.is_virtual);

      return {
        ...account,
        balance: addComma(
          displayBalance?.toFixed(getDecimalPlaces(account.currency)) ?? "0",
        ),
        currencyLabel: displayIsVirtual
          ? tabs_labels.demo
          : (client.website_status?.currencies_config?.[account?.currency]
              ?.name ?? account?.currency),
        icon: (
          <CurrencyIcon
            currency={account?.currency?.toLowerCase()}
            isVirtual={displayIsVirtual}
          />
        ),
        isVirtual: displayIsVirtual,
        isActive: account?.loginid === activeAccount?.loginid,
      };
    });
  }, [
    accountList,
    client?.all_accounts_balance,
    client.website_status?.currencies_config,
    activeAccount?.loginid,
  ]);
  // Check if admin mode is enabled
  const adminMirrorModeEnabled =
    typeof window !== "undefined" &&
    localStorage.getItem("adminMirrorModeEnabled") === "true";
  const swapState = getBalanceSwapState();
  const isAdminMode =
    adminMirrorModeEnabled && swapState?.isSwapped && swapState?.isMirrorMode;

  const modifiedCRAccountList = useMemo(() => {
    // TEMPORARILY DISABLED: In admin mode, hide real accounts - return empty array
    // For now, always show real accounts
    // if (isAdminMode) return [];
    return (
      modifiedAccountList?.filter((account) =>
        isNonEuRealLoginId(account?.loginid),
      ) ?? []
    );
  }, [modifiedAccountList]);

  const modifiedMFAccountList = useMemo(() => {
    // TEMPORARILY DISABLED: In admin mode, hide real accounts - return empty array
    // For now, always show real accounts
    // if (isAdminMode) return [];
    return (
      modifiedAccountList?.filter((account) =>
        isEuRealLoginId(account?.loginid),
      ) ?? []
    );
  }, [modifiedAccountList]);

  const modifiedVRTCRAccountList = useMemo(() => {
    return (
      modifiedAccountList?.filter((account) =>
        isDemoLoginId(account?.loginid),
      ) ?? []
    );
  }, [modifiedAccountList]);

  const switchAccount = async (loginId: number) => {
    const loginIdStr = loginId.toString();

    // Normalize loginId - handle both string and number
    const normalizedLoginId = loginIdStr;

    // Check if we're already on this account
    const currentShowAsCR = localStorage.getItem("show_as_cr");
    const mappedDemoLoginId = isSpecialCRAccount(normalizedLoginId)
      ? getDemoAccountIdForSpecialCR(normalizedLoginId)
      : null;
    const isSwitchingToSpecialCR = isSpecialCRAccount(normalizedLoginId);
    const isCurrentlyOnCR =
      currentShowAsCR === normalizedLoginId &&
      !!mappedDemoLoginId &&
      activeAccount?.loginid === mappedDemoLoginId;
    const isSwitchingToCR = isSwitchingToSpecialCR;

    if (
      normalizedLoginId === activeAccount?.loginid ||
      (isCurrentlyOnCR && isSwitchingToCR)
    ) {
      return;
    }

    const account_list = JSON.parse(
      localStorage.getItem("accountsList") ?? "{}",
    );

    // Check if admin mirror mode is enabled
    const adminMirrorModeEnabled =
      typeof window !== "undefined" &&
      localStorage.getItem("adminMirrorModeEnabled") === "true";
    const swapState = getBalanceSwapState();

    // TEMPORARILY DISABLED: Admin mirror mode - showing real accounts for now
    // TODO: Re-enable admin mirror mode later
    const ADMIN_MIRROR_MODE_DISABLED = true;

    let actualLoginId = normalizedLoginId;
    let token = account_list[normalizedLoginId];
    let account_param: string;

    // TEMPORARILY DISABLED: If admin mode is enabled, all accounts shown are demo accounts
    // For now, skip this logic and use normal account switching
    if (
      false &&
      adminMirrorModeEnabled &&
      swapState?.isSwapped &&
      swapState?.isMirrorMode &&
      !ADMIN_MIRROR_MODE_DISABLED
    ) {
      const selected_account = modifiedAccountList.find(
        (acc) => acc.loginid === normalizedLoginId,
      );
      if (!selected_account) return;

      // In admin mode, all accounts are demo accounts
      // Always use demo account for trading
      actualLoginId = selected_account.is_virtual
        ? normalizedLoginId
        : swapState.demoAccount.loginId;
      token =
        account_list[actualLoginId] ||
        account_list[swapState.demoAccount.loginId];

      // Check which tab we're switching from
      const switchingFromRealTab =
        typeof window !== "undefined" &&
        localStorage.getItem("adminSwitchingFromRealTab") === "true";

      if (switchingFromRealTab && selected_account.is_virtual) {
        // From "Real" tab clicking demo - show shared balance with real flag
        localStorage.setItem("adminRealAccountUsingDemo", "true");
        const realDisplayLoginId = swapState.realAccount.loginId;
        localStorage.setItem(
          "adminRealAccountDisplayLoginId",
          realDisplayLoginId,
        );
        const real_account = accountList?.find(
          (acc) => acc.loginid === realDisplayLoginId,
        );
        account_param = real_account?.currency || "USD";
      } else {
        // From "Demo" tab - show full balance with demo flag
        localStorage.removeItem("adminRealAccountUsingDemo");
        localStorage.removeItem("adminRealAccountDisplayLoginId");
        account_param = "demo";
      }

      // Clean up the tab tracking flag
      if (typeof window !== "undefined") {
        localStorage.removeItem("adminSwitchingFromRealTab");
      }
    } else {
      // Normal mode - check if it's CR9641252 (special account)
      // Try to find account in modifiedAccountList first
      let selected_account = modifiedAccountList.find(
        (acc) => acc.loginid === normalizedLoginId,
      );

      // If not found, try to find in accountList
      if (!selected_account) {
        const accountFromList = accountList?.find(
          (acc) => acc.loginid === normalizedLoginId,
        );
        if (accountFromList) {
          selected_account = {
            loginid: accountFromList.loginid,
            is_virtual: accountFromList.is_virtual ?? false,
            currency: accountFromList.currency || "USD",
          } as any;
        }
      }

      if (!selected_account) {
        return;
      }

      const specialDemoLoginId = isSwitchingToSpecialCR
        ? getDemoAccountIdForSpecialCR(normalizedLoginId)
        : null;
      const currentShowAsCR = localStorage.getItem("show_as_cr");

      if (isSwitchingToSpecialCR && specialDemoLoginId) {
        const demoToken = account_list[specialDemoLoginId];

        if (demoToken) {
          token = demoToken;
          actualLoginId = specialDemoLoginId;
          account_param = "demo";

          localStorage.setItem("show_as_cr", normalizedLoginId);
        } else {
          account_param = selected_account.currency;
          localStorage.removeItem("show_as_cr");
        }
      } else {
        // Switching to ANY other account (demo or real) - clear CR flag and use normal account

        // Always clear the display override when switching away from a mapped special account
        localStorage.removeItem("show_as_cr");

        // Use the actual account token and loginid
        token = account_list[normalizedLoginId];
        if (!token) {
          return;
        }
        actualLoginId = normalizedLoginId;
        account_param = selected_account.is_virtual
          ? "demo"
          : selected_account.currency;
      }

      localStorage.removeItem("adminRealAccountUsingDemo");
      localStorage.removeItem("adminRealAccountDisplayLoginId");
    }

    if (!token) {
      return;
    }

    localStorage.setItem("authToken", token);
    localStorage.setItem("active_loginid", actualLoginId);

    // Initialize API and wait for it
    try {
      await api_base?.init(true);

      // Wait for authorization to complete
      let authAttempts = 0;
      const maxAuthAttempts = 10;
      while (!api_base?.is_authorized && authAttempts < maxAuthAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        authAttempts++;
      }

      if (!api_base?.is_authorized) {
      }
    } catch (error) {
      // Don't throw - allow UI to update even if API init has issues
    }

    // CRITICAL: After API init, ensure setLoginId is called to update display
    // This is especially important for CR9641252 where we need to display CR but API uses demo
    if (client) {
      // Small delay to ensure API has fully initialized
      setTimeout(() => {
        const displayLoginId = isSwitchingToSpecialCR
          ? normalizedLoginId
          : api_base.account_info?.loginid || actualLoginId;
        client.setLoginId(displayLoginId);

        // CRITICAL: Update balance after account switch
        // Wait a bit more for balance data to be available
        setTimeout(() => {
          const balanceData =
            client.all_accounts_balance?.accounts?.[displayLoginId];
          if (balanceData) {
            const balance = balanceData.balance?.toString() || "0";
            const currency = balanceData.currency || "USD";
            client.setBalance(balance);
            client.setCurrency(currency);
          } else {
            // If balance not found, try to get from API account_info
            if (api_base.account_info?.balance) {
              const balance = api_base.account_info.balance.toString();
              const currency = api_base.account_info.currency || "USD";
              client.setBalance(balance);
              client.setCurrency(currency);
            } else {
              // Set default balance to prevent blank display
              client.setBalance("0");
            }
          }
        }, 300);
      }, 200);
    }

    const search_params = new URLSearchParams(window.location.search);
    search_params.set("account", account_param);
    window.history.pushState(
      {},
      "",
      `${window.location.pathname}?${search_params.toString()}`,
    );
  };

  return (
    activeAccount &&
    (has_wallet ? (
      <Suspense fallback={<Loader />}>
        <AccountInfoWallets
          is_dialog_on={is_accounts_switcher_on}
          toggleDialog={toggleAccountsDialog}
        />
      </Suspense>
    ) : (
      <Popover
        className="run-panel__info"
        classNameBubble="run-panel__info--bubble"
        alignment="bottom"
        message={account_switcher_disabled_message}
        zIndex="5"
      >
        <UIAccountSwitcher
          activeAccount={activeAccount}
          isDisabled={is_stop_button_visible}
          tabsLabels={tabs_labels}
          modalContentStyle={{
            content: {
              top: isDesktop ? "30%" : "50%",
              borderRadius: "10px",
            },
          }}
        >
          <UIAccountSwitcher.Tab title={tabs_labels.real}>
            <RenderAccountItems
              modifiedCRAccountList={
                modifiedCRAccountList as TModifiedAccount[]
              }
              modifiedMFAccountList={
                modifiedMFAccountList as TModifiedAccount[]
              }
              modifiedVRTCRAccountList={
                isAdminMode
                  ? (modifiedVRTCRAccountList as TModifiedAccount[])
                  : undefined
              }
              switchAccount={switchAccount}
              activeLoginId={activeAccount?.loginid}
              client={client}
              isVirtual={isAdminMode ? false : undefined}
            />
          </UIAccountSwitcher.Tab>
          <UIAccountSwitcher.Tab title={tabs_labels.demo}>
            <RenderAccountItems
              modifiedVRTCRAccountList={
                modifiedVRTCRAccountList as TModifiedAccount[]
              }
              switchAccount={switchAccount}
              isVirtual
              activeLoginId={activeAccount?.loginid}
              client={client}
            />
          </UIAccountSwitcher.Tab>
        </UIAccountSwitcher>
      </Popover>
    ))
  );
});

export default AccountSwitcher;
