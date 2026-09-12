import { action, computed, makeObservable, observable, reaction } from "mobx";
import { formatDate, isEnded } from "@/components/shared";
import { LogTypes } from "@/external/bot-skeleton";
import { ProposalOpenContract } from "@deriv/api-types";
import { TPortfolioPosition, TStores } from "@deriv/stores/types";
import { TContractInfo } from "../components/summary/summary-card.types";
import { transaction_elements } from "../constants/transactions";
import {
  getStoredItemsByKey,
  getStoredItemsByUser,
  setStoredItemsByKey,
} from "../utils/session-storage";
import {
  getBalanceSwapState,
  transformTransactionIdForAdmin,
  transformTransactionIdForSpecialCR,
} from "../utils/balance-swap-utils";
import { isDemoLoginId } from "../utils/account-prefixes";
import { isSpecialCRAccount } from "../utils/special-accounts-config";
import RootStore from "./root-store";

type TTransaction = {
  type: string;
  data?: string | TContractInfo;
};

type TElement = {
  [key: string]: TTransaction[];
};

export default class TransactionsStore {
  root_store: RootStore;
  core: TStores;
  disposeReactionsFn: () => void;

  constructor(root_store: RootStore, core: TStores) {
    this.root_store = root_store;
    this.core = core;
    this.is_transaction_details_modal_open = false;

    // Clear all transactions from storage on page refresh/initialization
    // This ensures a fresh start after each refresh
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        // Directly clear the sessionStorage item to ensure it's completely cleared
        sessionStorage.removeItem(this.TRANSACTION_CACHE);
      } catch (error) {}
    }

    this.disposeReactionsFn = this.registerReactions();

    makeObservable(this, {
      elements: observable,
      active_transaction_id: observable,
      recovered_completed_transactions: observable,
      recovered_transactions: observable,
      is_called_proposal_open_contract: observable,
      is_transaction_details_modal_open: observable,
      transactions: computed,
      onBotContractEvent: action.bound,
      pushTransaction: action.bound,
      clear: action.bound,
      registerReactions: action.bound,
      recoverPendingContracts: action.bound,
      updateResultsCompletedContract: action.bound,
      sortOutPositionsBeforeAction: action.bound,
      recoverPendingContractsById: action.bound,
    });
  }
  TRANSACTION_CACHE = "transaction_cache";

  elements: TElement = {};
  active_transaction_id: null | number = null;
  recovered_completed_transactions: number[] = [];
  recovered_transactions: number[] = [];
  is_called_proposal_open_contract = false;
  is_transaction_details_modal_open = false;
  recoverTimeout: NodeJS.Timeout | null = null;

  /**
   * Get the demo account ID for special CR accounts
   */
  getDemoAccountId(): string | null {
    try {
      const clientAccounts = JSON.parse(
        localStorage.getItem("clientAccounts") || "{}",
      );

      // clientAccounts can be either an object with loginid keys or an array
      const accountsArray = Array.isArray(clientAccounts)
        ? clientAccounts
        : Object.values(clientAccounts);

      // Check if CR9641252 is active - if so, use VRTC14696449
      const showAsCR =
        typeof window !== "undefined"
          ? localStorage.getItem("show_as_cr")
          : null;
      if (showAsCR === "CR9641252") {
        const crDemoAccount = accountsArray.find(
          (acc: any) => acc.loginid === "VRTC14696449",
        );
        if (crDemoAccount?.loginid) {
          return crDemoAccount.loginid;
        }
      }

      // Try to find VRTC14696449 specifically first (for other accounts)
      const specificDemoAccount = accountsArray.find(
        (acc: any) => acc.loginid === "VRTC14696449",
      );

      if (specificDemoAccount?.loginid) {
        return specificDemoAccount.loginid;
      }

      // Fallback: find any virtual account
      const virtualAccount = accountsArray.find(
        (acc: any) => acc.is_virtual === true || isDemoLoginId(acc.loginid),
      );

      return virtualAccount?.loginid || null;
    } catch (error) {
      return null;
    }
  }

  get transactions(): TTransaction[] {
    const currentLoginId = this.core?.client?.loginid;

    if (!currentLoginId) {
      return [];
    }

    // Initialize elements if not already done
    // On page refresh, clear all transactions - don't restore from storage
    // This ensures a fresh start after each refresh
    if (!this.elements[currentLoginId]) {
      this.elements[currentLoginId] = [];
    }

    // Get transactions for current account
    // Access elements to make this getter reactive to changes
    const currentAccountTransactions = this.elements[currentLoginId] ?? [];

    // If current account is a special CR account, also include transactions from demo account
    if (isSpecialCRAccount(currentLoginId)) {
      const demoAccountId = this.getDemoAccountId();

      // If demo account found, merge its transactions with current account transactions
      // Don't load from storage - always start fresh after refresh
      if (demoAccountId) {
        // Initialize demo account with empty array - don't load from storage
        if (!this.elements[demoAccountId]) {
          this.elements[demoAccountId] = [];
        }

        // Access demo elements to make this getter reactive to changes in demo account
        const demoTransactions = this.elements[demoAccountId] ?? [];
        const allTransactions = [...currentAccountTransactions];

        // Add demo transactions that don't already exist in current account transactions
        let addedCount = 0;
        demoTransactions.forEach((demoTx) => {
          if (
            demoTx.type === transaction_elements.CONTRACT &&
            typeof demoTx.data === "object"
          ) {
            const demoBuyId = demoTx.data.transaction_ids?.buy;
            const exists = allTransactions.some((tx) => {
              if (
                tx.type === transaction_elements.CONTRACT &&
                typeof tx.data === "object"
              ) {
                return tx.data.transaction_ids?.buy === demoBuyId;
              }
              return false;
            });
            if (!exists) {
              allTransactions.push(demoTx);
              addedCount++;
            }
          } else if (demoTx.type === transaction_elements.DIVIDER) {
            // Add dividers if they don't exist
            const exists = allTransactions.some(
              (tx) =>
                tx.type === transaction_elements.DIVIDER &&
                tx.data === demoTx.data,
            );
            if (!exists) {
              allTransactions.push(demoTx);
              addedCount++;
            }
          }
        });

        // Sort by date (most recent first) - dividers should be sorted correctly
        const sorted = allTransactions.sort((a, b) => {
          if (
            a.type === transaction_elements.DIVIDER &&
            b.type === transaction_elements.DIVIDER
          ) {
            return 0;
          }
          if (a.type === transaction_elements.DIVIDER) return -1;
          if (b.type === transaction_elements.DIVIDER) return 1;

          const aData = a.data as TContractInfo;
          const bData = b.data as TContractInfo;
          const aDate = aData.date_start || 0;
          const bDate = bData.date_start || 0;
          return Number(bDate) - Number(aDate);
        });
        return sorted;
      } else {
      }
    }

    return currentAccountTransactions;
  }

  get statistics() {
    let total_runs = 0;
    // Filter out only contract transactions and remove dividers
    const trxs = this.transactions.filter(
      (trx) =>
        trx.type === transaction_elements.CONTRACT &&
        typeof trx.data === "object",
    );
    const statistics = trxs.reduce(
      (stats, { data }) => {
        const {
          profit = 0,
          is_completed = false,
          buy_price = 0,
          payout,
          bid_price,
        } = data as TContractInfo;
        if (is_completed) {
          if (profit > 0) {
            stats.won_contracts += 1;
            stats.total_payout += payout ?? bid_price ?? 0;
          } else {
            stats.lost_contracts += 1;
          }
          stats.total_profit += profit;
          stats.total_stake += buy_price;
          total_runs += 1;
        }
        return stats;
      },
      {
        lost_contracts: 0,
        number_of_runs: 0,
        total_profit: 0,
        total_payout: 0,
        total_stake: 0,
        won_contracts: 0,
      },
    );
    statistics.number_of_runs = total_runs;
    return statistics;
  }

  toggleTransactionDetailsModal = (is_open: boolean) => {
    this.is_transaction_details_modal_open = is_open;
  };

  onBotContractEvent(data: TContractInfo) {
    // Always process contract events - don't filter by account
    // The pushTransaction will handle account mapping correctly
    this.pushTransaction(data);
  }

  pushTransaction(data: TContractInfo) {
    const is_completed = isEnded(data as ProposalOpenContract);
    const { run_id } = this.root_store.run_panel;
    let current_account = this.core?.client?.loginid as string;

    // Check if contract data has accountID (from broadcastContract)
    const contractAccountId = (data as any)?.accountID;

    // CRITICAL: Determine which account to store transactions under
    // Priority: 1) Contract's accountID if it's demo, 2) Demo account if current is special CR, 3) Current account
    if (
      contractAccountId &&
      typeof contractAccountId === "string" &&
      isDemoLoginId(contractAccountId)
    ) {
      // Contract event came with demo account ID - use it (this is the account that made the trade)
      current_account = contractAccountId;
    } else if (current_account && isSpecialCRAccount(current_account)) {
      // Current account is special CR - store under demo account
      const demoAccountId = this.getDemoAccountId();
      if (demoAccountId) {
        current_account = demoAccountId;
      }
    } else if (contractAccountId && isSpecialCRAccount(contractAccountId)) {
      // Contract came with CR account ID - use demo instead
      const demoAccountId = this.getDemoAccountId();
      if (demoAccountId) {
        current_account = demoAccountId;
      }
    }

    if (!current_account) {
      return;
    }

    // Ensure the account exists in elements, but don't load from storage on refresh
    // Always start with empty array to ensure fresh start after refresh
    if (!this.elements[current_account]) {
      this.elements[current_account] = [];
    } else {
    }

    // Store original transaction IDs for duplicate detection and internal operations
    // Always use original IDs for duplicate detection to prevent false duplicates
    const original_buy_id = data.transaction_ids?.buy;
    const original_sell_id = data.transaction_ids?.sell;

    // Check for duplicates using ORIGINAL transaction IDs (not transformed ones)
    const same_contract_index = this.elements[current_account]?.findIndex(
      (c) => {
        if (typeof c.data === "string") return false;
        if (
          c.type !== transaction_elements.CONTRACT ||
          !c.data?.transaction_ids
        )
          return false;

        // Get stored transaction IDs - check if we have original IDs stored
        const stored_data = c.data as any;
        const stored_original_buy_id =
          stored_data.original_transaction_ids?.buy ||
          stored_data.transaction_ids?.buy;

        // Direct match using original IDs
        if (stored_original_buy_id === original_buy_id) return true;

        return false;
      },
    );

    // In admin mirror mode, override currency and transaction IDs to show real account info
    let displayCurrency = data.currency;
    let displayTransactionIds = data.transaction_ids;

    // Check if special CR account (CR9641252) is displayed
    const showAsCR =
      typeof window !== "undefined" ? localStorage.getItem("show_as_cr") : null;
    const isSpecialCR = showAsCR === "CR9641252";

    // For special CR account (CR9641252), transform transaction IDs and show USD currency
    if (isSpecialCR) {
      // Show USD currency for CR9641252
      const crAccount = this.core?.client?.account_list?.find(
        (account: any) => account.loginid === "CR9641252",
      );
      if (crAccount) {
        displayCurrency = crAccount.currency || "USD";
      } else {
        displayCurrency = "USD";
      }

      // Transform transaction IDs to start with 146 AND end with 1 (same as matches)
      if (data.transaction_ids) {
        displayTransactionIds = {
          buy:
            transformTransactionIdForSpecialCR(data.transaction_ids.buy) ??
            data.transaction_ids.buy,
          sell: data.transaction_ids.sell
            ? (transformTransactionIdForSpecialCR(data.transaction_ids.sell) ??
              data.transaction_ids.sell)
            : undefined,
        };
      }
    }

    const adminMirrorModeEnabled =
      typeof window !== "undefined" &&
      localStorage.getItem("adminMirrorModeEnabled") === "true";
    if (adminMirrorModeEnabled && !isSpecialCR) {
      const swapState = getBalanceSwapState();
      if (swapState?.isSwapped && swapState?.isMirrorMode) {
        const current_account_data = this.core?.client?.account_list?.find(
          (account: any) => account.loginid === current_account,
        );
        if (current_account_data?.is_virtual) {
          // Trading with demo, but show real account currency and transaction IDs
          const real_account = this.core?.client?.account_list?.find(
            (account: any) => account.loginid === swapState.realAccount.loginId,
          );
          if (real_account) {
            displayCurrency = real_account.currency || "USD";
          }
          // Transform transaction IDs: mask first digit with 1 (e.g., 6123456 → 1123456)
          if (data.transaction_ids) {
            displayTransactionIds = {
              buy:
                transformTransactionIdForAdmin(
                  data.transaction_ids.buy,
                  true,
                ) ?? data.transaction_ids.buy,
              sell: data.transaction_ids.sell
                ? (transformTransactionIdForAdmin(
                    data.transaction_ids.sell,
                    true,
                  ) ?? data.transaction_ids.sell)
                : undefined,
            };
          }
        }
      } else {
        // Even if not in mirror mode, still apply ID masking in admin mode
        if (data.transaction_ids) {
          displayTransactionIds = {
            buy:
              transformTransactionIdForAdmin(data.transaction_ids.buy, false) ??
              data.transaction_ids.buy,
            sell: data.transaction_ids.sell
              ? (transformTransactionIdForAdmin(
                  data.transaction_ids.sell,
                  false,
                ) ?? data.transaction_ids.sell)
              : undefined,
          };
        }
      }
    }

    const contract = {
      ...data,
      currency: displayCurrency, // Use display currency (real account currency in admin mode)
      transaction_ids: displayTransactionIds, // Use masked transaction IDs (first digit = 1) for UI
      // Store original transaction IDs for internal operations (duplicate detection, trade lookup, etc.)
      original_transaction_ids: {
        buy: original_buy_id,
        sell: original_sell_id,
      },
      is_completed,
      run_id,
      date_start: formatDate(data.date_start, "YYYY-M-D HH:mm:ss [GMT]"),
      entry_tick:
        data.entry_tick_display_value ??
        (data.entry_tick != null ? String(data.entry_tick) : undefined),
      entry_tick_time:
        data.entry_tick_time &&
        formatDate(data.entry_tick_time, "YYYY-M-D HH:mm:ss [GMT]"),
      exit_tick:
        data.exit_tick_display_value ??
        (data.exit_tick != null ? String(data.exit_tick) : undefined),
      exit_tick_time:
        data.exit_tick_time &&
        formatDate(data.exit_tick_time, "YYYY-M-D HH:mm:ss [GMT]"),
      profit: is_completed ? data.profit : 0,
    } as TContractInfo & {
      original_transaction_ids?: { buy?: number; sell?: number };
    };

    if (same_contract_index === -1) {
      // Render a divider if the "run_id" for this contract is different.
      // CRITICAL: Prevent duplicate dividers when bot stops/starts repeatedly
      if (this.elements[current_account]?.length > 0) {
        const first_element = this.elements[current_account]?.[0];
        const is_first_divider =
          first_element?.type === transaction_elements.DIVIDER;
        const is_first_contract =
          first_element?.type === transaction_elements.CONTRACT;

        // Only add divider if:
        // 1. First element is a contract (not a divider), AND
        // 2. The contract has a different run_id, AND
        // 3. There's no divider already at the top
        const is_new_run =
          is_first_contract &&
          typeof first_element.data === "object" &&
          contract.run_id !== first_element?.data?.run_id;

        if (is_new_run && !is_first_divider) {
          // Additional check: make sure we don't already have a divider for this run_id
          // Look through the first few elements to see if this run_id already has a divider
          const existing_divider_for_run = this.elements[current_account]?.find(
            (el, idx) =>
              idx < 10 && // Only check first 10 elements for performance
              el.type === transaction_elements.DIVIDER &&
              el.data === contract.run_id,
          );

          if (!existing_divider_for_run) {
            this.elements[current_account]?.unshift({
              type: transaction_elements.DIVIDER,
              data: contract.run_id,
            });
          } else {
          }
        } else if (is_first_divider) {
        }
      }

      this.elements[current_account]?.unshift({
        type: transaction_elements.CONTRACT,
        data: contract,
      });
    } else {
      // If data belongs to existing contract in memory, update it.
      this.elements[current_account]?.splice(same_contract_index, 1, {
        type: transaction_elements.CONTRACT,
        data: contract,
      });
    }

    this.elements = { ...this.elements }; // force update
  }

  clear() {
    const currentLoginId = this.core?.client?.loginid as string;

    // Clear transactions for current account
    if (this.elements && this.elements[currentLoginId]?.length > 0) {
      this.elements[currentLoginId] = [];
    }

    // If current account is a special CR account, also clear demo account transactions
    if (isSpecialCRAccount(currentLoginId)) {
      const demoAccountId = this.getDemoAccountId();
      if (demoAccountId && this.elements[demoAccountId]?.length > 0) {
        this.elements[demoAccountId] = [];
      }
    }

    this.recovered_completed_transactions =
      this.recovered_completed_transactions?.slice(0, 0);
    this.recovered_transactions = this.recovered_transactions?.slice(0, 0);
    this.is_transaction_details_modal_open = false;

    // Force update
    this.elements = { ...this.elements };
  }

  registerReactions() {
    const { client } = this.core;

    // Write transactions to session storage on each change in transaction elements.
    const disposeTransactionElementsListener = reaction(
      () => {
        const currentLoginId = client?.loginid as string;
        // Watch both current account and demo account transactions if special CR account
        if (currentLoginId && isSpecialCRAccount(currentLoginId)) {
          const demoAccountId = this.getDemoAccountId();

          return {
            current: this.elements[currentLoginId],
            demo: demoAccountId ? this.elements[demoAccountId] : null,
            demoAccountId,
            currentLoginId,
          };
        }
        return {
          current: this.elements[currentLoginId],
          demo: null,
          demoAccountId: null,
          currentLoginId,
        };
      },
      ({ current, demo, demoAccountId, currentLoginId }) => {
        const stored_transactions = getStoredItemsByKey(
          this.TRANSACTION_CACHE,
          {},
        );

        // Save current account transactions
        if (currentLoginId) {
          stored_transactions[currentLoginId] = current?.slice(0, 5000) ?? [];
        }

        // Also save demo account transactions if special CR account
        if (demoAccountId && demo) {
          stored_transactions[demoAccountId] = demo?.slice(0, 5000) ?? [];
        }

        setStoredItemsByKey(this.TRANSACTION_CACHE, stored_transactions);
      },
    );

    // Reload transactions when account changes (important for special CR accounts)
    // Don't load from storage - always start fresh after refresh
    const disposeAccountChangeListener = reaction(
      () => client?.loginid,
      (loginid) => {
        if (loginid) {
          // Initialize with empty array - don't load from storage on refresh
          if (!this.elements[loginid]) {
            this.elements[loginid] = [];
          } else {
          }

          // If special CR account, also initialize demo account (but don't load from storage)
          if (isSpecialCRAccount(loginid)) {
            const demoAccountId = this.getDemoAccountId();
            if (demoAccountId && !this.elements[demoAccountId]) {
              this.elements[demoAccountId] = [];
            } else if (demoAccountId) {
            }
          }

          // Force update to trigger reactivity
          this.elements = { ...this.elements };
        }
      },
    );

    // User could've left the page mid-contract. On initial load, try
    // to recover any pending contracts so we can reflect accurate stats
    // and transactions.
    // CRITICAL: Add debouncing to prevent multiple recoveries on page refresh
    const disposeRecoverContracts = reaction(
      () => this.transactions.length,
      () => {
        // Debounce recovery to prevent multiple calls on page refresh
        if (this.recoverTimeout) {
          clearTimeout(this.recoverTimeout);
        }
        this.recoverTimeout = setTimeout(() => {
          this.recoverPendingContracts();
          this.recoverTimeout = null;
        }, 1000); // Wait 1 second after transactions change before recovering
      },
    );

    return () => {
      disposeTransactionElementsListener();
      disposeAccountChangeListener();
      disposeRecoverContracts();
      if (this.recoverTimeout) {
        clearTimeout(this.recoverTimeout);
        this.recoverTimeout = null;
      }
    };
  }

  /**
   * Remove consecutive duplicate dividers from transaction list
   */
  removeConsecutiveDividers(transactions: TTransaction[]): TTransaction[] {
    if (!transactions || transactions.length === 0) return transactions;

    const cleaned: TTransaction[] = [];
    let lastWasDivider = false;

    for (const tx of transactions) {
      const isDivider = tx.type === transaction_elements.DIVIDER;

      // Skip if this is a divider and the previous element was also a divider
      if (isDivider && lastWasDivider) {
        continue;
      }

      cleaned.push(tx);
      lastWasDivider = isDivider;
    }

    return cleaned;
  }

  recoverPendingContracts(contract = null) {
    // CRITICAL: Only recover contracts that are actually pending (not completed)
    // Don't process contracts that are already in recovered list to prevent duplicates
    const pendingContracts = this.transactions.filter(({ data: trx }) => {
      if (typeof trx === "string") return false;
      if (!trx?.contract_id) return false;
      if (trx?.is_completed) return false;
      if (this.recovered_transactions.includes(trx?.contract_id)) return false;

      // CRITICAL: Don't recover contracts that are older than 5 minutes
      // These are likely from a previous session and shouldn't trigger new trades
      if (trx.date_start) {
        const contractDate = new Date(trx.date_start).getTime();
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        if (contractDate < fiveMinutesAgo) {
          return false;
        }
      }

      return true;
    });

    pendingContracts.forEach(({ data: trx }) => {
      if (typeof trx === "object" && trx?.contract_id) {
        this.recoverPendingContractsById(trx.contract_id, contract);
      }
    });
  }

  updateResultsCompletedContract(contract: ProposalOpenContract) {
    const { journal, summary_card } = this.root_store;
    const { contract_info } = summary_card;
    const { currency, profit } = contract;

    // Check if this is a matches contract (DIGITMATCH)
    const isMatchesContract =
      contract.contract_type === "DIGITMATCH" ||
      (contract_info as any)?.contract_type === "DIGITMATCH" ||
      (contract as any)?.contract_type === "DIGITMATCH";

    if (contract.contract_id !== contract_info?.contract_id) {
      this.onBotContractEvent(contract);

      if (
        contract.contract_id &&
        !this.recovered_transactions.includes(contract.contract_id)
      ) {
        this.recovered_transactions.push(contract.contract_id);
      }
      if (
        contract.contract_id &&
        !this.recovered_completed_transactions.includes(contract.contract_id) &&
        isEnded(contract)
      ) {
        this.recovered_completed_transactions.push(contract.contract_id);

        // Removed profit/loss log messages from journal as per user request
        // For matches contracts, always show as profit and transform transaction IDs to start with 146
        // if (isMatchesContract) {
        //     // Always show matches as profit (even if actual profit is negative)
        //     const displayProfit = profit && profit > 0 ? profit : Math.abs(profit || 0) || 1;
        //
        //     // Transform transaction ID to start with 146 and end with 1
        //     let transformedTransactionId = contract.transaction_ids?.buy;
        //     if (transformedTransactionId) {
        //         transformedTransactionId = transformTransactionIdForSpecialCR(transformedTransactionId) ?? transformedTransactionId;
        //     }
        //
        //     journal.onLogSuccess({
        //         log_type: LogTypes.PROFIT,
        //         extra: {
        //             currency,
        //             profit: displayProfit,
        //             transaction_id: transformedTransactionId
        //         },
        //     });
        // } else {
        //     // For non-matches contracts, use normal profit/loss logic
        //     journal.onLogSuccess({
        //         log_type: profit && profit > 0 ? LogTypes.PROFIT : LogTypes.LOST,
        //         extra: { currency, profit },
        //     });
        // }
      }
    }
  }

  sortOutPositionsBeforeAction(
    positions: TPortfolioPosition[],
    element_id?: number,
  ) {
    positions?.forEach((position) => {
      if (!element_id || (element_id && position.id === element_id)) {
        const contract_details = position.contract_info;
        this.updateResultsCompletedContract(contract_details);
      }
    });
  }

  async recoverPendingContractsById(
    contract_id: number,
    contract: ProposalOpenContract | null = null,
  ) {
    // TODO: need to fix as the portfolio is not available now
    // const positions = this.core.portfolio.positions;
    const positions: unknown[] = [];

    if (contract) {
      this.is_called_proposal_open_contract = true;
      if (contract.contract_id === contract_id) {
        this.updateResultsCompletedContract(contract);
      }
    }

    if (!this.is_called_proposal_open_contract) {
      if (this.core?.client?.loginid) {
        const current_account = this.core?.client?.loginid;
        if (!this.elements[current_account]?.length) {
          this.sortOutPositionsBeforeAction(positions);
        }

        const elements = this.elements[current_account];
        const [element = null] = elements;
        if (typeof element?.data === "object" && !element?.data?.profit) {
          const element_id = element.data.contract_id;
          this.sortOutPositionsBeforeAction(positions, element_id);
        }
      }
    }
  }
}
