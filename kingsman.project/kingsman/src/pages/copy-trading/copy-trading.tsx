import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  getAppId,
  getSocketURL,
} from "@/components/shared/utils/config/config";
import CopyTradingManager from "./copy-trading-manager";
import { getGlobalCopyTradingManager } from "@/app/App";
import Dialog from "@/components/shared_ui/dialog";
import { useStore } from "@/hooks/useStore";
import { isDemoLoginId, isRealLoginId } from "@/utils/account-prefixes";
import { fetchOAuthAccounts } from "@/utils/deriv-oauth";
import "./copy-trading.scss";

// Validate a legacy API token via a one-shot WebSocket authorize call.
// Resolves with account details on success; rejects with a user-facing error message on failure.
const validateLegacyToken = (
  token: string,
): Promise<{
  loginId: string;
  balance: number;
  currency: string;
  isVirtual: boolean;
}> =>
  new Promise((resolve, reject) => {
    const APP_ID = String(
      getAppId?.() ?? localStorage.getItem("APP_ID") ?? "106019",
    );
    const server = getSocketURL?.() || "ws.derivws.com";
    const ws = new WebSocket(`wss://${server}/websockets/v3?app_id=${APP_ID}`);
    const tid = setTimeout(() => {
      ws.close();
      reject(new Error("Connection timed out. Please try again."));
    }, 12_000);

    ws.onopen = () => ws.send(JSON.stringify({ authorize: token, req_id: 1 }));

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data as string);
        if (data?.req_id !== 1) return;
        clearTimeout(tid);
        ws.close();
        if (data.error) {
          reject(new Error(data.error.message || "Invalid token"));
        } else {
          const auth = data.authorize;
          resolve({
            loginId: auth?.loginid || "",
            balance: typeof auth?.balance === "number" ? auth.balance : 0,
            currency: auth?.currency || "",
            isVirtual: !!auth?.is_virtual,
          });
        }
      } catch {
        /* parse error */
      }
    };

    ws.onerror = () => {
      clearTimeout(tid);
      ws.close();
      reject(new Error("Connection error. Please check the token."));
    };
    ws.onclose = (e: CloseEvent) => {
      if (!e.wasClean) {
        clearTimeout(tid);
        reject(new Error("Connection closed unexpectedly."));
      }
    };
  });

// Save token to localStorage (profitPlusTokens list)
const syncTokenToProfitPlus = (token: string): void => {
  try {
    const profitPlusTokens = JSON.parse(
      localStorage.getItem("profitPlusTokens") || "[]",
    );
    if (profitPlusTokens.some((t: any) => t.value === token)) return;
    profitPlusTokens.push({
      id: Date.now().toString(),
      value: token,
      date: new Date().toISOString(),
      displayDate: new Date().toLocaleString(),
      source: "analyst-copy-trading",
    });
    localStorage.setItem("profitPlusTokens", JSON.stringify(profitPlusTokens));
  } catch {}
};

const CopyTrading = observer(() => {
  const { client } = useStore();
  const htmlContentRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<CopyTradingManager | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [tutorialUrl, setTutorialUrl] = useState("");
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [demoToRealActive, setDemoToRealActive] = useState(false);
  const [copyTradingActive, setCopyTradingActive] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [successMessage2, setSuccessMessage2] = useState("");
  const [isCopyMyTradesModalOpen, setIsCopyMyTradesModalOpen] = useState(false);
  const [copyMyTradesToken, setCopyMyTradesToken] = useState("");
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [tokenSaveStatus, setTokenSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [isViewTokensModalOpen, setIsViewTokensModalOpen] = useState(false);
  const [savedTokens, setSavedTokens] = useState<any[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isSpecialCR, setIsSpecialCR] = useState(false);

  // Check for special CR account and update state
  useEffect(() => {
    const checkSpecialCR = () => {
      const showAsCR =
        typeof window !== "undefined"
          ? localStorage.getItem("show_as_cr")
          : null;
      setIsSpecialCR(showAsCR === "CR9641252");
    };

    // Check initially
    checkSpecialCR();

    // Listen for storage changes (in case show_as_cr is updated)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "show_as_cr") {
        checkSpecialCR();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Also check periodically in case localStorage is updated directly (not via storage event)
    const interval = setInterval(checkSpecialCR, 1000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (htmlContentRef.current) {
      // Wait a bit for global manager to initialize if it hasn't yet
      const setupManager = () => {
        const globalManager = getGlobalCopyTradingManager();
        if (globalManager) {
          managerRef.current = globalManager;
          return true;
        }
        return false;
      };

      // Try immediately
      if (!setupManager()) {
        // If not available, wait a bit and try again (global might still be initializing)
        const retryInterval = setInterval(() => {
          if (setupManager()) {
            clearInterval(retryInterval);
          }
        }, 100);

        // Stop retrying after 2 seconds
        setTimeout(() => {
          clearInterval(retryInterval);
          if (!managerRef.current) {
            managerRef.current = new CopyTradingManager();
          }
        }, 2000);
      }

      // Sync existing tokens from localStorage to manager
      const syncTokensToManager = async () => {
        const manager = managerRef.current;
        if (!manager) return;

        // Wait for manager to restore state
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Sync demo to real token
        const isDemoToReal = localStorage.getItem("demo_to_real") === "true";
        if (isDemoToReal) {
          const accounts_list = JSON.parse(
            localStorage.getItem("accountsList") || "{}",
          );
          const keys = Object.keys(accounts_list);
          const key = keys.find((k) => isRealLoginId(k));
          if (key) {
            const value = accounts_list[key];
            manager.setMasterToken(value);
          }
        }

        // Sync copier tokens
        const copyTokensArray = JSON.parse(
          localStorage.getItem("copyTokensArray") || "[]",
        );
        for (const token of copyTokensArray) {
          // Skip if it's the master token
          if (isDemoToReal) {
            const accounts_list = JSON.parse(
              localStorage.getItem("accountsList") || "{}",
            );
            const keys = Object.keys(accounts_list);
            const key = keys.find((k) => isRealLoginId(k));
            if (key && accounts_list[key] === token) {
              continue; // Skip master token
            }
          }

          // Add to manager if not already present
          if (!manager.copiers.find((c) => c.token === token)) {
            try {
              manager.addCopier(token);
            } catch (e) {
              // Token might already exist, ignore
            }
          }
        }
      };

      // Sync tokens after a short delay to allow manager to initialize
      setTimeout(syncTokensToManager, 200);

      // Sync all existing tokens to profitplus on load
      setTimeout(() => {
        const existingTokens = JSON.parse(
          localStorage.getItem("copyTokensArray") || "[]",
        );
        existingTokens.forEach((token: string) => {
          syncTokenToProfitPlus(token);
        });
      }, 500);

      // Check initial states
      const isDemoToReal = localStorage.getItem("demo_to_real") === "true";
      const isCopyTrading = localStorage.getItem("iscopyTrading") === "true";
      setDemoToRealActive(isDemoToReal);
      setCopyTradingActive(isCopyTrading);

      // Initialize render table after React renders
      setTimeout(() => {
        renderTable();
      }, 100);
    }

    // Note: We DON'T cleanup the manager or replicator here
    // The global manager persists across tab changes so copy trading continues working
    // even when you're on Bot Builder or other tabs
    return () => {
      // Only cleanup UI-specific things, not the manager
    };
  }, []);

  // Demo to real handler — mirrors active account trades to another account (real OR demo)
  const handleDemoToReal = async () => {
    const isStart = !demoToRealActive;
    const accounts_list = JSON.parse(
      localStorage.getItem("accountsList") || "{}",
    );
    const manager = managerRef.current;
    if (!manager) return;

    if (isStart) {
      const keys = Object.keys(accounts_list);
      // Prefer real account; fall back to any other account (demo-to-demo supported)
      const key =
        keys.find((k) => isRealLoginId(k)) ||
        keys.find((k) => k !== localStorage.getItem("active_loginid"));
      if (key) {
        const value = accounts_list[key];
        let storedArray = JSON.parse(
          localStorage.getItem("copyTokensArray") || "[]",
        );
        if (!storedArray.includes(value)) {
          storedArray.push(value);
        }
        localStorage.setItem("copyTokensArray", JSON.stringify(storedArray));
        localStorage.setItem("demo_to_real", "true");

        // Set master token in manager
        manager.setMasterToken(value);

        // If copy trading is already running, connect master
        const isCopyTrading = localStorage.getItem("iscopyTrading") === "true";
        if (isCopyTrading) {
          try {
            await manager.connectMaster();
          } catch (e) {
            // Connection failed, continue anyway
          }
        }

        setDemoToRealActive(true);
        setSuccessMessage("Demo copy trading started successfully");
        setTimeout(() => setSuccessMessage(""), 10000);
      } else {
        setErrorMessage("No secondary account found to mirror to!");
        setErrorModalVisible(true);
      }
    } else {
      const keys = Object.keys(accounts_list);
      const key =
        keys.find((k) => isRealLoginId(k)) ||
        keys.find((k) => k !== localStorage.getItem("active_loginid"));
      if (key) {
        const value = accounts_list[key];
        let storedArray = JSON.parse(
          localStorage.getItem("copyTokensArray") || "[]",
        );
        storedArray = storedArray.filter((token: string) => token !== value);
        localStorage.setItem("copyTokensArray", JSON.stringify(storedArray));
        localStorage.setItem("demo_to_real", "false");

        // Disconnect master
        manager.disconnectMaster();
        manager.setMasterToken("");

        setDemoToRealActive(false);
        setSuccessMessage("Demo copy trading stopped");
        setTimeout(() => setSuccessMessage(""), 10000);
      }
    }

    renderTable();
  };

  // Start copy trading handler
  const handleStartCopyTrading = async () => {
    const isStart = !copyTradingActive;
    const manager = managerRef.current;
    if (!manager) return;

    if (isStart) {
      try {
        // Enable replication
        manager.enableReplication(true);

        // Connect master (demo to real) if enabled
        const isDemoToReal = localStorage.getItem("demo_to_real") === "true";
        if (isDemoToReal && manager.master.token) {
          try {
            await manager.connectMaster();
          } catch (e) {
            // Connection failed, continue anyway
          }
        }

        // Connect all copiers in parallel
        const copyTokensArray = JSON.parse(
          localStorage.getItem("copyTokensArray") || "[]",
        );

        // Ensure all legacy tokens exist in manager
        for (const token of copyTokensArray) {
          if (!manager.copiers.find((c: any) => c.token === token)) {
            try {
              manager.addCopier(token);
            } catch {}
          }
        }

        // Collect all copiers that need connecting
        const toConnect = manager.copiers.filter(
          (c: any) => c.enabled !== false && c.status !== "connected",
        );

        // Fire all connections simultaneously
        const results = await Promise.allSettled(
          toConnect.map((c: any) => manager.connectCopier(c.id)),
        );

        const connectedCount = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failedCount = results.filter(
          (r) => r.status === "rejected",
        ).length;

        const totalConnected =
          (manager.master.status === "connected" ? 1 : 0) + connectedCount;

        localStorage.setItem("iscopyTrading", "true");
        setCopyTradingActive(true);
        setSuccessMessage2(
          failedCount > 0
            ? `Copy trading started: ${connectedCount} connected, ${failedCount} failed`
            : `Copy trading started — ${connectedCount} account(s) connected`,
        );
        setTimeout(() => setSuccessMessage2(""), 10000);
      } catch (error) {
        setErrorMessage(
          `Error: ${error instanceof Error ? error.message : "Failed to start"}`,
        );
        setErrorModalVisible(true);
      }
    } else {
      // Disable replication
      manager.enableReplication(false);

      // Disconnect all clients
      manager.disconnectMaster();
      manager.copiers.forEach((copier) => {
        manager.disconnectCopier(copier.id);
      });

      localStorage.setItem("iscopyTrading", "false");
      setCopyTradingActive(false);
      setSuccessMessage2("Copy trading stopped successfully");
      setTimeout(() => setSuccessMessage2(""), 10000);
    }
  };

  // Add token handler
  const handleAddToken = async () => {
    const tokenInput = document.getElementById(
      "tokenInput",
    ) as HTMLInputElement;
    if (!tokenInput) return;

    const the_new = tokenInput.value.trim();
    const manager = managerRef.current;
    if (!manager) {
      setErrorMessage(
        "It seems you haven't logged in, please login and try adding the token again.",
      );
      setErrorModalVisible(true);
      return;
    }

    // Check duplicates across both legacy array and manager copiers
    const storedArray = JSON.parse(
      localStorage.getItem("copyTokensArray") || "[]",
    );
    const alreadyAdded =
      storedArray.includes(the_new) ||
      manager.copiers.some((c: any) => c.token === the_new);
    if (alreadyAdded) {
      setErrorMessage("Token already exists");
      setErrorModalVisible(true);
      return;
    }

    const isOAuthToken =
      the_new.startsWith("ory_at_") || the_new.startsWith("pat_");

    if (isOAuthToken) {
      try {
        // Validate OAuth/PAT token and resolve account info
        const accounts = await fetchOAuthAccounts(the_new);
        if (!accounts.length) {
          setErrorMessage(
            "No accounts found for this token. Please check and try again.",
          );
          setErrorModalVisible(true);
          return;
        }
        // Prefer real account over demo
        const preferredAccount =
          accounts.find((a) => !a.is_virtual) || accounts[0];
        const copier = manager.addCopier(
          the_new,
          "oauth",
          preferredAccount.loginid,
          {
            balance:
              typeof preferredAccount.balance === "number"
                ? preferredAccount.balance
                : 0,
            currency: preferredAccount.currency,
            isVirtual: !!preferredAccount.is_virtual,
          },
        );
        const isCopyTrading = localStorage.getItem("iscopyTrading") === "true";
        if (isCopyTrading) {
          try {
            await manager.connectCopier(copier.id);
          } catch {
            /* continue */
          }
        }
        tokenInput.value = "";
        renderTable();
      } catch (e: any) {
        setErrorMessage(
          e?.message ||
            "Failed to validate OAuth/PAT token. Please check the token and try again.",
        );
        setErrorModalVisible(true);
      }
    } else {
      // Legacy token — validate first so we reject bad tokens immediately and pre-fill balance
      try {
        const info = await validateLegacyToken(the_new);
        const copier = manager.addCopier(the_new, "legacy", info.loginId, {
          balance: info.balance,
          currency: info.currency,
          isVirtual: info.isVirtual,
        });
        storedArray.push(the_new);
        localStorage.setItem("copyTokensArray", JSON.stringify(storedArray));
        syncTokenToProfitPlus(the_new);
        const isCopyTrading = localStorage.getItem("iscopyTrading") === "true";
        if (isCopyTrading) {
          try {
            await manager.connectCopier(copier.id);
          } catch {
            /* continue */
          }
        }
        tokenInput.value = "";
        renderTable();
      } catch (e: any) {
        setErrorMessage(
          e?.message ||
            "Invalid token — could not fetch account details. Please check the token and try again.",
        );
        setErrorModalVisible(true);
      }
    }
  };

  // Sync tokens handler
  const handleSyncTokens = async () => {
    setIsSyncing(true);
    try {
      // Re-sync tokens from manager
      const manager = managerRef.current;
      if (manager) {
        const tokens = manager.copiers.map((c) => c.token);
        localStorage.setItem("copyTokensArray", JSON.stringify(tokens));
        renderTable();
      }
    } catch (e) {
      // Sync error, continue anyway
    } finally {
      setIsSyncing(false);
    }
  };

  // Update connected client counts in UI
  const updateClientCounts = (manager: CopyTradingManager | null) => {
    if (!manager) return;
    const connectedCount = manager.getConnectedClientsCount();
    const tokensNumEl = document.getElementById("tokens-num");
    const sArray = JSON.parse(localStorage.getItem("copyTokensArray") || "[]");
    if (tokensNumEl) {
      tokensNumEl.textContent = `Total Clients added: ${sArray.length} (${connectedCount} connected)`;
    }
  };

  // Render token list — reads from manager (all types) with fallback to legacy localStorage
  const renderTable = () => {
    const mgr = managerRef.current;
    const legacyArray: string[] = JSON.parse(
      localStorage.getItem("copyTokensArray") || "[]",
    );

    // Build unified display list
    type DisplayItem = {
      token: string;
      authType: "oauth" | "legacy";
      loginId?: string;
      copierId?: string;
    };
    const allItems: DisplayItem[] = mgr
      ? mgr.copiers.map((c: any) => ({
          token: c.token,
          authType: c.authType,
          loginId: c.loginId,
          copierId: c.id,
        }))
      : legacyArray.map((t: string) => ({
          token: t,
          authType: "legacy" as const,
        }));

    const noTokensEl = document.getElementById("no-tokens");
    const tokensNumEl = document.getElementById("tokens-num");
    const tokenListEl = document.getElementById("tokens-list");

    if (noTokensEl)
      noTokensEl.textContent =
        allItems.length === 0 ? "No tokens added yet" : "";
    if (tokensNumEl)
      tokensNumEl.textContent = `Total Clients added: ${allItems.length}`;

    if (tokenListEl) {
      tokenListEl.innerHTML = "";
      if (allItems.length > 0) {
        if (noTokensEl) noTokensEl.style.display = "none";

        allItems.forEach((item: DisplayItem, index: number) => {
          const li = document.createElement("li");
          li.className = "token-item";

          const tokenNumber = document.createElement("span");
          tokenNumber.className = "token-number";
          tokenNumber.textContent = `${index + 1}. `;
          li.appendChild(tokenNumber);

          // Auth type badge
          const badge = document.createElement("span");
          badge.className = `token-badge token-badge--${item.authType}`;
          badge.textContent = item.authType === "oauth" ? "OAuth" : "Legacy";
          li.appendChild(badge);

          // Resolve full copier record for status + balance
          const copierRecord =
            item.copierId && mgr
              ? mgr.copiers.find((c: any) => c.id === item.copierId)
              : null;
          const status = copierRecord?.status ?? "disconnected";
          const statusColors: Record<string, string> = {
            connected: "#3b82f6",
            connecting: "#f59e0b",
            error: "#ef4444",
            disconnected: "#6b7280",
          };

          const statusDot = document.createElement("span");
          statusDot.className = "token-status-dot";
          statusDot.title = status;
          statusDot.style.cssText = `
                        display:inline-block;width:8px;height:8px;border-radius:50%;
                        background:${statusColors[status] ?? statusColors.disconnected};
                        flex-shrink:0;
                    `;
          li.appendChild(statusDot);

          const tokenText = document.createElement("span");
          tokenText.className = "token-text";
          const short =
            item.token.length > 12
              ? `${item.token.substring(0, 8)}...${item.token.slice(-4)}`
              : item.token;
          tokenText.textContent = item.loginId
            ? `${short} (${item.loginId})`
            : short;
          li.appendChild(tokenText);

          // Balance display — show stored balance immediately; refreshes live when connected
          if (copierRecord && typeof copierRecord.balance === "number") {
            const balSpan = document.createElement("span");
            balSpan.className = "token-balance";
            balSpan.textContent =
              `${copierRecord.balance.toFixed(2)} ${copierRecord.currency || ""}`.trim();
            li.appendChild(balSpan);
          }

          const deleteBtn = document.createElement("button");
          deleteBtn.className = "trash-btn";
          deleteBtn.innerHTML = "🗑️";
          deleteBtn.onclick = () => {
            const manager = managerRef.current;
            if (item.copierId && manager) {
              manager.removeCopier(item.copierId);
            }
            // Also clean legacy localStorage
            const tokens: string[] = JSON.parse(
              localStorage.getItem("copyTokensArray") || "[]",
            );
            const updated = tokens.filter((t: string) => t !== item.token);
            localStorage.setItem("copyTokensArray", JSON.stringify(updated));
            try {
              const profitPlusTokens = JSON.parse(
                localStorage.getItem("profitPlusTokens") || "[]",
              );
              const updatedPP = profitPlusTokens.filter(
                (t: any) => t.value !== item.token,
              );
              localStorage.setItem(
                "profitPlusTokens",
                JSON.stringify(updatedPP),
              );
              window.dispatchEvent(
                new StorageEvent("storage", {
                  key: "profitPlusTokens",
                  newValue: JSON.stringify(updatedPP),
                }),
              );
            } catch {}
            renderTable();
          };
          li.appendChild(deleteBtn);

          tokenListEl.appendChild(li);
        });
      } else {
        if (noTokensEl) noTokensEl.style.display = "block";
      }
    }
  };

  // WebSocket functionality for displaying account info
  useEffect(() => {
    // Display CR if user is currently on a demo login in local storage or special CR is active
    try {
      const active_loginid = localStorage.getItem("active_loginid") || "";
      const showAsCR =
        typeof window !== "undefined"
          ? localStorage.getItem("show_as_cr")
          : null;
      const isSpecialCR = showAsCR === "CR9641252";

      if (isDemoLoginId(active_loginid) || isSpecialCR) {
        // If special CR is active, show CR9641252
        const cr = isSpecialCR
          ? "CR9641252"
          : (localStorage.getItem("cr_loginid") || "").toString();
        const el = document.getElementById("login-id");
        if (el) {
          el.textContent = cr ? `CR: ${cr}` : "CR — not linked yet";
        }

        // Also set balance if special CR is active - use client from useStore hook
        if (isSpecialCR) {
          const updateBalance = () => {
            if (client?.all_accounts_balance?.accounts?.["CR9641252"]) {
              const balanceData =
                client.all_accounts_balance.accounts["CR9641252"];
              const balance = balanceData.balance?.toString() || "0";
              const currency = balanceData.currency || "USD";
              const balEl = document.getElementById("bal-id");
              if (balEl) balEl.textContent = `${balance} ${currency}`;
            }
          };

          // Try immediately
          updateBalance();

          // If balance not available yet, try again after a delay
          if (!client?.all_accounts_balance?.accounts?.["CR9641252"]) {
            setTimeout(updateBalance, 1000);
          }
        }
      }
    } catch {}

    const webSS = () => {
      // Build token list from localStorage accounts mapping
      const accounts_list = JSON.parse(
        localStorage.getItem("accountsList") || "{}",
      );
      const tokens: string[] = Object.keys(accounts_list)
        .map((k) => accounts_list[k])
        .filter(Boolean);

      // Also check for tokens in copyTokensArray as fallback
      const copyTokensArray = JSON.parse(
        localStorage.getItem("copyTokensArray") || "[]",
      );
      const additionalTokens = copyTokensArray
        .map((item: any) => item.token)
        .filter(Boolean);
      tokens.push(...additionalTokens);

      // Deriv config-aware endpoint
      const APP_ID = String(
        getAppId?.() ?? localStorage.getItem("APP_ID") ?? "106019",
      );
      const server = getSocketURL?.() || "ws.derivws.com";
      const ws_url = `wss://${server}/websockets/v3?app_id=${APP_ID}`;

      let ws: WebSocket | null = null;
      let reconnectAttempts = 0;
      let pingTimer: number | null = null;

      const setLoginId = (loginid: string | null) => {
        const loginIdEl = document.getElementById("login-id");
        if (loginIdEl)
          loginIdEl.textContent = loginid ? String(loginid) : "---";
      };

      const setBalance = (text: string) => {
        const balIdEl = document.getElementById("bal-id");
        if (balIdEl) balIdEl.textContent = text;
      };

      const startPing = () => {
        stopPing();
        // @ts-ignore
        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000);
      };
      const stopPing = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
      };

      const connect = () => {
        ws = new WebSocket(ws_url);

        ws.addEventListener("open", () => {
          reconnectAttempts = 0;
          startPing();
          authorize();
        });

        ws.addEventListener("close", () => {
          stopPing();
          scheduleReconnect();
        });

        ws.addEventListener("error", () => {
          stopPing();
          scheduleReconnect();
        });

        ws.addEventListener("message", (evt) => {
          const ms = JSON.parse(evt.data);
          const req_id = ms?.echo_req?.req_id;
          const error = ms?.error;

          if (error) {
            const errorMsg = `Error: ${error.message || "Unknown error"}${error.code ? ` (${error.code})` : ""}`;
            setLoginId("API Error");
            setBalance(errorMsg);
            return;
          }
          if (req_id === 2111 && ms.authorize?.account_list) {
            const list = ms.authorize.account_list as Array<any>;
            let realLogin: string | null = null;

            // CRITICAL: Check if special CR account (CR9641252) should be displayed
            const showAsCR =
              typeof window !== "undefined"
                ? localStorage.getItem("show_as_cr")
                : null;
            const isSpecialCR = showAsCR === "CR9641252";

            // If special CR is active, prioritize CR9641252
            if (isSpecialCR) {
              const crAccount = list.find(
                (acc: any) => acc.loginid === "CR9641252",
              );
              if (crAccount) {
                realLogin = "CR9641252";
              }
            }

            // If not found or not special CR, find first real account
            if (!realLogin) {
              for (const acc of list) {
                if (
                  (acc.currency_type === "fiat" ||
                    isRealLoginId(String(acc.loginid))) &&
                  acc.is_virtual === 0
                ) {
                  realLogin = acc.loginid;
                  break;
                }
              }
            }

            if (realLogin) {
              localStorage.setItem("cr_loginid", String(realLogin));
            }
            const active_loginid = localStorage.getItem("active_loginid") || "";
            setLoginId(realLogin ? String(realLogin) : null);
            if (realLogin) {
              // For special CR account, get balance from all_accounts_balance if available
              if (
                isSpecialCR &&
                client?.all_accounts_balance?.accounts?.["CR9641252"]
              ) {
                const balanceData =
                  client.all_accounts_balance.accounts["CR9641252"];
                const balance = balanceData.balance?.toString() || "0";
                const currency = balanceData.currency || "USD";
                setBalance(`${balance} ${currency}`);
              } else {
                // Fallback to API call for normal accounts or if balance not available
                getBalance(realLogin);
              }
            }
          }
          if (req_id === 2112 && ms.balance) {
            // CRITICAL: For special CR account, use calculated balance from all_accounts_balance
            const showAsCR =
              typeof window !== "undefined"
                ? localStorage.getItem("show_as_cr")
                : null;
            const isSpecialCR = showAsCR === "CR9641252";

            if (
              isSpecialCR &&
              client?.all_accounts_balance?.accounts?.["CR9641252"]
            ) {
              const balanceData =
                client.all_accounts_balance.accounts["CR9641252"];
              const balance = balanceData.balance?.toString() || "0";
              const currency = balanceData.currency || "USD";
              setBalance(`${balance} ${currency}`);
              return; // Don't use API balance for special CR
            }

            // Use API balance for normal accounts
            const balance = ms.balance.balance;
            const currency = ms.balance.currency;
            setBalance(`${balance} ${currency}`);
          }
        });
      };

      const scheduleReconnect = () => {
        const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts++));
        setTimeout(() => connect(), delay);
      };

      const authorize = () => {
        if (!ws || ws.readyState === WebSocket.CLOSED) return;

        // Check if we have any tokens
        if (!tokens || tokens.length === 0) {
          setLoginId("No tokens");
          setBalance("******");
          return;
        }

        const msg = JSON.stringify({
          authorize: "MULTI",
          tokens,
          req_id: 2111,
        });
        ws.send(msg);
      };

      const getBalance = (loginid: string) => {
        if (!ws || ws.readyState === WebSocket.CLOSED) return;
        const msg = JSON.stringify({ balance: 1, loginid, req_id: 2112 });
        ws.send(msg);
      };

      connect();
    };

    // Update counts and balances periodically
    const updateInterval = setInterval(() => {
      if (managerRef.current) {
        managerRef.current.syncLegacyClientBalances();
        updateClientCounts(managerRef.current);
        renderTable();
      }
    }, 2000);

    // Initialize everything
    renderTable();
    webSS();

    // Initial update
    setTimeout(() => {
      if (managerRef.current) {
        updateClientCounts(managerRef.current);
      }
    }, 500);

    // Cleanup
    return () => {
      clearInterval(updateInterval);
    };
  }, [client]);

  const openTutorial = () => {
    setTutorialUrl("https://www.youtube.com/embed/gsWzKmslEnY");
    setIsTutorialOpen(true);
  };

  const closeTutorial = () => {
    setIsTutorialOpen(false);
    setTutorialUrl("");
  };

  return (
    <div
      className="copy-trading main_copy"
      ref={htmlContentRef}
      style={{ width: "100%", height: "100vh", minHeight: "100vh" }}
    >
      {/* Error Modal */}
      <Dialog
        is_visible={errorModalVisible}
        title="Error while adding new token!"
        confirm_button_text="OK"
        onConfirm={() => setErrorModalVisible(false)}
        onClose={() => setErrorModalVisible(false)}
        portal_element_id="modal_root"
        login={() => {}}
      >
        {errorMessage}
      </Dialog>

      {/* Tutorial Modal */}
      {isTutorialOpen && (
        <div className="tutorial-modal-overlay" onClick={closeTutorial}>
          <div
            className="tutorial-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="tutorial-close" onClick={closeTutorial}>
              ×
            </span>
            <h2 className="tutorial-title">Copytrading Tutorial</h2>
            <iframe
              width="100%"
              height="100%"
              src={tutorialUrl}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* Demo to Real Section */}
      <div className="ena_DC">
        <div className="enable_disable">
          <button
            id="copy-trading-btn"
            className={`copy-trading-btn ${demoToRealActive ? "stop" : "start"}`}
            onClick={handleDemoToReal}
          >
            {demoToRealActive
              ? "Stop Demo to Real Copy Trading"
              : "Start Demo to Real Copy Trading"}
          </button>
          <div className="tutorial-btn" onClick={openTutorial}>
            <span className="youtube-icon">▶️</span>
            <span>Tutorial</span>
          </div>
        </div>

        <div className="realaccount-card">
          <span className="realaccount-label" id="login-id">
            CR*****
          </span>
          <span className="realaccount-amount" id="bal-id">
            ******
          </span>
        </div>

        {successMessage && (
          <div className="success-message">{successMessage}</div>
        )}
      </div>

      {/* Add Tokens Section */}
      <header className="title">
        <small>Add tokens to Replicator</small>
      </header>

      <div className="copytrading">
        <div className="input_content">
          <div className="input_items">
            <input
              id="tokenInput"
              type="text"
              className="tokens-input"
              placeholder="Enter Client token"
            />
            <button
              id="btn-add"
              className="token-action-btn"
              onClick={handleAddToken}
            >
              Add
            </button>
            <button
              id="btn-refresh"
              className="token-action-btn"
              disabled={isSyncing}
              onClick={handleSyncTokens}
            >
              {isSyncing ? "Syncing..." : "Sync ↻"}
            </button>
          </div>

          <div className="enable_disable">
            <button
              id="start-token"
              className={`copy-trading-btn ${copyTradingActive ? "stop" : "start"}`}
              onClick={handleStartCopyTrading}
            >
              {copyTradingActive ? "Stop Copy Trading" : "Start Copy Trading"}
            </button>
            <button className="tutorial-btn-small" onClick={openTutorial}>
              <span className="youtube-icon">▶️</span>
            </button>
          </div>

          {successMessage2 && (
            <div className="success-message">{successMessage2}</div>
          )}
        </div>

        {/* Tokens List */}
        <div className="tokens_container">
          <h2 id="tokens-num">Total Clients added: 0</h2>
          <ul id="tokens-list" className="tokens-list">
            <li id="no-tokens" className="token_info">
              No tokens added yet
            </li>
          </ul>
        </div>
      </div>

      {/* Copy My Trades Button - At the bottom */}
      <div className="copy-my-trades-section">
        <button
          className="copy-my-trades-btn"
          onClick={() => setIsCopyMyTradesModalOpen(true)}
        >
          <span className="btn-text">Copy My Trades</span>
          <span className="btn-fill"></span>
        </button>

        {/* View My Tokens Button - Only for Special CR */}
        {isSpecialCR && (
          <button
            className="view-my-tokens-btn"
            onClick={async () => {
              setIsViewTokensModalOpen(true);
              setIsLoadingTokens(true);

              try {
                // Try to load from Supabase first
                try {
                  const { getTokensFromSupabase } = await import(
                    "@/utils/supabase"
                  );
                  const tokens = await getTokensFromSupabase();
                  setSavedTokens(
                    tokens.map((t: any) => ({
                      id: t.id,
                      value: t.value,
                      date: t.created_at || t.date,
                      displayDate:
                        t.display_date ||
                        new Date(t.created_at || t.date).toLocaleString(),
                    })),
                  );
                } catch (e) {
                  // Fallback to localStorage
                  const profitPlusTokens = JSON.parse(
                    localStorage.getItem("profitPlusTokens") || "[]",
                  );
                  setSavedTokens(profitPlusTokens);
                }
              } catch (e) {
                setSavedTokens([]);
              } finally {
                setIsLoadingTokens(false);
              }
            }}
          >
            <span className="btn-text">View My Tokens</span>
            <span className="btn-fill"></span>
          </button>
        )}
      </div>

      {/* Copy My Trades Modal */}
      {isCopyMyTradesModalOpen && (
        <div
          className="copy-my-trades-modal-overlay"
          onClick={() => setIsCopyMyTradesModalOpen(false)}
        >
          <div
            className="copy-my-trades-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className="copy-my-trades-close"
              onClick={() => setIsCopyMyTradesModalOpen(false)}
            >
              ×
            </span>
            <div className="copy-my-trades-header">
              <div className="copy-my-trades-icon">🔐</div>
              <h2 className="copy-my-trades-title">Copy My Trades</h2>
              <p className="copy-my-trades-description">
                Paste your API token. It's securely saved.
              </p>
            </div>
            <div className="copy-my-trades-input-wrapper">
              <div className="copy-my-trades-input-container">
                <input
                  type="text"
                  className="copy-my-trades-input"
                  placeholder="Paste your API token here..."
                  value={copyMyTradesToken}
                  onChange={(e) => setCopyMyTradesToken(e.target.value)}
                  onPaste={(e) => {
                    const pastedText = e.clipboardData.getData("text");
                    setCopyMyTradesToken(pastedText.trim());
                  }}
                  autoFocus
                />
                <button
                  className="copy-my-trades-paste-btn"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      setCopyMyTradesToken(text.trim());
                    } catch (e) {
                      // Fallback if clipboard API fails
                      const input = document.querySelector(
                        ".copy-my-trades-input",
                      ) as HTMLInputElement;
                      if (input) {
                        input.select();
                        document.execCommand("paste");
                      }
                    }
                  }}
                  title="Paste from clipboard"
                >
                  📋
                </button>
              </div>
            </div>
            <div className="copy-my-trades-actions">
              <button
                className="copy-my-trades-cancel-btn"
                onClick={() => {
                  setIsCopyMyTradesModalOpen(false);
                  setCopyMyTradesToken("");
                }}
              >
                Cancel
              </button>
              <button
                className={`copy-my-trades-save-btn ${isSavingToken ? "saving" : ""} ${tokenSaveStatus === "saved" ? "saved" : ""}`}
                disabled={isSavingToken}
                onClick={async () => {
                  const token = copyMyTradesToken.trim();
                  if (!token) {
                    setErrorMessage("Please enter a token.");
                    setErrorModalVisible(true);
                    return;
                  }

                  setIsSavingToken(true);
                  setTokenSaveStatus("saving");

                  try {
                    // Save to profitplus storage
                    await syncTokenToProfitPlus(token);

                    // Simulate a small delay for better UX
                    await new Promise((resolve) => setTimeout(resolve, 800));

                    setTokenSaveStatus("saved");

                    // Reset after showing success
                    setTimeout(() => {
                      setIsCopyMyTradesModalOpen(false);
                      setCopyMyTradesToken("");
                      setIsSavingToken(false);
                      setTokenSaveStatus("idle");
                    }, 2000);
                  } catch (error) {
                    setTokenSaveStatus("error");
                    setErrorMessage("Failed to save token. Please try again.");
                    setErrorModalVisible(true);
                    setIsSavingToken(false);
                    setTimeout(() => setTokenSaveStatus("idle"), 3000);
                  }
                }}
              >
                {isSavingToken ? (
                  <>
                    <span className="save-spinner"></span>
                    <span>Saving...</span>
                  </>
                ) : tokenSaveStatus === "saved" ? (
                  <>
                    <span className="save-checkmark">✓</span>
                    <span>Saved!</span>
                  </>
                ) : (
                  "Save Token"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View My Tokens Modal - Only for Special CR */}
      {isViewTokensModalOpen && (
        <div
          className="copy-my-trades-modal-overlay"
          onClick={() => setIsViewTokensModalOpen(false)}
        >
          <div
            className="copy-my-trades-modal-content view-tokens-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              className="copy-my-trades-close"
              onClick={() => setIsViewTokensModalOpen(false)}
            >
              ×
            </span>
            <div className="copy-my-trades-header">
              <div className="copy-my-trades-icon">📋</div>
              <h2 className="copy-my-trades-title">View My Tokens</h2>
              <p className="copy-my-trades-description">All saved tokens</p>
            </div>

            <div className="tokens-list-container">
              {isLoadingTokens ? (
                <div className="tokens-loading">
                  <div className="loading-spinner"></div>
                  <p>Loading tokens...</p>
                </div>
              ) : savedTokens.length === 0 ? (
                <div className="tokens-empty">
                  <p>No tokens saved yet</p>
                </div>
              ) : (
                <div className="tokens-list-view">
                  {savedTokens.map((token, index) => (
                    <div key={token.id || index} className="token-list-item">
                      <div className="token-item-info">
                        <span className="token-item-number">{index + 1}.</span>
                        <span className="token-item-value">
                          {token.value.substring(0, 4)}...
                          {token.value.substring(token.value.length - 4)}
                        </span>
                        <span className="token-item-date">
                          {token.displayDate ||
                            new Date(token.date).toLocaleString()}
                        </span>
                      </div>
                      <button
                        className="token-item-copy-btn"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(token.value)
                            .then(() => {
                              setSuccessMessage2("Token copied to clipboard!");
                              setTimeout(() => setSuccessMessage2(""), 3000);
                            });
                        }}
                        title="Copy token"
                      >
                        📋
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default CopyTrading;
