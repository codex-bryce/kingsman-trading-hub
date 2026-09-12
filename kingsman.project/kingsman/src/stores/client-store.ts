import { action, computed, makeObservable, observable } from "mobx";
import { ContentFlag, isEmptyObject } from "@/components/shared";
import {
  isEuCountry,
  isMultipliersOnly,
  isOptionsBlocked,
} from "@/components/shared/common/utility";
import { removeCookies } from "@/components/shared/utils/storage/storage";
import { api_base } from "@/external/bot-skeleton";
import Cookies from "js-cookie";
import {
  authData$,
  setAccountList,
  setAuthData,
  setIsAuthorized,
} from "@/external/bot-skeleton/services/api/observables/connection-status-stream";
import type { TAuthData, TLandingCompany } from "@/types/api-types";
import type {
  Balance,
  GetAccountStatus,
  GetSettings,
  WebsiteStatus,
} from "@deriv/api-types";
import { Analytics } from "@deriv-com/analytics";
import {
  getDisplayBalance,
  getAccountDisplayInfo,
  getBalanceSwapState,
  resetBalanceSwap,
} from "@/utils/balance-swap-utils";
import { getActiveTradingToken } from "@/utils/account-storage";
import { isNonEuRealLoginId } from "@/utils/account-prefixes";
import { SPECIAL_CR_ACCOUNTS } from "@/utils/special-accounts-config";

const eu_shortcode_regex = /^maltainvest$/;
const eu_excluded_regex = /^mt$/;
export default class ClientStore {
  loginid = "";
  account_list: TAuthData["account_list"] = [];
  _balance = "0"; // Internal balance storage
  currency = "AUD";
  is_logged_in = false;
  account_status: GetAccountStatus | undefined;
  account_settings: GetSettings | undefined;
  website_status: WebsiteStatus | undefined;
  landing_companies: TLandingCompany | undefined;
  upgradeable_landing_companies: string[] = [];
  accounts: Record<string, TAuthData["account_list"][number]> = {};
  is_landing_company_loaded: boolean | undefined;
  _all_accounts_balance: Balance | null = null; // Internal storage
  is_logging_out = false;

  // TODO: fix with self exclusion
  updateSelfExclusion = () => {};

  private authDataSubscription: { unsubscribe: () => void } | null = null;
  //hey
  constructor() {
    // Subscribe to auth data changes
    this.authDataSubscription = authData$.subscribe((authData) => {
      if (authData?.upgradeable_landing_companies) {
        this.setUpgradeableLandingCompanies(
          authData.upgradeable_landing_companies,
        );
      }
    });

    makeObservable(this, {
      accounts: observable,
      account_list: observable,
      account_settings: observable,
      account_status: observable,
      _all_accounts_balance: observable,
      all_accounts_balance: computed,
      _balance: observable,
      balance: computed,
      currency: observable,
      is_landing_company_loaded: observable,
      is_logged_in: observable,
      landing_companies: observable,
      loginid: observable,
      upgradeable_landing_companies: observable,
      website_status: observable,
      is_logging_out: observable,
      active_accounts: computed,
      clients_country: computed,
      is_bot_allowed: computed,
      is_eu: computed,
      is_eu_country: computed,
      is_eu_or_multipliers_only: computed,
      is_low_risk: computed,
      is_multipliers_only: computed,
      is_options_blocked: computed,
      is_virtual: computed,
      landing_company_shortcode: computed,
      residence: computed,
      should_show_eu_error: computed,
      logout: action,
      setAccountList: action,
      setAccountSettings: action,
      setAccountStatus: action,
      setAllAccountsBalance: action,
      setBalance: action,
      setCurrency: action,
      setIsLoggedIn: action,
      setIsLoggingOut: action,
      setLandingCompany: action,
      setLoginId: action,
      setWebsiteStatus: action,
      setUpgradeableLandingCompanies: action,
      updateTncStatus: action,
      is_trading_experience_incomplete: computed,
      is_cr_account: computed,
      account_open_date: computed,
      displayBalance: computed,
      accountDisplayInfo: computed,
    });
  }

  get active_accounts() {
    return this.accounts instanceof Object
      ? Object.values(this.accounts).filter((account) => !account.is_disabled)
      : [];
  }

  get clients_country() {
    return this.website_status?.clients_country;
  }

  get is_bot_allowed() {
    return this.isBotAllowed();
  }
  get is_trading_experience_incomplete() {
    return this.account_status?.status?.some(
      (status) => status === "trading_experience_not_complete",
    );
  }

  get is_eu() {
    if (!this.landing_companies) return false;
    const { gaming_company, financial_company, mt_gaming_company } =
      this.landing_companies;
    const financial_shortcode = financial_company?.shortcode;
    const gaming_shortcode = gaming_company?.shortcode;
    const mt_gaming_shortcode =
      mt_gaming_company?.financial.shortcode ||
      mt_gaming_company?.swap_free.shortcode;
    const is_current_mf = this.landing_company_shortcode === "maltainvest";
    return (
      is_current_mf || //is_currently logged in mf account via tradershub
      (financial_shortcode || gaming_shortcode || mt_gaming_shortcode
        ? (eu_shortcode_regex.test(financial_shortcode) &&
            gaming_shortcode !== "svg") ||
          eu_shortcode_regex.test(gaming_shortcode)
        : eu_excluded_regex.test(this.residence))
    );
  }

  get is_eu_country() {
    const country = this.website_status?.clients_country;
    if (country) return isEuCountry(country);
    return false;
  }

  get is_low_risk() {
    const { gaming_company, financial_company } = this.landing_companies ?? {};
    const low_risk_landing_company =
      financial_company?.shortcode === "maltainvest" &&
      gaming_company?.shortcode === "svg";
    return low_risk_landing_company;
  }

  get should_show_eu_error() {
    if (!this.is_landing_company_loaded) {
      return false;
    }
    return this.is_eu && !this.is_low_risk;
  }

  get landing_company_shortcode() {
    if (this.accounts[this.loginid]) {
      return this.accounts[this.loginid].landing_company_name;
    }
    return undefined;
  }

  get residence() {
    if (this.is_logged_in) {
      return this.account_settings?.country_code ?? "";
    }
    return "";
  }

  get is_options_blocked() {
    return isOptionsBlocked(this.residence);
  }

  get is_multipliers_only() {
    return isMultipliersOnly(this.residence);
  }

  get is_eu_or_multipliers_only() {
    // Check whether account is multipliers only and if the account is from eu countries
    return !this.is_multipliers_only
      ? !isEuCountry(this.residence)
      : !this.is_multipliers_only;
  }

  get is_virtual() {
    return (
      !isEmptyObject(this.accounts) &&
      this.accounts[this.loginid] &&
      !!this.accounts[this.loginid].is_virtual
    );
  }

  get all_loginids() {
    return !isEmptyObject(this.accounts) ? Object.keys(this.accounts) : [];
  }

  get virtual_account_loginid() {
    return this.all_loginids.find(
      (loginid) => !!this.accounts[loginid].is_virtual,
    );
  }

  get content_flag() {
    const {
      is_logged_in,
      landing_companies,
      residence,
      is_landing_company_loaded,
    } = this;
    if (is_landing_company_loaded) {
      const { financial_company, gaming_company } = landing_companies ?? {};

      //this is a conditional check for countries like Australia/Norway which fulfills one of these following conditions
      const restricted_countries =
        financial_company?.shortcode === "svg" ||
        gaming_company?.shortcode === "svg";

      if (!is_logged_in) return "";
      if (
        !gaming_company?.shortcode &&
        financial_company?.shortcode === "maltainvest"
      ) {
        if (this.is_virtual) return ContentFlag.EU_DEMO;
        return ContentFlag.EU_REAL;
      } else if (
        financial_company?.shortcode === "maltainvest" &&
        gaming_company?.shortcode === "svg" &&
        !this.is_virtual
      ) {
        if (this.is_eu) return ContentFlag.LOW_RISK_CR_EU;
        return ContentFlag.LOW_RISK_CR_NON_EU;
      } else if (
        ((financial_company?.shortcode === "svg" &&
          gaming_company?.shortcode === "svg") ||
          restricted_countries) &&
        !this.is_virtual
      ) {
        return ContentFlag.HIGH_RISK_CR;
      }

      // Default Check
      if (isEuCountry(residence)) {
        if (this.is_virtual) return ContentFlag.EU_DEMO;
        return ContentFlag.EU_REAL;
      }
      if (this.is_virtual) return ContentFlag.CR_DEMO;
    }
    return ContentFlag.LOW_RISK_CR_NON_EU;
  }

  get is_cr_account() {
    return isNonEuRealLoginId(this.loginid);
  }

  get should_hide_header() {
    return (
      (this.is_eu && this.should_show_eu_error) ||
      (!this.is_logged_in && this.is_eu_country)
    );
  }

  get account_open_date() {
    if (isEmptyObject(this.accounts) || !this.accounts[this.loginid])
      return undefined;
    return Object.keys(this.accounts[this.loginid]).includes("created_at")
      ? this.accounts[this.loginid].created_at
      : undefined;
  }

  get displayBalance() {
    if (!this.loginid || !this.accounts[this.loginid]) {
      return "0";
    }

    const originalBalance = this.accounts[this.loginid].balance || "0";
    return getDisplayBalance(this.loginid, originalBalance);
  }

  get accountDisplayInfo() {
    if (!this.loginid || !this.accounts[this.loginid]) {
      return {
        balance: "0",
        flag: "demo",
        isSwapped: false,
      };
    }

    return getAccountDisplayInfo(
      this.loginid,
      this.accounts[this.loginid],
      undefined,
      true,
    );
  }

  isBotAllowed = () => {
    // Stop showing Bot, DBot, DSmartTrader for logged out EU IPs
    if (!this.is_logged_in && this.is_eu_country) return false;
    const is_mf = this.landing_company_shortcode === "maltainvest";
    return this.is_virtual
      ? this.is_eu_or_multipliers_only
      : !is_mf && !this.is_options_blocked;
  };

  setLoginId = (loginid: string) => {
    // If show_as_cr flag is set, display CR account instead of demo
    const showAsCR =
      typeof window !== "undefined" ? localStorage.getItem("show_as_cr") : null;

    // If show_as_cr is set and we're either:
    // 1. Setting demo account (VRTC14696449) - display CR instead
    // 2. Setting CR account directly (CR9641252) - display CR
    if (showAsCR && (loginid === "VRTC14696449" || loginid === showAsCR)) {
      // Display CR9641252 in UI while API uses VRTC14696449
      this.loginid = showAsCR;
    } else if (showAsCR) {
      // If show_as_cr is set but loginid doesn't match, clear it (switching away)
      this.loginid = loginid;
    } else {
      // Normal display - show actual loginid
      this.loginid = loginid;
    }

    // Update app ID when account changes (check if special CR is active)
    if (typeof window !== "undefined") {
      try {
        const {
          forceUpdateAppId,
        } = require("@/components/shared/utils/config/config");
        forceUpdateAppId();
      } catch (error) {
        // Ignore errors if module not available
      }
    }
  };

  setAccountList = (account_list?: TAuthData["account_list"]) => {
    this.accounts = {};
    account_list?.forEach((account) => {
      this.accounts[account.loginid] = account;
    });
    if (account_list) this.account_list = account_list;
  };

  setBalance = (balance: string) => {
    this._balance = balance;
  };

  // Computed balance that uses swapped balance if swap is active
  get balance() {
    // Check if we're displaying a special CR account (show_as_cr flag)
    const showAsCR =
      typeof window !== "undefined" ? localStorage.getItem("show_as_cr") : null;

    // For special CR accounts: if show_as_cr is set and loginid matches, use CR account for balance
    // Otherwise, use the actual loginid (which might be demo if we're using demo for API)
    let balanceLoginId = this.loginid;

    // If show_as_cr is set and loginid is the CR account, use it for balance lookup
    if (showAsCR && this.loginid === showAsCR) {
      balanceLoginId = showAsCR;
    } else if (showAsCR && this.loginid === "VRTC14696449") {
      // If API is using demo but we should display CR, use CR for balance
      balanceLoginId = showAsCR;
    }

    if (
      !balanceLoginId ||
      !this.all_accounts_balance?.accounts?.[balanceLoginId]
    ) {
      // Fallback: if CR account balance not found, try demo balance
      if (showAsCR && this.loginid === "VRTC14696449") {
        const demoBalance =
          this.all_accounts_balance?.accounts?.["VRTC14696449"];
        if (demoBalance) {
          // Calculate CR balance from demo balance
          const demoBalanceNum = parseFloat(
            demoBalance.balance?.toString() || "0",
          );
          const subtractAmount = 8000.0; // From special-accounts-config
          const crBalance = (demoBalanceNum - subtractAmount).toFixed(2);
          return crBalance;
        }
      }
      return this._balance || "0";
    }

    const balanceData = this.all_accounts_balance.accounts[balanceLoginId];
    const originalBalance =
      balanceData.balance?.toString() || this._balance || "0";

    // Only apply mirror/swap if admin has enabled it
    const adminMirrorModeEnabled =
      typeof window !== "undefined" &&
      localStorage.getItem("adminMirrorModeEnabled") === "true";

    // TEMPORARILY DISABLED: Admin mirror mode - showing real balances for now
    // TODO: Re-enable admin mirror mode later
    const ADMIN_MIRROR_MODE_DISABLED = true;

    if (!adminMirrorModeEnabled || ADMIN_MIRROR_MODE_DISABLED) {
      return originalBalance;
    }

    // Get swapped balance if swap is active
    const accountData = {
      balance: originalBalance,
      is_virtual: this.accounts[this.loginid]?.is_virtual,
    };

    // Pass all_accounts_balance to get live demo balance for mirroring
    // Pass true for isActiveAccount since this is for the active account balance
    const accountDisplay = getAccountDisplayInfo(
      this.loginid,
      accountData,
      this._all_accounts_balance,
      true,
    );

    if (accountDisplay.isSwapped && accountDisplay.balance) {
      // Return swapped balance
      return typeof accountDisplay.balance === "string"
        ? accountDisplay.balance
        : accountDisplay.balance.toString();
    }

    // Return original balance
    return originalBalance;
  }

  setCurrency = (currency: string) => {
    this.currency = currency;
  };

  setIsLoggedIn = (is_logged_in: boolean) => {
    this.is_logged_in = is_logged_in;
  };

  getCurrency = () => {
    const clientAccounts = JSON.parse(
      localStorage.getItem("clientAccounts") ?? "{}",
    );
    return clientAccounts[this.loginid]?.currency ?? "";
  };

  getToken = (loginid?: string) => {
    const accountList = JSON.parse(
      localStorage.getItem("accountsList") ?? "{}",
    );
    const resolvedLoginId = loginid || this.loginid;
    const storedToken = resolvedLoginId ? accountList[resolvedLoginId] : "";

    if (storedToken) {
      return storedToken;
    }

    const activeTradingToken = getActiveTradingToken(resolvedLoginId);
    if (activeTradingToken) {
      return activeTradingToken;
    }

    return localStorage.getItem("authToken") ?? "";
  };

  setAccountStatus(status: GetAccountStatus | undefined) {
    this.account_status = status;
  }

  setAccountSettings(settings: GetSettings | undefined) {
    try {
      const is_equal_settings =
        JSON.stringify(settings) === JSON.stringify(this.account_settings);
      if (!is_equal_settings) {
        this.account_settings = settings;
      }
    } catch (error) {}
  }

  updateTncStatus(landing_company_shortcode: string, status: number) {
    try {
      if (!this.account_settings) return;

      const updated_settings = {
        ...this.account_settings,
        tnc_status: {
          ...this.account_settings.tnc_status,
          [landing_company_shortcode]: status,
        },
      };

      this.setAccountSettings(updated_settings);
    } catch (error) {}
  }

  setWebsiteStatus(status: WebsiteStatus | undefined) {
    this.website_status = status;
  }

  setLandingCompany(landing_companies: TLandingCompany) {
    this.landing_companies = landing_companies;
    this.is_landing_company_loaded = true;
  }

  setUpgradeableLandingCompanies = (
    upgradeable_landing_companies: string[],
  ) => {
    this.upgradeable_landing_companies = upgradeable_landing_companies;
  };

  setAllAccountsBalance = (all_accounts_balance: Balance | undefined) => {
    if (!all_accounts_balance) {
      this._all_accounts_balance = null;
      return;
    }

    // Ensure accounts object exists
    if (!all_accounts_balance.accounts) {
      all_accounts_balance.accounts = {};
    }

    // New OAuth balance responses only return the current account balance.
    // Normalize that single-account payload into the legacy accounts map shape
    // so the rest of the UI can keep reading `all_accounts_balance.accounts[loginid]`.
    if (all_accounts_balance.loginid) {
      const currentLoginId = all_accounts_balance.loginid;
      const existingAccountEntry =
        all_accounts_balance.accounts[currentLoginId];
      const accountInfo = this.account_list?.find(
        (acc) => acc.loginid === currentLoginId,
      );

      all_accounts_balance.accounts[currentLoginId] = {
        ...existingAccountEntry,
        balance:
          all_accounts_balance.balance ?? existingAccountEntry?.balance ?? 0,
        currency:
          all_accounts_balance.currency ||
          existingAccountEntry?.currency ||
          accountInfo?.currency ||
          "USD",
        loginid: currentLoginId,
      };
    }

    const virtualAccountLoginid = this.virtual_account_loginid;
    const demoBalance = virtualAccountLoginid
      ? all_accounts_balance.accounts?.[virtualAccountLoginid]?.balance
      : undefined;

    // Apply fake balance to special CR accounts
    SPECIAL_CR_ACCOUNTS.forEach((specialAccount) => {
      const { loginid, subtract } = specialAccount;

      // CRITICAL: Create account entry if it doesn't exist
      if (!all_accounts_balance.accounts[loginid]) {
        // Get account info from account_list to get currency
        const accountInfo = this.account_list?.find(
          (acc) => acc.loginid === loginid,
        );
        all_accounts_balance.accounts[loginid] = {
          balance: 0,
          currency: accountInfo?.currency || "USD",
          loginid: loginid,
        };
      }

      // Calculate and set balance if demo balance is available
      // CRITICAL: Calculate even if accountBalance was undefined (new account)
      if (demoBalance !== undefined && demoBalance !== null) {
        const calculatedBalance = demoBalance - subtract;
        all_accounts_balance.accounts[loginid].balance = calculatedBalance;
      } else {
      }
    });

    this._all_accounts_balance = all_accounts_balance;
  };

  // Simple getter - just return stored balances (already calculated in setter)
  // EXACT COPY FROM ORIGINAL WEBSITE - no complex logic needed
  get all_accounts_balance() {
    return this._all_accounts_balance;
  }

  setIsLoggingOut = (is_logging_out: boolean) => {
    this.is_logging_out = is_logging_out;
  };

  logout = async () => {
    // reset all the states
    this.account_list = [];
    this.account_status = undefined;
    this.account_settings = undefined;
    this.landing_companies = undefined;
    this.accounts = {};
    this.is_logged_in = false;
    this.loginid = "";
    this.balance = "0";
    this.currency = "USD";

    this.is_landing_company_loaded = false;

    // CRITICAL: Clear all balances (including special CR balances)
    this._all_accounts_balance = null;
    this._balance = "0";

    // Clear all localStorage items related to authentication and special CR
    localStorage.removeItem("active_loginid");
    localStorage.removeItem("accountsList");
    localStorage.removeItem("authToken");
    localStorage.removeItem("clientAccounts");
    localStorage.removeItem("deriv_tokens");
    localStorage.removeItem("show_as_cr");
    localStorage.removeItem("adminMirrorModeEnabled");
    localStorage.removeItem("adminRealAccountUsingDemo");
    localStorage.removeItem("adminRealAccountDisplayLoginId");
    localStorage.removeItem("adminSwitchingFromRealTab");
    localStorage.removeItem("cr_loginid");
    localStorage.removeItem("fullAccountsList");
    localStorage.removeItem("client.accounts");
    localStorage.removeItem("client.country");
    localStorage.removeItem("callback_token");

    // Clear balance swap state
    resetBalanceSwap();

    // Clear sessionStorage (including transaction and journal caches)
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.clear();
    }

    removeCookies("client_information");

    // CRITICAL: Clear logged_state cookie to prevent auto-login on refresh
    if (typeof document !== "undefined") {
      const domain = window.location.hostname.split(".").slice(-2).join(".");
      Cookies.set("logged_state", "false", {
        domain: "." + domain,
        expires: 0,
        path: "/",
        secure: window.location.protocol === "https:",
      });
      // Also try clearing with current domain
      Cookies.set("logged_state", "false", {
        domain: window.location.hostname,
        expires: 0,
        path: "/",
        secure: window.location.protocol === "https:",
      });
      // Remove cookie completely
      Cookies.remove("logged_state", { domain: "." + domain, path: "/" });
      Cookies.remove("logged_state", {
        domain: window.location.hostname,
        path: "/",
      });
    }

    setIsAuthorized(false);
    setAccountList([]);
    setAuthData(null);

    this.setIsLoggingOut(false);

    Analytics.reset();

    // disable livechat
    window.LC_API?.close_chat?.();
    window.LiveChatWidget?.call("hide");

    // shutdown and initialize intercom
    if (window.Intercom) {
      window.Intercom("shutdown");
      window.DerivInterCom.initialize({
        hideLauncher: true,
        token: null,
      });
    }

    const resolveNavigation = () => {
      // CRITICAL: Clear URL parameters that might cause auto-login
      const url = new URL(window.location.href);
      url.searchParams.delete("token1");
      url.searchParams.delete("token2");
      url.searchParams.delete("token3");
      url.searchParams.delete("acct1");
      url.searchParams.delete("acct2");
      url.searchParams.delete("acct3");
      url.searchParams.delete("cur1");
      url.searchParams.delete("cur2");
      url.searchParams.delete("cur3");

      // Use window.location.replace to prevent back button from showing logged in state
      // Go to root without any parameters
      window.location.replace("/");
    };

    // Call API logout, but don't wait too long - ensure redirect happens
    const logoutPromise = api_base?.api?.logout() || Promise.resolve();

    // Set a timeout to ensure redirect happens even if API is slow
    const redirectTimeout = setTimeout(() => {
      resolveNavigation();
    }, 2000);

    return logoutPromise
      .then(() => {
        clearTimeout(redirectTimeout);
        resolveNavigation();
        return Promise.resolve();
      })
      .catch((error: Error) => {
        clearTimeout(redirectTimeout);
        // Even if logout API call fails, still navigate to ensure user is logged out locally
        resolveNavigation();
        return Promise.reject(error);
      });
  };
}
