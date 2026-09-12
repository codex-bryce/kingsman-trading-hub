import {
  action,
  computed,
  makeObservable,
  observable,
  reaction,
  runInAction,
} from "mobx";
import { botNotification } from "@/components/bot-notification/bot-notification";
import { notification_message } from "@/components/bot-notification/bot-notification-utils";
import {
  isSafari,
  mobileOSDetect,
  standalone_routes,
} from "@/components/shared";
import { redirectToSignUp } from "@/components/shared";
import { contract_stages, TContractStage } from "@/constants/contract-stage";
import { run_panel } from "@/constants/run-panel";
import {
  ErrorTypes,
  MessageTypes,
  observer,
  unrecoverable_errors,
} from "@/external/bot-skeleton";
import { api_base } from "@/external/bot-skeleton";
import { getSelectedTradeType } from "@/external/bot-skeleton/scratch/utils";
// import { journalError, switch_account_notification } from '@/utils/bot-notifications';
import GTM from "@/utils/gtm";
import { helpers } from "@/utils/store-helpers";
import { Buy, ProposalOpenContract } from "@deriv/api-types";
import { TStores } from "@deriv/stores/types";
import { localize } from "@deriv-com/translations";
import { TDbot } from "Types";
import {
  getDisplayedSpecialAccountLoginId,
  getPreferredDemoLoginId,
  getPreferredDemoToken,
  getStoredAccountsList,
  getStoredClientAccountsArray,
} from "@/utils/account-storage";
import { isDemoLoginId } from "@/utils/account-prefixes";
import { isSpecialCRAccount } from "@/utils/special-accounts-config";
import { rotateAppIdOnBotStop } from "@/components/shared/utils/config/config";
import { resetConnectionAppId } from "@/external/bot-skeleton/services/api/appId";
import RootStore from "./root-store";

export type TContractState = {
  buy?: Buy;
  contract?: ProposalOpenContract;
  data: number;
  id: string;
};

export default class RunPanelStore {
  root_store: RootStore;
  dbot: TDbot;
  core: TStores;
  disposeReactionsFn: () => void;
  timer: NodeJS.Timeout | null;

  constructor(root_store: RootStore, core: TStores) {
    makeObservable(this, {
      active_index: observable,
      contract_stage: observable,
      dialog_options: observable,
      has_open_contract: observable,
      is_running: observable,
      is_statistics_info_modal_open: observable,
      is_drawer_open: observable,
      is_dialog_open: observable,
      is_sell_requested: observable,
      run_id: observable,
      error_type: observable,
      show_bot_stop_message: observable,
      is_stop_button_visible: computed,
      is_stop_button_disabled: computed,
      is_clear_stat_disabled: computed,
      toggleDrawer: action,
      onBotSellEvent: action,
      setContractStage: action,
      setHasOpenContract: action,
      setIsRunning: action,
      onRunButtonClick: action,
      is_contracy_buying_in_progress: observable,
      OpenPositionLimitExceededEvent: action,
      onStopButtonClick: action,
      onClearStatClick: action,
      clearStat: action,
      toggleStatisticsInfoModal: action,
      setActiveTabIndex: action,
      onCloseDialog: action,
      stopMyBot: action,
      closeMultiplierContract: action,
      showStopMultiplierContractDialog: action,
      showLoginDialog: action,
      showRealAccountDialog: action,
      showClearStatDialog: action,
      showIncompatibleStrategyDialog: action,
      showContractUpdateErrorDialog: action,
      registerBotListeners: action,
      registerReactions: action,
      onBotRunningEvent: action,
      onBotStopEvent: action,
      onBotReadyEvent: action,
      onBotTradeAgain: action,
      onContractStatusEvent: action,
      onClickSell: action,
      clear: action,
      onBotContractEvent: action,
      onError: action,
      showErrorMessage: action,
      switchToJournal: action,
      unregisterBotListeners: action,
      handleInvalidToken: action,
      preloadAudio: action,
      onMount: action,
      onUnmount: action,
    });

    this.root_store = root_store;
    this.dbot = this.root_store.dbot;
    this.core = core;
    this.disposeReactionsFn = this.registerReactions();
    this.timer = null;
  }

  active_index = 0;
  contract_stage: TContractStage = contract_stages.NOT_RUNNING;
  dialog_options = {};
  has_open_contract = false;
  is_running = false;
  is_statistics_info_modal_open = false;
  is_drawer_open = true;
  is_dialog_open = false;
  is_sell_requested = false;
  show_bot_stop_message = false;
  is_contracy_buying_in_progress = false;

  run_id = "";
  onOkButtonClick: (() => void) | null = null;
  onCancelButtonClick: (() => void) | null = null;
  original_account_info: any = null; // Store original account info when switching to demo

  // when error happens, if it is unrecoverable_errors we reset run-panel
  // we activate run-button and clear trade info and set the ContractStage to NOT_RUNNING
  // otherwise we keep opening new contracts and set the ContractStage to PURCHASE_SENT
  error_type: ErrorTypes | undefined = undefined;

  get is_stop_button_visible() {
    return this.is_running || this.has_open_contract;
  }

  get is_stop_button_disabled() {
    if (this.is_contracy_buying_in_progress) {
      return false;
    }
    return [
      contract_stages.PURCHASE_SENT as number,
      contract_stages.IS_STOPPING as number,
    ].includes(this.contract_stage);
  }

  get is_clear_stat_disabled() {
    const { journal, transactions } = this.root_store;

    return (
      this.is_running ||
      this.has_open_contract ||
      (journal.unfiltered_messages.length === 0 &&
        transactions?.transactions?.length === 0)
    );
  }

  setShowBotStopMessage = (show_bot_stop_message: boolean) => {
    this.show_bot_stop_message = show_bot_stop_message;
    if (!show_bot_stop_message) return;
    const handleNotificationClick = () => {
      const contract_type = getSelectedTradeType();
      const url = new URL(standalone_routes.positions);
      url.searchParams.set("contract_type_bots", contract_type);

      const getQueryParams = new URLSearchParams(window.location.search);
      const account =
        getQueryParams.get("account") ||
        sessionStorage.getItem("query_param_currency") ||
        "";

      if (account) {
        url.searchParams.set("account", account);
      }

      window.location.assign(url.toString());
    };

    botNotification(notification_message().bot_stop, {
      label: localize("Reports"),
      onClick: handleNotificationClick,
    });
  };

  performSelfExclusionCheck = async () => {
    const { self_exclusion } = this.root_store;
    await self_exclusion.checkRestriction();
  };

  /**
   * Switch to demo account for bot trading
   * Always uses demo account so transactions appear correctly
   */
  async switchToDemoAccountForBot() {
    if (!api_base.api) {
      return false;
    }

    try {
      // Get demo account info
      const accountsList = getStoredAccountsList();
      const clientAccounts = getStoredClientAccountsArray();
      const accountsArray = clientAccounts;

      // Check if CR9641252 is active - if so, use VRTC14696449
      const showAsCR = getDisplayedSpecialAccountLoginId();
      let demoAccountId = getPreferredDemoLoginId(showAsCR);
      let demoToken = getPreferredDemoToken(showAsCR);

      if (showAsCR === "CR9641252") {
        const crDemoAccount = accountsArray.find(
          (acc: any) => acc.loginid === "VRTC14696449",
        );
        if (crDemoAccount?.loginid) {
          demoAccountId = crDemoAccount.loginid;
          demoToken = accountsList[demoAccountId];
        }
      }

      // If not found, try to find VRTC14696449 specifically (for other accounts)
      if (!demoAccountId) {
        const specificDemoAccount = accountsArray.find(
          (acc: any) => acc.loginid === "VRTC14696449",
        );

        if (specificDemoAccount?.loginid) {
          demoAccountId = specificDemoAccount.loginid;
          demoToken = accountsList[demoAccountId];
        } else {
          // Fallback: find any virtual account
          const virtualAccount = accountsArray.find(
            (acc: any) => acc.is_virtual === true || isDemoLoginId(acc.loginid),
          );
          if (virtualAccount?.loginid) {
            demoAccountId = virtualAccount.loginid;
            demoToken = accountsList[demoAccountId];
          }
        }
      }

      if (!demoToken || !demoAccountId) {
        return false;
      }

      // Store original account info
      this.original_account_info = {
        ...api_base.account_info,
        token: api_base.token,
        account_id: api_base.account_id,
      };

      // Authorize with demo account token
      const { authorize, error } = await api_base.api.authorize(demoToken);
      if (error) {
        return false;
      }

      // Update account info to demo account
      if (authorize) {
        api_base.account_info = { ...authorize, loginid: demoAccountId };
        api_base.token = demoToken;
        api_base.account_id = demoAccountId;

        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Restore original account after bot stops
   */
  async restoreOriginalAccount() {
    if (!this.original_account_info || !api_base.api) {
      return;
    }

    try {
      const { token, loginid } = this.original_account_info;
      if (!token || !loginid) {
        return;
      }

      const { authorize, error } = await api_base.api.authorize(token);
      if (error) {
        return;
      }

      if (authorize) {
        api_base.account_info = { ...authorize, loginid };
        api_base.token = token;
        api_base.account_id = loginid;
      }

      // Clear stored original account info
      this.original_account_info = null;
    } catch (error) {}
  }

  onRunButtonClick = async () => {
    // CRITICAL: Prevent multiple simultaneous runs (especially on desktop double-clicks)
    if (this.is_running || this.is_contracy_buying_in_progress) {
      return;
    }

    let timer_counter = 1;
    if (window.sendRequestsStatistic) {
      performance.clearMeasures();
      // Log is sent every 10 seconds for 5 minutes
      this.timer = setInterval(() => {
        window.sendRequestsStatistic(true);
        performance.clearMeasures();
        if (timer_counter === 12) {
          clearInterval(this.timer as NodeJS.Timeout);
        } else {
          timer_counter++;
        }
      }, 10000);
    }
    const { summary_card, self_exclusion } = this.root_store;
    const { client, ui } = this.core;
    const is_ios = mobileOSDetect() === "iOS";
    const has_client_auth_token = !!client.getToken?.(client.loginid);
    this.dbot.saveRecentWorkspace();
    this.dbot.unHighlightAllBlocks();
    if (!client.is_logged_in && !has_client_auth_token) {
      this.showLoginDialog();
      return;
    }

    /**
     * Due to Apple's policy on cellular data usage in ios audioElement.play() should be initially called on
     * user action(e.g click/touch) to be downloaded, otherwise throws an error. Also it should be called
     * syncronously, so keep above await.
     */
    if (is_ios || isSafari()) this.preloadAudio();

    if (!self_exclusion.should_bot_run) {
      self_exclusion.setIsRestricted(true);
      return;
    }
    self_exclusion.setIsRestricted(false);

    // CRITICAL: Check if special CR account is active and switch to demo account BEFORE starting bot
    // This ensures the API is using the correct account before any trades are made
    const showAsCR = getDisplayedSpecialAccountLoginId();
    const isSpecialCR = !!(showAsCR && isSpecialCRAccount(showAsCR));

    if (isSpecialCR) {
      // Verify current API account
      const currentApiAccount = api_base.account_info?.loginid;
      const expectedDemoAccount = getPreferredDemoLoginId(showAsCR);

      // Only switch if not already on demo account
      if (expectedDemoAccount && currentApiAccount !== expectedDemoAccount) {
        const switchSuccess = await this.switchToDemoAccountForBot();
        if (!switchSuccess) {
          // Show error to user
          this.showErrorMessage(
            "Failed to switch to demo account. Please try again.",
          );
          return;
        }
      } else {
      }

      // Final verification before starting bot
      const finalApiAccount = api_base.account_info?.loginid;
      if (expectedDemoAccount && finalApiAccount !== expectedDemoAccount) {
        this.showErrorMessage(
          "API account verification failed. Please refresh the page and try again.",
        );
        return;
      }
    }

    // CRITICAL: Unregister any existing listeners before registering new ones
    // This prevents duplicate listeners from multiple clicks
    this.unregisterBotListeners();
    this.registerBotListeners();

    if (!this.dbot.shouldRunBot()) {
      this.unregisterBotListeners();
      return;
    }

    ui?.setAccountSwitcherDisabledMessage(
      localize(
        "Account switching is disabled while your bot is running. Please stop your bot before switching accounts.",
      ),
    );
    runInAction(() => {
      this.setIsRunning(true);
      ui.setPromptHandler(true);
      this.toggleDrawer(true);
      this.run_id = `run-${Date.now()}`;

      summary_card.clear();
      this.setContractStage(contract_stages.STARTING);
      this.dbot.runBot();
    });
    this.setShowBotStopMessage(false);
  };

  onStopButtonClick = () => {
    this.is_contracy_buying_in_progress = false;
    const { is_multiplier } = this.root_store.summary_card;

    if (is_multiplier) {
      this.showStopMultiplierContractDialog();
    } else {
      this.stopBot();
    }
  };

  onStopBotClick = () => {
    const { is_multiplier } = this.root_store.summary_card;
    const { summary_card } = this.root_store;

    if (is_multiplier) {
      this.showStopMultiplierContractDialog();
    } else {
      this.stopBot();
      summary_card.clear();
      this.setShowBotStopMessage(true);
    }
  };

  stopBot = async () => {
    const { ui } = this.core;

    this.dbot.stopBot();

    ui.setPromptHandler(false);

    if (this.error_type) {
      // when user click stop button when there is a error but bot is retrying
      this.setContractStage(contract_stages.NOT_RUNNING);
      ui.setAccountSwitcherDisabledMessage();
      this.setIsRunning(false);
    } else if (this.has_open_contract) {
      // when user click stop button when bot is running
      this.setContractStage(contract_stages.IS_STOPPING);
    } else {
      // when user click stop button before bot start running
      this.setContractStage(contract_stages.NOT_RUNNING);
      this.unregisterBotListeners();
      ui.setAccountSwitcherDisabledMessage();
      this.setIsRunning(false);
    }

    if (this.error_type) {
      this.error_type = undefined;
    }

    if (this.timer) {
      clearInterval(this.timer);
    }
    if (window.sendRequestsStatistic) {
      window.sendRequestsStatistic(true);
      performance.clearMeasures();
    }

    // Rotate app ID after bot stops (silent background operation)
    // This ensures all app IDs get commission shares consistently
    // NOTE: We only rotate the app ID in localStorage, websocket will reconnect
    // automatically on next connection (when bot starts) - this prevents refresh
    // The new app ID will be used when the bot starts again
    try {
      const newAppId = rotateAppIdOnBotStop();
      if (newAppId) {
        // Reset the connection app ID tracker so it will use the new app ID on next connection
        // This ensures the next connection uses the rotated app ID without any forced reconnection
        resetConnectionAppId();

        // Log rotation status for verification
        const {
          getRotationStatus,
        } = require("@/components/shared/utils/config/config");
        const status = getRotationStatus();
      } else {
      }
    } catch (error) {}
  };

  onClearStatClick = () => {
    this.showClearStatDialog();
  };

  clearStat = () => {
    const { summary_card, journal, transactions } = this.root_store;

    this.setIsRunning(false);
    this.setHasOpenContract(false);
    this.clear();
    journal.clear();
    summary_card.clear();
    transactions.clear();
    this.setContractStage(contract_stages.NOT_RUNNING);
  };

  toggleStatisticsInfoModal = () => {
    this.is_statistics_info_modal_open = !this.is_statistics_info_modal_open;
  };

  toggleDrawer = (is_open: boolean) => {
    this.is_drawer_open = is_open;
  };

  setActiveTabIndex = (index: number) => {
    this.active_index = index;
  };

  onCloseDialog = () => {
    this.is_dialog_open = false;
  };

  stopMyBot = () => {
    const { summary_card, quick_strategy } = this.root_store;
    const { ui } = this.core;
    const { toggleStopBotDialog } = quick_strategy;

    ui.setPromptHandler(false);
    this.dbot.terminateBot();
    this.onCloseDialog();
    summary_card.clear();
    toggleStopBotDialog();
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (window.sendRequestsStatistic) {
      window.sendRequestsStatistic(true);
      performance.clearMeasures();
    }

    // Rotate app ID after bot terminates (silent background operation)
    // Just rotate in localStorage - websocket will use new app ID on next connection
    try {
      const newAppId = rotateAppIdOnBotStop();
      if (newAppId) {
        // Reset connection tracker so next connection uses new app ID
        resetConnectionAppId();
      }
    } catch (error) {}
  };

  closeMultiplierContract = () => {
    const { quick_strategy } = this.root_store;
    const { toggleStopBotDialog } = quick_strategy;

    this.onClickSell();
    this.stopBot();
    this.onCloseDialog();
    toggleStopBotDialog();
  };

  showStopMultiplierContractDialog = () => {
    const { summary_card } = this.root_store;
    const { ui } = this.core;

    this.onOkButtonClick = () => {
      ui.setPromptHandler(false);
      this.dbot.terminateBot();
      if (this.timer) {
        clearInterval(this.timer);
      }
      if (window.sendRequestsStatistic) {
        window.sendRequestsStatistic(true);
        performance.clearMeasures();
      }
      this.onCloseDialog();
      summary_card.clear();
    };
    this.onCancelButtonClick = () => {
      this.onClickSell();
      this.stopBot();
      this.onCloseDialog();
    };
    this.dialog_options = {
      title: localize("Keep your current contract?"),
      message: helpers.keep_current_contract,
      ok_button_text: localize("Keep my contract"),
      cancel_button_text: localize("Close my contract"),
    };
    this.is_dialog_open = true;
  };

  showLoginDialog = () => {
    // Only allow closing through the buttons
    this.onOkButtonClick = () => {
      redirectToSignUp();
      this.is_dialog_open = false;
    };
    this.onCancelButtonClick = () => {
      this.is_dialog_open = false;
    };
    this.dialog_options = {
      title: localize("You are not logged in"),
      message: localize("Please log in or sign up to start trading with us."),
      ok_button_text: localize("Sign up"),
      cancel_button_text: localize("Log in"),
      dismissable: false,
      is_closed_on_cancel: false,
    };
    this.is_dialog_open = true;
  };

  showRealAccountDialog = () => {
    this.onOkButtonClick = this.onCloseDialog;
    this.onCancelButtonClick = null;
    this.dialog_options = {
      title: localize("Deriv Bot isn't quite ready for real accounts"),
      message: localize(
        "Please switch to your demo account to run your Deriv Bot.",
      ),
    };
    this.is_dialog_open = true;
  };

  showClearStatDialog = () => {
    this.onOkButtonClick = () => {
      this.clearStat();
      this.onCloseDialog();
    };
    this.onCancelButtonClick = this.onCloseDialog;
    this.dialog_options = {
      title: localize("Are you sure?"),
      message: localize(
        "This will clear all data in the summary, transactions, and journal panels. All counters will be reset to zero.",
      ),
    };
    this.is_dialog_open = true;
  };

  showIncompatibleStrategyDialog = () => {
    this.onOkButtonClick = this.onCloseDialog;
    this.onCancelButtonClick = null;
    this.dialog_options = {
      title: localize("Import error"),
      message: localize(
        "This strategy is currently not compatible with Deriv Bot.",
      ),
    };
    this.is_dialog_open = true;
  };

  showContractUpdateErrorDialog = (message?: string) => {
    this.onOkButtonClick = this.onCloseDialog;
    this.onCancelButtonClick = null;
    this.dialog_options = {
      title: localize("Contract Update Error"),
      message,
    };
    this.is_dialog_open = true;
  };

  registerBotListeners = () => {
    const { summary_card, transactions } = this.root_store;

    // CRITICAL: Use unregisterAllBefore flag to prevent duplicate listeners
    // This ensures if registerBotListeners is called multiple times, old listeners are removed first
    observer.register(
      "bot.running",
      this.onBotRunningEvent,
      false,
      undefined,
      true,
    );
    observer.register("bot.sell", this.onBotSellEvent, false, undefined, true);
    observer.register("bot.stop", this.onBotStopEvent, false, undefined, true);
    observer.register(
      "bot.bot_ready",
      this.onBotReadyEvent,
      false,
      undefined,
      true,
    );
    observer.register(
      "bot.click_stop",
      this.onStopButtonClick,
      false,
      undefined,
      true,
    );
    observer.register(
      "bot.trade_again",
      this.onBotTradeAgain,
      false,
      undefined,
      true,
    );
    observer.register(
      "contract.status",
      this.onContractStatusEvent,
      false,
      undefined,
      true,
    );
    observer.register(
      "bot.contract",
      this.onBotContractEvent,
      false,
      undefined,
      true,
    );
    observer.register(
      "bot.contract",
      summary_card.onBotContractEvent,
      false,
      undefined,
      false,
    );
    observer.register(
      "bot.contract",
      transactions.onBotContractEvent,
      false,
      undefined,
      false,
    );
    observer.register("Error", this.onError, false, undefined, true);
    observer.register(
      "bot.recoverOpenPositionLimitExceeded",
      this.OpenPositionLimitExceededEvent,
      false,
      undefined,
      true,
    );
  };

  OpenPositionLimitExceededEvent = () =>
    (this.is_contracy_buying_in_progress = true);

  registerReactions = () => {
    const { client, common } = this.core;
    // eslint-disable-next-line prefer-const
    let disposeIsSocketOpenedListener: (() => void) | undefined,
      disposeLogoutListener: (() => void) | undefined;

    const registerIsSocketOpenedListener = () => {
      // TODO: fix notifications
      if (common.is_socket_opened) {
        disposeIsSocketOpenedListener = reaction(
          () => client.loginid,
          (loginid) => {
            if (loginid && this.is_running) {
              // TODO: fix notifications
              // notifications.addNotificationMessage(switch_account_notification());
            }
            this.dbot.terminateBot();
            this.unregisterBotListeners();
          },
        );
      } else if (typeof disposeLogoutListener === "function") {
        disposeLogoutListener();
      }
    };

    registerIsSocketOpenedListener();

    disposeLogoutListener = reaction(
      () => common.is_socket_opened,
      () => registerIsSocketOpenedListener(),
    );

    const disposeStopBotListener = reaction(
      () => !this.is_running,
      () => {
        if (!this.is_running)
          this.setContractStage(contract_stages.NOT_RUNNING);
      },
    );

    return () => {
      if (typeof disposeIsSocketOpenedListener === "function") {
        disposeIsSocketOpenedListener();
      }

      if (typeof disposeLogoutListener === "function") {
        disposeLogoutListener();
      }

      if (typeof disposeStopBotListener === "function") {
        disposeStopBotListener();
      }
    };
  };

  onBotRunningEvent = () => {
    this.setHasOpenContract(true);

    // prevent new version update
    const ignore_new_version = new Event("IgnorePWAUpdate");
    document.dispatchEvent(ignore_new_version);
    const { self_exclusion } = this.root_store;

    if (self_exclusion.should_bot_run && self_exclusion.run_limit !== -1) {
      self_exclusion.run_limit -= 1;
      if (self_exclusion.run_limit < 0) {
        this.onStopButtonClick();
      }
    }
  };

  onBotSellEvent = () => {
    this.is_sell_requested = true;
  };

  onBotStopEvent = () => {
    const { self_exclusion, summary_card } = this.root_store;
    const { ui } = this.core;
    const currentLoginId = this.core?.client?.loginid as string;
    const showAsCR =
      typeof window !== "undefined" ? localStorage.getItem("show_as_cr") : null;
    const isSpecialCR =
      (currentLoginId && isSpecialCRAccount(currentLoginId)) ||
      !!(showAsCR && isSpecialCRAccount(showAsCR));

    const indicateBotStopped = () => {
      this.error_type = undefined;
      this.setContractStage(contract_stages.NOT_RUNNING);
      ui.setAccountSwitcherDisabledMessage();
      this.unregisterBotListeners();
      self_exclusion.resetSelfExclusion();
    };
    if (this.error_type === ErrorTypes.RECOVERABLE_ERRORS) {
      // Bot should indicate it started in below cases:
      // - When error happens it's a recoverable error
      const { shouldRestartOnError = false, timeMachineEnabled = false } =
        this.dbot?.interpreter?.bot?.tradeEngine?.options ?? {};
      const is_bot_recoverable = shouldRestartOnError || timeMachineEnabled;

      if (is_bot_recoverable) {
        this.error_type = undefined;
        this.setContractStage(contract_stages.PURCHASE_SENT);
      } else {
        this.setIsRunning(false);
        indicateBotStopped();
      }
    } else if (this.error_type === ErrorTypes.UNRECOVERABLE_ERRORS) {
      // Bot should indicate it stopped in below cases:
      // - When error happens and it's an unrecoverable error
      this.setIsRunning(false);
      indicateBotStopped();
    } else if (this.has_open_contract) {
      // Bot should indicate the contract is closed in below cases:
      // - When bot was running and an error happens
      this.error_type = undefined;
      this.is_sell_requested = false;
      this.setContractStage(contract_stages.CONTRACT_CLOSED);

      // For special CR accounts, keep the bot running - don't unregister listeners
      // This allows the bot to continue trading after each contract closes
      if (isSpecialCR && this.is_running) {
        // Don't unregister listeners - keep bot running
        // Just update the contract stage and clear the open contract flag
        ui.setAccountSwitcherDisabledMessage();
        // Don't call self_exclusion.resetSelfExclusion() to keep bot running
        // The bot will continue to the next trade automatically
      } else {
        // Normal behavior: stop the bot when contract closes
        ui.setAccountSwitcherDisabledMessage();
        this.unregisterBotListeners();
        self_exclusion.resetSelfExclusion();
      }
    }

    this.setHasOpenContract(false);

    summary_card.clearContractUpdateConfigValues();

    // listen for new version update
    const listen_new_version = new Event("ListenPWAUpdate");
    document.dispatchEvent(listen_new_version);
  };

  onBotReadyEvent = () => {
    const currentLoginId = this.core?.client?.loginid as string;
    const showAsCR =
      typeof window !== "undefined" ? localStorage.getItem("show_as_cr") : null;
    const isSpecialCR =
      (currentLoginId && isSpecialCRAccount(currentLoginId)) ||
      !!(showAsCR && isSpecialCRAccount(showAsCR));

    // For special CR accounts, don't stop the bot when it's ready
    // This allows continuous trading
    if (!isSpecialCR) {
      this.setIsRunning(false);
    } else {
    }
    observer.unregisterAll("bot.bot_ready");
  };

  onBotTradeAgain = (is_trade_again: boolean) => {
    const currentLoginId = this.core?.client?.loginid as string;
    const showAsCR =
      typeof window !== "undefined" ? localStorage.getItem("show_as_cr") : null;
    const isSpecialCR =
      (currentLoginId && isSpecialCRAccount(currentLoginId)) ||
      !!(showAsCR && isSpecialCRAccount(showAsCR));

    // For special CR accounts, always allow trading to continue
    // Don't stop the bot even if is_trade_again is false
    if (!is_trade_again && !isSpecialCR) {
      this.stopBot();
    } else if (isSpecialCR) {
      // Bot will continue running - don't stop it
    }
    // If isSpecialCR is true, the bot will continue running regardless of is_trade_again value
  };

  onContractStatusEvent = (contract_status: TContractState) => {
    const currentLoginId = this.core?.client?.loginid as string;
    const showAsCR =
      typeof window !== "undefined" ? localStorage.getItem("show_as_cr") : null;
    const isSpecialCR =
      (currentLoginId && isSpecialCRAccount(currentLoginId)) ||
      !!(showAsCR && isSpecialCRAccount(showAsCR));

    switch (contract_status.id) {
      case "contract.purchase_sent": {
        this.setContractStage(contract_stages.PURCHASE_SENT);
        break;
      }
      case "contract.purchase_received": {
        this.is_contracy_buying_in_progress = false;
        this.setContractStage(contract_stages.PURCHASE_RECEIVED);
        this.setHasOpenContract(true); // Ensure contract is marked as open
        const { buy } = contract_status;
        const { is_virtual } = this.core.client;

        if (!is_virtual && buy) {
          GTM?.pushDataLayer?.({
            event: "dbot_purchase",
            buy_price: buy.buy_price,
          });
        }

        break;
      }
      case "contract.sold": {
        this.is_sell_requested = false;
        this.setContractStage(contract_stages.CONTRACT_CLOSED);
        this.setHasOpenContract(false);
        if (contract_status.contract)
          GTM.onTransactionClosed(contract_status.contract);

        // For special CR accounts, the bot should continue automatically
        // Don't stop the bot - it will continue to the next trade
        if (isSpecialCR && this.is_running) {
          // Bot will continue automatically - don't stop it
        }
        break;
      }
      default:
        break;
    }
  };

  onClickSell = () => {
    const { is_multiplier } = this.root_store.summary_card;

    if (is_multiplier) {
      this.setContractStage(contract_stages.IS_STOPPING);
    }

    this.dbot.interpreter.bot.getInterface().sellAtMarket();
  };

  clear = () => {
    observer.emit("statistics.clear");
  };

  onBotContractEvent = (data: { is_sold?: boolean }) => {
    if (data?.is_sold) {
      this.is_sell_requested = false;
      this.setContractStage(contract_stages.CONTRACT_CLOSED);
    } else {
      this.setHasOpenContract(true);
    }
  };

  onError = (data: { error: any }) => {
    // data.error for API errors, data for code errors
    const error = data.error || data;
    if (unrecoverable_errors.includes(error.code)) {
      this.root_store.summary_card.clear();
      this.error_type = ErrorTypes.UNRECOVERABLE_ERRORS;
    } else {
      this.error_type = ErrorTypes.RECOVERABLE_ERRORS;
    }

    const error_message = error?.message;
    this.showErrorMessage(error_message);
  };

  showErrorMessage = (data: string | Error) => {
    const { journal } = this.root_store;
    const { ui } = this.core;
    journal.onError(data);
    if (
      journal.journal_filters.some((filter) => filter === MessageTypes.ERROR)
    ) {
      this.toggleDrawer(true);
      this.setActiveTabIndex(run_panel.JOURNAL);
      ui.setPromptHandler(false);
    } else {
      // TODO: fix notifications
      // notifications.addNotificationMessage(journalError(this.switchToJournal));
      // notifications.removeNotificationMessage({ key: 'bot_error' });
    }
  };

  switchToJournal = () => {
    const { journal } = this.root_store;
    journal.journal_filters.push(MessageTypes.ERROR);
    this.setActiveTabIndex(run_panel.JOURNAL);
    this.toggleDrawer(true);

    // TODO: fix notifications
    // notifications.toggleNotificationsModal();
    // notifications.removeNotificationByKey({ key: 'bot_error' });
  };

  unregisterBotListeners = () => {
    observer.unregisterAll("bot.running");
    observer.unregisterAll("bot.stop");
    observer.unregisterAll("bot.click_stop");
    observer.unregisterAll("bot.trade_again");
    observer.unregisterAll("contract.status");
    observer.unregisterAll("bot.contract");
    observer.unregisterAll("Error");
  };

  setContractStage = (contract_stage: TContractStage) => {
    this.contract_stage = contract_stage;
  };

  setHasOpenContract = (has_open_contract: boolean) => {
    this.has_open_contract = has_open_contract;
  };

  setIsRunning = (is_running: boolean) => {
    this.is_running = is_running;
  };

  onMount = () => {
    const { journal } = this.root_store;
    observer.register("ui.log.error", this.showErrorMessage);
    observer.register("ui.log.notify", journal.onNotify);
    observer.register("ui.log.success", journal.onLogSuccess);
    observer.register("client.invalid_token", this.handleInvalidToken);
  };

  onUnmount = () => {
    const { journal, summary_card, transactions } = this.root_store;

    if (!this.is_running) {
      this.unregisterBotListeners();
      this.disposeReactionsFn();
      journal.disposeReactionsFn();
      summary_card.disposeReactionsFn();
      transactions.disposeReactionsFn();
    }

    observer.unregisterAll("ui.log.error");
    observer.unregisterAll("ui.log.notify");
    observer.unregisterAll("ui.log.success");
    observer.unregisterAll("client.invalid_token");
  };

  handleInvalidToken = async () => {
    this.setActiveTabIndex(run_panel.SUMMARY);
  };

  preloadAudio = () => {
    const strategy_sounds = this.dbot.getStrategySounds() as string[];

    strategy_sounds.forEach((sound: string) => {
      const audioElement = document.getElementById(
        sound,
      ) as HTMLAudioElement | null;
      if (!audioElement) return;
      audioElement.muted = true;
      audioElement.play().catch(() => {
        // suppressing abort error, thrown on immediate .pause()
      });
      audioElement.pause();
      audioElement.muted = false;
    });
  };
}
