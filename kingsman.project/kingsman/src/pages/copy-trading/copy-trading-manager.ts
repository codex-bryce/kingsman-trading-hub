import { generateDerivApiInstance } from "@/external/bot-skeleton/services/api/appId";
import { fetchOAuthWebSocketUrl } from "@/utils/deriv-oauth";
import { isDemoLoginId } from "@/utils/account-prefixes";
import { getAppId } from "@/components/shared/utils/config/config";

export type TAuthType = "legacy" | "oauth";
export type TConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type TCopier = {
  id: string;
  token: string;
  authType: TAuthType;
  loginId?: string;
  balance?: number;
  currency?: string;
  isVirtual?: boolean;
  status: TConnectionStatus;
  addedAt: number;
  enabled?: boolean;
  lastErrorCode?: string;
  lastErrorMsg?: string;
};

export type TMasterState = {
  token: string;
  loginId?: string;
  balance?: number;
  status: TConnectionStatus;
};

const LS_KEYS = {
  MASTER_TOKEN: "copy_trading.master_token",
  COPIERS: "copy_trading.copiers_v2", // versioned key — supports authType
  SETTINGS: "copy_trading.settings",
};

// ─── Legacy client (DerivAPIBasic) ───────────────────────────────────────────

class LegacyDerivClient {
  api: any | null = null;
  status: TConnectionStatus = "disconnected";
  loginId?: string;
  balance?: number;
  currency?: string;
  private balanceSub: any | null = null;

  async connectAndAuthorize(token: string) {
    this.status = "connecting";
    this.api = generateDerivApiInstance();
    // If the shared socket is already open, skip waiting; otherwise wait for open event.
    if (this.api?.connection?.readyState !== WebSocket.OPEN) {
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          this.api?.connection?.removeEventListener?.("open", onOpen);
          resolve();
        };
        const onErr = () => {
          this.api?.connection?.removeEventListener?.("error", onErr);
          reject(new Error("socket error"));
        };
        this.api?.connection?.addEventListener?.("open", onOpen);
        this.api?.connection?.addEventListener?.("error", onErr);
        setTimeout(() => resolve(), 5000); // fallback only — usually fires via onOpen
      });
    }

    const { authorize, error } = await this.api.authorize(token);
    if (error) {
      this.status = "error";
      throw error;
    }
    this.status = "connected";
    this.loginId = authorize?.loginid;
    // Authorize response already carries current balance — use it as the initial value
    // so balance is available immediately without waiting for the subscription call
    if (typeof authorize?.balance === "number")
      this.balance = authorize.balance;
    if (authorize?.currency) this.currency = authorize.currency;

    try {
      // Subscribe for live balance updates after each trade
      const res = await this.api.send({ balance: 1, subscribe: 1 });
      if (!res?.error) {
        if (typeof res?.balance?.balance === "number")
          this.balance = res.balance.balance;
        if (res?.balance?.currency) this.currency = res.balance.currency;
        if (res?.subscription?.id) {
          this.balanceSub = this.api.onMessage()?.subscribe(({ data }: any) => {
            if (data?.msg_type === "balance") {
              if (typeof data?.balance?.balance === "number")
                this.balance = data.balance.balance;
              if (data?.balance?.currency)
                this.currency = data.balance.currency;
            }
          });
        }
      }
    } catch {
      /* balance subscription is optional */
    }

    return authorize;
  }

  disconnect() {
    try {
      this.balanceSub?.unsubscribe?.();
    } catch {}
    try {
      this.api?.disconnect?.();
    } catch {}
    this.status = "disconnected";
  }
}

// ─── OAuth/PAT client (raw WebSocket + OTP) ───────────────────────────────────

export class OAuthCopierClient {
  private ws: WebSocket | null = null;
  status: TConnectionStatus = "disconnected";
  loginId: string = "";
  balance: number = 0;
  currency: string = "";
  isVirtual: boolean = false;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void }
  >();
  private reqCounter = 1;
  private token: string = "";

  async connect(token: string, loginid: string) {
    this.token = token;
    this.loginId = loginid;
    this.isVirtual = isDemoLoginId(loginid);
    this.status = "connecting";

    const wsUrl = await fetchOAuthWebSocketUrl(token, loginid);
    this.ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const tid = setTimeout(
        () => reject(new Error("OTP socket open timeout")),
        12_000,
      );
      this.ws!.onopen = () => {
        clearTimeout(tid);
        resolve();
      };
      this.ws!.onerror = () => {
        clearTimeout(tid);
        reject(new Error("OTP socket error"));
      };
    });

    this.ws.onmessage = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data as string);
        const id = data?.req_id ?? data?.echo_req?.req_id;
        if (id !== undefined && this.pending.has(id)) {
          const { resolve, reject } = this.pending.get(id)!;
          this.pending.delete(id);
          if (data.error) reject(data.error);
          else resolve(data);
        }
      } catch {}
    };

    this.ws.onclose = () => {
      if (this.status === "connected") this.status = "disconnected";
    };

    // Fetch initial balance
    try {
      const res = await this.send({ balance: 1 });
      this.balance = res?.balance?.balance ?? 0;
      this.currency = res?.balance?.currency ?? "";
    } catch {}

    this.status = "connected";
  }

  send(payload: any, timeoutMs = 20_000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("OAuthCopierClient: socket not open"));
        return;
      }
      const id = this.reqCounter++;
      const tid = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OAuthCopierClient: request ${id} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(tid);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(tid);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ ...payload, req_id: id }));
    });
  }

  async refreshBalance() {
    try {
      const res = await this.send({ balance: 1 });
      this.balance = res?.balance?.balance ?? this.balance;
      this.currency = res?.balance?.currency ?? this.currency;
    } catch {}
  }

  disconnect() {
    for (const { reject } of this.pending.values())
      reject(new Error("disconnected"));
    this.pending.clear();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.status = "disconnected";
  }
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export class CopyTradingManager {
  master: TMasterState;
  copiers: TCopier[] = [];

  private masterClient: LegacyDerivClient | null = null;
  private legacyCopierClients: Map<string, LegacyDerivClient> = new Map();
  private oauthCopierClients: Map<string, OAuthCopierClient> = new Map();

  private replicationEnabled = false;
  private stakeCap: number | null = null;
  private stakeMultiplier: number = 1;

  constructor() {
    this.master = { token: "", status: "disconnected" };
    this.copiers = [];
    void this.restoreState();
  }

  async restoreState() {
    try {
      const { decryptText } = await import("./crypto");
      const encMaster = localStorage.getItem(LS_KEYS.MASTER_TOKEN) || "";
      const encCopiers = localStorage.getItem(LS_KEYS.COPIERS) || "";
      const encSettings = localStorage.getItem(LS_KEYS.SETTINGS) || "";
      this.master.token = encMaster ? await decryptText(encMaster) : "";
      this.copiers = encCopiers
        ? (JSON.parse(await decryptText(encCopiers)) as TCopier[])
        : [];
      if (encSettings) {
        const s = JSON.parse(await decryptText(encSettings));
        this.replicationEnabled = !!s.replicationEnabled;
        this.stakeCap = s.stakeCap ?? null;
        this.stakeMultiplier = s.stakeMultiplier ?? 1;
      }
    } catch {
      this.master.token = localStorage.getItem(LS_KEYS.MASTER_TOKEN) || "";
      try {
        this.copiers = JSON.parse(
          localStorage.getItem(LS_KEYS.COPIERS) || "[]",
        ) as TCopier[];
      } catch {
        this.copiers = [];
      }
      try {
        const s = JSON.parse(localStorage.getItem(LS_KEYS.SETTINGS) || "{}");
        this.replicationEnabled = !!s.replicationEnabled;
        this.stakeCap = s.stakeCap ?? null;
        this.stakeMultiplier = s.stakeMultiplier ?? 1;
      } catch {}
    }

    // Migrate old plain-string copyTokensArray to the new structured format
    this.migrateLegacyStorage();
  }

  private migrateLegacyStorage() {
    try {
      // Fix: if any copiers were previously migrated as 'oauth' without a loginId
      // (broken migration), downgrade them back to 'legacy' so they continue working.
      let needsResave = false;
      for (const copier of this.copiers) {
        if (copier.authType === "oauth" && !copier.loginId) {
          copier.authType = "legacy";
          needsResave = true;
        }
      }
      if (needsResave) void this.saveState();

      const oldTokens: string[] = JSON.parse(
        localStorage.getItem("copyTokensArray") || "[]",
      );
      if (!oldTokens.length) return;

      const existingTokens = new Set(this.copiers.map((c) => c.token));
      let changed = false;

      for (const token of oldTokens) {
        if (!token || existingTokens.has(token)) continue;
        // Always migrate as 'legacy' — these tokens were working with
        // buy_contract_for_multiple_accounts before. OAuth tokens get their
        // authType set only when the user explicitly re-adds them via the UI.
        this.copiers.push({
          id: `migrated_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          token,
          authType: "legacy",
          status: "disconnected",
          addedAt: Date.now(),
          enabled: true,
        });
        existingTokens.add(token);
        changed = true;
      }

      if (changed) void this.saveState();
    } catch {}
  }

  async saveState() {
    const saveData = {
      replicationEnabled: this.replicationEnabled,
      stakeCap: this.stakeCap,
      stakeMultiplier: this.stakeMultiplier,
    };
    try {
      const { encryptText } = await import("./crypto");
      localStorage.setItem(
        LS_KEYS.MASTER_TOKEN,
        await encryptText(this.master.token || ""),
      );
      localStorage.setItem(
        LS_KEYS.COPIERS,
        await encryptText(JSON.stringify(this.copiers)),
      );
      localStorage.setItem(
        LS_KEYS.SETTINGS,
        await encryptText(JSON.stringify(saveData)),
      );
    } catch {
      localStorage.setItem(LS_KEYS.MASTER_TOKEN, this.master.token || "");
      localStorage.setItem(LS_KEYS.COPIERS, JSON.stringify(this.copiers));
      localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(saveData));
    }
    // Keep copyTokensArray in sync: only real legacy tokens (never ory_at_/pat_ —
    // those are rejected by buy_contract_for_multiple_accounts with InputValidationFailed)
    const legacyOnly = this.copiers
      .filter(
        (c) =>
          c.authType === "legacy" &&
          c.enabled !== false &&
          !c.token.startsWith("ory_at_") &&
          !c.token.startsWith("pat_"),
      )
      .map((c) => c.token);
    localStorage.setItem("copyTokensArray", JSON.stringify(legacyOnly));
  }

  setMasterToken(token: string) {
    this.master.token = token.trim();
    void this.saveState();
  }

  async connectMaster() {
    if (!this.master.token) throw new Error("Missing master token");
    this.masterClient?.disconnect();
    this.masterClient = new LegacyDerivClient();
    try {
      await this.masterClient.connectAndAuthorize(this.master.token);
      this.master.status = "connected";
      this.master.loginId = this.masterClient.loginId;
      this.master.balance = this.masterClient.balance;
    } catch (e) {
      this.master.status = "error";
      throw e;
    }
  }

  disconnectMaster() {
    this.masterClient?.disconnect();
    this.master.status = "disconnected";
    this.masterClient = null;
  }

  addCopier(
    token: string,
    authType?: TAuthType,
    loginId?: string,
    meta?: { balance?: number; currency?: string; isVirtual?: boolean },
  ) {
    const trimmed = token.trim();
    if (!trimmed) throw new Error("Token required");
    if (this.copiers.some((c) => c.token === trimmed))
      throw new Error("Token already added");

    const detectedType: TAuthType =
      authType ??
      (trimmed.startsWith("ory_at_") || trimmed.startsWith("pat_")
        ? "oauth"
        : "legacy");

    const copier: TCopier = {
      id: `${Date.now()}`,
      token: trimmed,
      authType: detectedType,
      loginId,
      balance: meta?.balance,
      currency: meta?.currency,
      isVirtual: meta?.isVirtual,
      status: "disconnected",
      addedAt: Date.now(),
      enabled: true,
    };
    this.copiers.push(copier);
    void this.saveState();
    return copier;
  }

  removeCopier(id: string) {
    const copier = this.copiers.find((c) => c.id === id);
    if (copier) {
      this.legacyCopierClients.get(id)?.disconnect();
      this.legacyCopierClients.delete(id);
      this.oauthCopierClients.get(id)?.disconnect();
      this.oauthCopierClients.delete(id);
      this.copiers = this.copiers.filter((c) => c.id !== id);
      void this.saveState();
    }
  }

  async connectCopier(id: string) {
    const copier = this.copiers.find((c) => c.id === id);
    if (!copier) throw new Error("Copier not found");

    if (copier.authType === "oauth") {
      // OAuth/PAT: connect via OTP WebSocket
      const loginid = copier.loginId;
      if (!loginid)
        throw new Error("OAuth copier requires a loginId — re-add the token");
      const client = new OAuthCopierClient();
      try {
        await client.connect(copier.token, loginid);
        copier.status = "connected";
        copier.loginId = client.loginId;
        copier.balance = client.balance;
        copier.currency = client.currency;
        copier.lastErrorCode = undefined;
        copier.lastErrorMsg = undefined;
        this.oauthCopierClients.set(id, client);
        void this.saveState();
      } catch (e: any) {
        copier.status = "error";
        copier.lastErrorCode = e?.code || "Unknown";
        copier.lastErrorMsg = e?.message || "OAuth connection failed";
        void this.saveState();
        throw e;
      }
    } else {
      // Legacy: authorize via WebSocket
      const client = new LegacyDerivClient();
      try {
        await client.connectAndAuthorize(copier.token);
        copier.status = "connected";
        copier.loginId = client.loginId;
        copier.balance = client.balance;
        copier.currency = client.currency;
        copier.lastErrorCode = undefined;
        copier.lastErrorMsg = undefined;
        this.legacyCopierClients.set(id, client);
        void this.saveState();
      } catch (e: any) {
        copier.status = "error";
        copier.lastErrorCode = e?.code || e?.error?.code || "Unknown";
        copier.lastErrorMsg =
          e?.message || e?.error?.message || "Authorization failed";
        void this.saveState();
        throw e;
      }
    }
  }

  disconnectCopier(id: string) {
    this.legacyCopierClients.get(id)?.disconnect();
    this.legacyCopierClients.delete(id);
    this.oauthCopierClients.get(id)?.disconnect();
    this.oauthCopierClients.delete(id);
    const copier = this.copiers.find((c) => c.id === id);
    if (copier) {
      copier.status = "disconnected";
      void this.saveState();
    }
  }

  /** Returns {id, client} for all connected legacy copiers */
  getConnectedLegacyClients(): Array<{
    id: string;
    client: LegacyDerivClient;
  }> {
    const out: Array<{ id: string; client: LegacyDerivClient }> = [];
    for (const [id, client] of this.legacyCopierClients) {
      const c = this.copiers.find((x) => x.id === id);
      if (c?.status === "connected" && c.enabled !== false)
        out.push({ id, client });
    }
    return out;
  }

  /** Returns {id, copier, client} for all connected OAuth copiers */
  getConnectedOAuthClients(): Array<{
    id: string;
    copier: TCopier;
    client: OAuthCopierClient;
  }> {
    const out: Array<{
      id: string;
      copier: TCopier;
      client: OAuthCopierClient;
    }> = [];
    for (const [id, client] of this.oauthCopierClients) {
      const copier = this.copiers.find((x) => x.id === id);
      if (copier?.status === "connected" && copier.enabled !== false)
        out.push({ id, copier, client });
    }
    return out;
  }

  /** Returns all connected clients (legacy API union) */
  getConnectedClients(): Array<{ id: string; client: LegacyDerivClient }> {
    const clients: Array<{ id: string; client: LegacyDerivClient }> = [];
    if (this.masterClient && this.master.status === "connected") {
      clients.push({ id: "master", client: this.masterClient });
    }
    clients.push(...this.getConnectedLegacyClients());
    return clients;
  }

  getConnectedClientsCount(): number {
    return this.getConnectedClients().length + this.oauthCopierClients.size;
  }

  enableReplication(enable: boolean) {
    this.replicationEnabled = enable;
    void this.saveState();
  }
  setStakeCap(cap: number | null) {
    this.stakeCap = cap;
    void this.saveState();
  }
  setStakeMultiplier(mult: number) {
    this.stakeMultiplier = Math.max(0.01, mult);
    void this.saveState();
  }
  getSettings() {
    return {
      replicationEnabled: this.replicationEnabled,
      stakeCap: this.stakeCap,
      stakeMultiplier: this.stakeMultiplier,
    };
  }
  getClients() {
    return { master: this.masterClient, copiers: this.legacyCopierClients };
  }

  /** Pull latest balances from all live legacy clients into the copier records. */
  syncLegacyClientBalances(): void {
    for (const [id, client] of this.legacyCopierClients) {
      const copier = this.copiers.find((c) => c.id === id);
      if (copier) {
        if (client.balance !== undefined) copier.balance = client.balance;
        if (client.currency) copier.currency = client.currency;
      }
    }
    if (this.masterClient && this.masterClient.balance !== undefined) {
      this.master.balance = this.masterClient.balance;
    }
  }

  /** Refresh a single OAuth copier's balance from its live OTP socket and persist. */
  async syncOAuthClientBalance(id: string): Promise<void> {
    const client = this.oauthCopierClients.get(id);
    const copier = this.copiers.find((c) => c.id === id);
    if (!client || !copier) return;
    try {
      await client.refreshBalance();
      copier.balance = client.balance;
      copier.currency = client.currency;
      void this.saveState();
    } catch {}
  }

  async replicateTrade(_contractParams: Record<string, any>) {
    // Driven by initReplicator via observer events
  }
}

export default CopyTradingManager;
