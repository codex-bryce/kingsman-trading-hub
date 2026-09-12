import { getRoundedNumber } from "@/components/shared";
import { api_base } from "../../api/api-base";
import {
  contract as broadcastContract,
  contractStatus,
} from "../utils/broadcast";
import { openContractReceived, sell } from "./state/actions";

export default (Engine) =>
  class OpenContract extends Engine {
    observeOpenContract() {
      if (!api_base.api) return;
      console.log(
        "[OpenContract] 🔍 Setting up subscription for contract updates",
      );
      console.log(
        "[OpenContract] 🔍 Current API account:",
        api_base.account_info?.loginid,
      );
      const subscription = api_base.api.onMessage().subscribe(({ data }) => {
        if (data.msg_type === "proposal_open_contract") {
          const contract = data.proposal_open_contract;

          // Log all contract updates for debugging
          if (contract?.contract_id) {
            console.log("[OpenContract] 📨 Received contract update:", {
              contract_id: contract.contract_id,
              expectedContractId: this.contractId,
              matches: this.expectedContractId(contract.contract_id),
              is_sold: contract.is_sold,
              is_expired: contract.is_expired,
              status: contract.status,
              current_account: api_base.account_info?.loginid,
            });
          }

          if (!contract) {
            console.log("[OpenContract] ⚠️ No contract data in message");
            return;
          }

          // CRITICAL: Accept contract updates even if contractId doesn't match initially
          // This handles cases where contract was created on a different account context
          if (
            this.contractId &&
            !this.expectedContractId(contract?.contract_id)
          ) {
            console.log("[OpenContract] ⚠️ Contract ID mismatch:", {
              received: contract?.contract_id,
              expected: this.contractId,
              skipping: true,
            });
            return;
          }

          // If we don't have a contractId yet but received an update, it might be for a new contract
          if (!this.contractId && contract?.contract_id) {
            console.log(
              "[OpenContract] ℹ️ Received contract update but no contractId set yet",
            );
            // Don't process it, wait for purchase to set contractId
            return;
          }

          this.setContractFlags(contract);

          // CRITICAL: Store a deep copy of the contract to prevent mutations
          // The bot MUST use the REAL API contract data for martingale calculations
          // Never modify this contract object - it's used by Bot.readDetails() for profit/loss
          // UI display modifications (displayProfit, displayCurrency) should NEVER affect this
          this.data.contract = JSON.parse(JSON.stringify(contract));

          // Log the profit to verify it's using real API data (for debugging martingale)
          if (contract.profit !== undefined && contract.profit !== null) {
            console.log(
              "[OpenContract] 💰 Contract profit (REAL API DATA for bot):",
              contract.profit,
            );
          } else if (contract.sell_price && contract.buy_price) {
            const calculatedProfit = contract.sell_price - contract.buy_price;
            console.log(
              "[OpenContract] 💰 Contract profit (CALCULATED from API for bot):",
              calculatedProfit,
            );
          }

          // Account switching is handled at run button level, so we should already be on demo account
          // Use current account ID from api_base (should be demo account)
          const accountId = api_base.account_info?.loginid;
          console.log("[OpenContract] 📨 Contract update received:", {
            contract_id: contract.contract_id,
            accountID: accountId,
            is_sold: contract.is_sold,
            expectedContractId: this.contractId,
          });
          broadcastContract({ accountID: accountId, ...contract });
          console.log("[OpenContract] ✅ Contract event broadcasted");

          if (this.isSold) {
            console.log(
              "[OpenContract] ✅ Contract SOLD - clearing contractId and dispatching sell",
            );
            this.contractId = "";
            clearTimeout(this.transaction_recovery_timeout);
            this.updateTotals(contract);
            contractStatus({
              id: "contract.sold",
              data: contract.transaction_ids.sell,
              contract,
            });

            if (this.afterPromise) {
              console.log("[OpenContract] ✅ Resolving afterPromise");
              this.afterPromise();
            }

            console.log("[OpenContract] ✅ Dispatching sell() action");
            this.store.dispatch(sell());
          } else if (this.isExpired) {
            console.log(
              "[OpenContract] ⏰ Contract EXPIRED - treating as sold",
            );
            this.contractId = "";
            clearTimeout(this.transaction_recovery_timeout);
            this.updateTotals(contract);
            contractStatus({
              id: "contract.sold",
              data:
                contract.transaction_ids?.sell || contract.transaction_ids?.buy,
              contract,
            });

            if (this.afterPromise) {
              this.afterPromise();
            }

            this.store.dispatch(sell());
          } else {
            console.log(
              "[OpenContract] 📊 Contract still open - dispatching openContractReceived",
            );
            this.store.dispatch(openContractReceived());
          }
        }
      });
      api_base.pushSubscription(subscription);
    }

    waitForAfter() {
      return new Promise((resolve) => {
        this.afterPromise = resolve;
      });
    }

    setContractFlags(contract) {
      const { is_expired, is_valid_to_sell, is_sold, entry_tick } = contract;

      this.isSold = Boolean(is_sold);
      this.isSellAvailable = !this.isSold && Boolean(is_valid_to_sell);
      this.isExpired = Boolean(is_expired);
      this.hasEntryTick = Boolean(entry_tick);
    }

    expectedContractId(contractId) {
      return this.contractId && contractId === this.contractId;
    }

    getSellPrice() {
      const {
        bid_price: bidPrice,
        buy_price: buyPrice,
        currency,
      } = this.data.contract;
      return getRoundedNumber(Number(bidPrice) - Number(buyPrice), currency);
    }
  };
