import { observer as globalObserver } from "@/external/bot-skeleton/utils/observer";
import CopyTradingManager from "./copy-trading-manager";
import { api_base } from "@/external/bot-skeleton";
import { getToken } from "@/external/bot-skeleton/services/api/appId";
import { isRealLoginId } from "@/utils/account-prefixes";
import {
  isSpecialCRAccount,
  getDemoAccountIdForSpecialCR,
} from "@/utils/special-accounts-config";

// Simple duplicate guard by purchase_reference or timestamp
const recentKeys = new Set<string>();
const RECENT_TTL_MS = 15000;

export type TReplicationStatusType =
  | "disabled"
  | "no_clients"
  | "copying"
  | "success"
  | "error";
export type TReplicationStatusPayload = {
  status: TReplicationStatusType;
  message: string;
};

type TStatusListener = (payload: TReplicationStatusPayload) => void;
const statusListeners = new Set<TStatusListener>();

export function subscribeReplicationStatus(
  listener: TStatusListener,
): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

// Status update function for UI - exported for use in copy-trading.tsx
export function updateReplicationStatus(
  status: TReplicationStatusType,
  message: string,
) {
  const payload = { status, message };
  statusListeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.error("Status listener error:", e);
    }
  });

  const statusEl = document.getElementById("replication-status");
  const statusMsgEl = document.getElementById("replication-status-msg");

  if (statusEl) {
    statusEl.textContent =
      status === "success"
        ? "✅"
        : status === "error"
          ? "❌"
          : status === "copying"
            ? "📤"
            : "⚠️";
    statusEl.style.color =
      status === "success"
        ? "#3b82f6"
        : status === "error"
          ? "#ef4444"
          : status === "copying"
            ? "#3b82f6"
            : "#f59e0b";
  }

  if (statusMsgEl) {
    statusMsgEl.textContent = message;
    statusMsgEl.style.color =
      status === "success"
        ? "#3b82f6"
        : status === "error"
          ? "#ef4444"
          : status === "copying"
            ? "#3b82f6"
            : "#f59e0b";
  }
}

type TradeLog = {
  id: string;
  accountId: string;
  payload: any;
  time: number;
  error?: string;
};
const tradeLogs: TradeLog[] = [];
export const getTradeLogs = () => tradeLogs.slice(-50).reverse();

function makeKey(payload: any) {
  const ref =
    payload?.request?.parameters?.passthrough?.purchase_reference ||
    payload?.request?.passthrough?.purchase_reference;
  return (
    ref ||
    `${payload?.contract_type}-${payload?.request?.buy || ""}-${Date.now()}`
  );
}

function cleanupKeys() {
  const now = Date.now();
  for (const k of Array.from(recentKeys)) {
    if (recentKeys.size > 1000) recentKeys.delete(k);
  }
}

// Helper to get token for a login ID
function getTokenForLoginId(loginId: string): string | null {
  try {
    const accountsList = JSON.parse(
      localStorage.getItem("accountsList") || "{}",
    );
    return accountsList[loginId] || null;
  } catch {
    return null;
  }
}

export function initReplicator(manager: CopyTradingManager) {
  const sub = async (payload: any) => {
    try {
      const key = makeKey(payload);
      if (recentKeys.has(key)) {
        return;
      }
      recentKeys.add(key);
      setTimeout(() => recentKeys.delete(key), RECENT_TTL_MS);

      const settings = manager.getSettings?.() ?? {
        replicationEnabled: true,
        stakeCap: null,
        stakeMultiplier: 1,
      };

      if (!settings.replicationEnabled) {
        updateReplicationStatus("disabled", "Replication is disabled");
        return;
      }

      // Check if copy trading is active
      const isCopyTrading = localStorage.getItem("iscopyTrading") === "true";
      const isDemoToReal = localStorage.getItem("demo_to_real") === "true";

      if (!isCopyTrading && !isDemoToReal) {
        updateReplicationStatus("disabled", "Copy trading not started");
        return;
      }

      // Get tokens array from localStorage (like the working code)
      let tokens: string[] = [];
      const copyTokensArray = JSON.parse(
        localStorage.getItem("copyTokensArray") || "[]",
      );

      // Check if special CR account is active (SPECIAL CR LOGIC)
      const showAsCR =
        typeof window !== "undefined"
          ? localStorage.getItem("show_as_cr")
          : null;
      const isSpecialCR = showAsCR && isSpecialCRAccount(showAsCR);

      // Get current user token
      // IMPORTANT: For normal CR accounts, getToken() works normally
      // For special CR (CR9641252), we need to use demo token since that's what API uses
      let currentToken: any = null;
      let masterToken: string | undefined = undefined;

      if (isSpecialCR && showAsCR) {
        // Special CR account mode: API uses demo token for trading
        // Use demo token as master for copy trading
        const demoAccountId = getDemoAccountIdForSpecialCR(showAsCR);
        if (demoAccountId) {
          const accountsList = JSON.parse(
            localStorage.getItem("accountsList") || "{}",
          );
          const demoToken = accountsList[demoAccountId];
          if (demoToken) {
            masterToken = demoToken;
            currentToken = { token: demoToken, account_id: demoAccountId };
          } else {
            currentToken = getToken();
            masterToken = currentToken?.token;
          }
        } else {
          currentToken = getToken();
          masterToken = currentToken?.token;
        }
      } else {
        // Normal CR accounts: use getToken() exactly like deriv insider
        currentToken = getToken();
        masterToken = currentToken?.token;
      }

      if (!masterToken) {
        updateReplicationStatus("error", "No master token found");
        return;
      }

      if (isCopyTrading) {
        // Copy trading mode: ONLY include copier tokens (NOT master token)
        // The master account already executes the trade through the normal bot buy flow.
        // Including it here would cause a duplicate trade on the master account.
        const uniqueCopierTokens = copyTokensArray.filter(
          (token: string) => token && token.trim() && token !== masterToken,
        );
        // Only use copier tokens - master account already has the trade
        tokens = uniqueCopierTokens;
        // Remove any duplicates
        tokens = Array.from(new Set(tokens.filter(Boolean)));
      } else if (isDemoToReal) {
        // Demo to real mode: use current token (demo) + real account token
        // Like mkorean: tokens: [currentToken, realToken]
        // Current token is the demo account user is trading on
        // Real token is stored in manager.master.token
        const realToken = manager.master.token;
        if (realToken && realToken !== masterToken) {
          // Current token (demo) first, then real token
          tokens = [masterToken, realToken];
        } else {
          // Fallback: try to find real account from accountsList
          const accountsList = JSON.parse(
            localStorage.getItem("accountsList") || "{}",
          );
          const realLoginId = Object.keys(accountsList).find((k) =>
            isRealLoginId(k),
          );
          if (realLoginId) {
            const realTokenFromList = accountsList[realLoginId];
            if (realTokenFromList && realTokenFromList !== masterToken) {
              tokens = [masterToken, realTokenFromList];
            } else {
              tokens = [masterToken];
            }
          } else {
            tokens = [masterToken];
          }
        }
        // Remove duplicates
        tokens = Array.from(new Set(tokens.filter(Boolean)));
      }

      // Final validation: strip blanks and OAuth-format tokens (ory_at_/pat_ are rejected
      // by buy_contract_for_multiple_accounts with InputValidationFailed)
      tokens = Array.from(
        new Set(
          tokens.filter(
            (t: string) =>
              t &&
              t.trim() &&
              t.length > 0 &&
              !t.startsWith("ory_at_") &&
              !t.startsWith("pat_"),
          ),
        ),
      );

      // Also collect connected OAuth copiers
      const oauthClients = manager.getConnectedOAuthClients();

      if (tokens.length < 1 && oauthClients.length < 1) {
        updateReplicationStatus(
          "no_clients",
          "No clients added - Add tokens first",
        );
        return;
      }

      updateReplicationStatus(
        "copying",
        `Copying to ${tokens.length + oauthClients.length} account(s)...`,
      );

      // Build request like the working code
      let reqBase: any = {};

      if (payload.mode === "proposal_id") {
        // For proposal_id mode
        const proposalId = payload.request?.buy || payload.request?.id;
        const price = payload.request?.price;

        if (price) {
          let amt = Number(price) * (settings.stakeMultiplier || 1);
          if (settings.stakeCap) amt = Math.min(amt, settings.stakeCap);
          reqBase = {
            buy_contract_for_multiple_accounts: proposalId,
            price: Number(amt.toFixed(2)),
            tokens: tokens,
          };
        } else {
          reqBase = {
            buy_contract_for_multiple_accounts: proposalId,
            tokens: tokens,
          };
        }
      } else if (payload.mode === "parameters") {
        // For parameters mode - like the working code
        const params = JSON.parse(
          JSON.stringify(payload.request?.parameters || payload.request || {}),
        );

        // Apply multiplier/cap to amount
        if (params.amount) {
          let amt = Number(params.amount) * (settings.stakeMultiplier || 1);
          if (settings.stakeCap) amt = Math.min(amt, settings.stakeCap);
          params.amount = Number(amt.toFixed(2));
        }

        reqBase = {
          buy_contract_for_multiple_accounts: "1",
          price: params.amount || params.price,
          tokens: tokens,
          parameters: {
            amount: params.amount,
            basis: params.basis,
            contract_type: params.contract_type || payload.contract_type,
            currency: params.currency,
            duration: params.duration,
            duration_unit: params.duration_unit,
            multiplier: params.multiplier,
            symbol: params.symbol,
            ...(params.barrier !== undefined && { barrier: params.barrier }),
            ...(params.barrier2 !== undefined && { barrier2: params.barrier2 }),
            ...(params.selected_tick !== undefined && {
              selected_tick: params.selected_tick,
            }),
            ...(params.prediction !== undefined && {
              prediction: params.prediction,
            }),
          },
        };
      } else {
        // Fallback
        reqBase = {
          buy_contract_for_multiple_accounts: payload.request?.buy || "1",
          price: payload.request?.price,
          tokens: tokens,
          parameters: payload.request?.parameters || {},
        };
      }

      // === Legacy path: buy_contract_for_multiple_accounts ===
      let legacySuccess = false;
      if (tokens.length > 0) {
        try {
          const res = await api_base.api.send(reqBase);
          if (res?.error) {
            const errorMsg =
              res.error.message || res.error.code || "Unknown API error";
            const errorCode = res.error.code || "Unknown";
            updateReplicationStatus(
              "error",
              `Legacy Error: ${errorMsg} (${errorCode})`,
            );
            tradeLogs.push({
              id: "all",
              accountId: "multiple",
              payload: reqBase,
              time: Date.now(),
              error: errorMsg,
            });
          } else {
            legacySuccess = true;
            tradeLogs.push({
              id: "all",
              accountId: "multiple",
              payload: reqBase,
              time: Date.now(),
            });
          }
        } catch (e: any) {
          const errorMsg = e?.error?.message || e?.message || "Unknown error";
          const errorCode = e?.error?.code || e?.code || "Unknown";
          updateReplicationStatus(
            "error",
            `Legacy Failed: ${errorMsg} (${errorCode})`,
          );
          tradeLogs.push({
            id: "all",
            accountId: "multiple",
            payload: reqBase,
            time: Date.now(),
            error: errorMsg,
          });
        }
      }

      // === OAuth path: individual proposal+buy per connected OTP client ===
      let oauthSucceeded = 0;
      let oauthFailed = 0;
      if (oauthClients.length > 0 && payload.mode === "parameters") {
        const params = JSON.parse(
          JSON.stringify(payload.request?.parameters || payload.request || {}),
        );
        let amt = Number(params.amount || 0) * (settings.stakeMultiplier || 1);
        if (settings.stakeCap) amt = Math.min(amt, settings.stakeCap);
        amt = Number(amt.toFixed(2));

        await Promise.allSettled(
          oauthClients.map(async ({ copier, client }) => {
            try {
              const proposalRes = await client.send({
                proposal: 1,
                contract_type: params.contract_type || payload.contract_type,
                underlying_symbol: params.symbol || params.underlying_symbol,
                amount: amt,
                basis: params.basis,
                duration: params.duration,
                duration_unit: params.duration_unit,
                currency: params.currency || copier.currency || "USD",
                ...(params.barrier !== undefined && {
                  barrier: params.barrier,
                }),
                ...(params.barrier2 !== undefined && {
                  barrier2: params.barrier2,
                }),
                ...(params.selected_tick !== undefined && {
                  selected_tick: params.selected_tick,
                }),
                ...(params.prediction !== undefined && {
                  prediction: params.prediction,
                }),
              });
              if (proposalRes?.error) throw proposalRes.error;
              const proposalId = proposalRes?.proposal?.id;
              if (!proposalId) throw new Error("No proposal ID returned");
              const askPrice = Number(proposalRes?.proposal?.ask_price ?? amt);
              const buyRes = await client.send({
                buy: proposalId,
                price: askPrice,
              });
              if (buyRes?.error) throw buyRes.error;
              oauthSucceeded++;
              tradeLogs.push({
                id: copier.id,
                accountId: copier.loginId || "oauth",
                payload: params,
                time: Date.now(),
              });
              // Refresh balance after trade
              void manager.syncOAuthClientBalance(copier.id);
            } catch (e: any) {
              oauthFailed++;
              tradeLogs.push({
                id: copier.id,
                accountId: copier.loginId || "oauth",
                payload: params,
                time: Date.now(),
                error: e?.message || "OAuth trade failed",
              });
            }
          }),
        );
      }

      // === Combined status ===
      const totalSucceeded =
        (legacySuccess ? tokens.length : 0) + oauthSucceeded;
      const totalFailed =
        (tokens.length > 0 && !legacySuccess ? tokens.length : 0) + oauthFailed;
      if (totalSucceeded > 0) {
        updateReplicationStatus(
          "success",
          `Copied to ${totalSucceeded} account(s) successfully`,
        );
      } else if (totalFailed > 0) {
        updateReplicationStatus(
          "error",
          `Failed for ${totalFailed} account(s)`,
        );
      }

      cleanupKeys();
    } catch (e) {
      updateReplicationStatus(
        "error",
        `Error: ${e instanceof Error ? e.message : "Unknown error"}`,
      );
    }
  };

  globalObserver.register("replicator.purchase", sub);

  return () => {
    try {
      globalObserver.unregister("replicator.purchase", sub);
    } catch {}
  };
}
