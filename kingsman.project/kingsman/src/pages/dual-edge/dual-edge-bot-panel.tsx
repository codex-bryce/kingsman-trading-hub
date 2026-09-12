import React, { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { contract_stages } from "@/constants/contract-stage";
import {
  getStandaloneOAuthAwareApi,
  V2GetActiveClientId,
  V2GetActiveToken,
} from "@/external/bot-skeleton/services/api/appId";
import { useStore } from "@/hooks/useStore";
import { localize } from "@deriv-com/translations";

type TDualEdgeStrategy = "ultimate_2026" | "nexus_ai";

type TStrategyTrigger = {
  contract_type:
    | "DIGITOVER"
    | "DIGITUNDER"
    | "DIGITEVEN"
    | "DIGITODD"
    | "CALL"
    | "PUT";
  label: string;
  prediction?: number;
  recovery: boolean;
};

type TStrategyPreset = {
  heading: string;
  subtitle: string;
  strategy_label: string;
  recovery_label: string;
  hero_badge: string;
  how_it_works: string[];
};

type TInitialTradeOption = {
  key: "initial_o1_u8_l2" | "initial_o2_u7_l3" | "initial_o3_u6_l4";
  label: string;
  lookback: number;
  over_prediction: number;
  under_prediction: number;
};

type TRecoveryOption = {
  key:
    | "recovery_eo_l7"
    | "recovery_eo_l6"
    | "recovery_rf_l7"
    | "recovery_rf_l6"
    | "recovery_o4_u5_l6"
    | "recovery_o4_u5_l7";
  label: string;
  lookback: number;
  mode: "evenodd" | "risefall" | "overunder45";
};

const INITIAL_TRADE_OPTIONS: TInitialTradeOption[] = [
  {
    key: "initial_o1_u8_l2",
    label: "Over 1 / Under 8 (last 2 digits)",
    lookback: 2,
    over_prediction: 1,
    under_prediction: 8,
  },
  {
    key: "initial_o2_u7_l3",
    label: "Over 2 / Under 7 (last 3 digits)",
    lookback: 3,
    over_prediction: 2,
    under_prediction: 7,
  },
  {
    key: "initial_o3_u6_l4",
    label: "Over 3 / Under 6 (last 4 digits)",
    lookback: 4,
    over_prediction: 3,
    under_prediction: 6,
  },
];

const RECOVERY_OPTIONS: TRecoveryOption[] = [
  {
    key: "recovery_eo_l7",
    label: "Even/Odd Pattern (last 7)",
    lookback: 7,
    mode: "evenodd",
  },
  {
    key: "recovery_eo_l6",
    label: "Even/Odd Pattern (last 6)",
    lookback: 6,
    mode: "evenodd",
  },
  {
    key: "recovery_rf_l7",
    label: "Rise/Fall Direction Pattern (last 7)",
    lookback: 7,
    mode: "risefall",
  },
  {
    key: "recovery_rf_l6",
    label: "Rise/Fall Direction Pattern (last 6)",
    lookback: 6,
    mode: "risefall",
  },
  {
    key: "recovery_o4_u5_l6",
    label: "Over 4 / Under 5 Pattern (last 6)",
    lookback: 6,
    mode: "overunder45",
  },
  {
    key: "recovery_o4_u5_l7",
    label: "Over 4 / Under 5 Pattern (last 7)",
    lookback: 7,
    mode: "overunder45",
  },
];

const getDominanceThreshold = (lookback: number) =>
  Math.ceil((lookback * 2) / 3);

const getStrategyPreset = (
  strategy: TDualEdgeStrategy,
  initial_trade_option: TInitialTradeOption,
  recovery_option: TRecoveryOption,
): TStrategyPreset => {
  if (strategy === "ultimate_2026") {
    return {
      heading: "Ultimate Bot",
      subtitle: `Initial: ${initial_trade_option.label} · Recovery: ${recovery_option.label}`,
      strategy_label: initial_trade_option.label,
      recovery_label: recovery_option.label,
      hero_badge: "RECOVERY TYPE",
      how_it_works: [
        "Monitors all volatility markets (random_index)",
        `Initial: ${initial_trade_option.label} -> uses the last n digits to trigger the opening trade`,
        "Duration: 1 tick for all trades",
        `Recovery (on loss): ${recovery_option.label}`,
        "Tick-triggered execution (instant trading)",
      ],
    };
  }

  return {
    heading: "Glean AI",
    subtitle:
      "Strategy: GLEAN AI · Trades: O1 (3<=1), O2 (4<=2), U7 (4>7), U8 (3>8)",
    strategy_label: "GLEAN AI",
    recovery_label: "No recovery",
    hero_badge: "GLEAN AI",
    how_it_works: [
      "Monitors all volatility markets (random_index)",
      "GLEAN AI -> trades DIGITOVER 1/2 and DIGITUNDER 7/8 (no recovery mode)",
      "Duration: 1 tick for all trades",
      "Recovery: OFF",
      "Tick-triggered execution (instant trading)",
    ],
  };
};

const getLastDigit = (quote: number | string) => {
  const normalized = String(quote).replace(".", "");
  return Number(normalized[normalized.length - 1]);
};

const buildBuyRequest = (
  symbol: string,
  currency: string,
  amount: number,
  contract_type: TStrategyTrigger["contract_type"],
  prediction?: number,
) => {
  const parameters: Record<string, string | number> = {
    amount,
    basis: "stake",
    contract_type,
    currency,
    duration: 1,
    duration_unit: "t",
    symbol,
  };

  if (typeof prediction === "number") {
    parameters.barrier = String(prediction);
    parameters.selected_tick = prediction;
  }

  return {
    buy: "1",
    price: amount,
    parameters,
  };
};

const getSymbolDisplayName = (symbol: string) => symbol.replaceAll("_", " ");

const isSyntheticRandomIndex = (symbol: {
  symbol?: string;
  market?: string;
  display_name?: string;
}) =>
  /^R_/.test(symbol.symbol || "") &&
  (/synthetic/i.test(symbol.market || "") ||
    /volatility|step|range/i.test(symbol.display_name || ""));

const evaluateUltimateInitialTrade = (
  digits: number[],
  initial_trade_option: TInitialTradeOption,
): TStrategyTrigger | null => {
  if (digits.length < initial_trade_option.lookback) return null;
  const sample = digits.slice(-initial_trade_option.lookback);

  if (sample.every((digit) => digit <= initial_trade_option.over_prediction)) {
    return {
      contract_type: "DIGITOVER",
      prediction: initial_trade_option.over_prediction,
      label: `Initial over ${initial_trade_option.over_prediction} trigger from last ${initial_trade_option.lookback}`,
      recovery: false,
    };
  }

  if (sample.every((digit) => digit > initial_trade_option.under_prediction)) {
    return {
      contract_type: "DIGITUNDER",
      prediction: initial_trade_option.under_prediction,
      label: `Initial under ${initial_trade_option.under_prediction} trigger from last ${initial_trade_option.lookback}`,
      recovery: false,
    };
  }

  return null;
};

const evaluateUltimateRecoveryTrade = (
  digits: number[],
  quotes: number[],
  recovery_option: TRecoveryOption,
): TStrategyTrigger | null => {
  const threshold = getDominanceThreshold(recovery_option.lookback);

  if (recovery_option.mode === "evenodd") {
    if (digits.length < recovery_option.lookback) return null;
    const sample = digits.slice(-recovery_option.lookback);
    const even_count = sample.filter((digit) => digit % 2 === 0).length;
    const odd_count = sample.length - even_count;

    if (even_count >= threshold) {
      return {
        contract_type: "DIGITODD",
        label: `Recovery odd after ${even_count}/${recovery_option.lookback} even digits`,
        recovery: true,
      };
    }

    if (odd_count >= threshold) {
      return {
        contract_type: "DIGITEVEN",
        label: `Recovery even after ${odd_count}/${recovery_option.lookback} odd digits`,
        recovery: true,
      };
    }

    return null;
  }

  if (recovery_option.mode === "risefall") {
    if (quotes.length < recovery_option.lookback + 1) return null;
    const sample = quotes.slice(-(recovery_option.lookback + 1));
    let up_count = 0;
    let down_count = 0;

    for (let index = 1; index < sample.length; index += 1) {
      if (sample[index] > sample[index - 1]) up_count += 1;
      if (sample[index] < sample[index - 1]) down_count += 1;
    }

    if (up_count >= threshold) {
      return {
        contract_type: "PUT",
        label: `Recovery fall after ${up_count}/${recovery_option.lookback} rising ticks`,
        recovery: true,
      };
    }

    if (down_count >= threshold) {
      return {
        contract_type: "CALL",
        label: `Recovery rise after ${down_count}/${recovery_option.lookback} falling ticks`,
        recovery: true,
      };
    }

    return null;
  }

  if (digits.length < recovery_option.lookback) return null;
  const sample = digits.slice(-recovery_option.lookback);
  const low_count = sample.filter((digit) => digit <= 4).length;
  const high_count = sample.filter((digit) => digit >= 5).length;

  if (low_count >= threshold) {
    return {
      contract_type: "DIGITOVER",
      prediction: 4,
      label: `Recovery over 4 after ${low_count}/${recovery_option.lookback} low digits`,
      recovery: true,
    };
  }

  if (high_count >= threshold) {
    return {
      contract_type: "DIGITUNDER",
      prediction: 5,
      label: `Recovery under 5 after ${high_count}/${recovery_option.lookback} high digits`,
      recovery: true,
    };
  }

  return null;
};

const evaluateNexusAI = (digits: number[]): TStrategyTrigger | null => {
  const last3 = digits.slice(-3);
  const last4 = digits.slice(-4);

  if (last4.length === 4 && last4.every((digit) => digit <= 2)) {
    return {
      contract_type: "DIGITOVER",
      prediction: 2,
      label: "O2 trigger from 4 digits <= 2",
      recovery: false,
    };
  }

  if (last4.length === 4 && last4.every((digit) => digit > 7)) {
    return {
      contract_type: "DIGITUNDER",
      prediction: 7,
      label: "U7 trigger from 4 digits > 7",
      recovery: false,
    };
  }

  if (last3.length === 3 && last3.every((digit) => digit <= 1)) {
    return {
      contract_type: "DIGITOVER",
      prediction: 1,
      label: "O1 trigger from 3 digits <= 1",
      recovery: false,
    };
  }

  if (last3.length === 3 && last3.every((digit) => digit > 8)) {
    return {
      contract_type: "DIGITUNDER",
      prediction: 8,
      label: "U8 trigger from 3 digits > 8",
      recovery: false,
    };
  }

  return null;
};

const DualEdgeBotPanel = observer(
  ({ strategy }: { strategy: TDualEdgeStrategy }) => {
    const store = useStore();
    const { run_panel, transactions, client } = store;

    const apiRef = useRef<any>(null);
    const is_authorized_ref = useRef(false);
    const running_ref = useRef(false);
    const stop_after_contract_ref = useRef(false);
    const current_contract_id_ref = useRef<number | null>(null);
    const current_contract_subscription_id_ref = useRef<string | null>(null);
    const tracked_contract_ids_ref = useRef<Set<number>>(new Set());
    const active_signal_ref = useRef<TStrategyTrigger | null>(null);
    const trade_in_flight_ref = useRef(false);
    const buffers_ref = useRef<Record<string, number[]>>({});
    const tick_subscription_ids_ref = useRef<Record<string, string>>({});
    const subscribed_symbols_ref = useRef<string[]>([]);
    const message_handler_ref = useRef<((evt: MessageEvent) => void) | null>(
      null,
    );
    const is_shared_api_ref = useRef(false);
    const cumulative_profit_ref = useRef(0);
    const base_stake_ref = useRef(0.5);
    const live_stake_ref = useRef(0.5);
    const martingale_ref = useRef(2);
    const recovery_mode_ref = useRef(false);
    const price_buffers_ref = useRef<Record<string, number[]>>({});
    const initial_trade_option_ref = useRef<TInitialTradeOption>(
      INITIAL_TRADE_OPTIONS[0],
    );
    const recovery_option_ref = useRef<TRecoveryOption>(RECOVERY_OPTIONS[0]);

    const [is_api_connected, setIsApiConnected] = useState(false);
    const [markets_ready, setMarketsReady] = useState(false);
    const [is_running, setIsRunning] = useState(false);
    const [status_text, setStatusText] = useState("Stopped");
    const [signal_text, setSignalText] = useState("Waiting for analysis");
    const [selected_market, setSelectedMarket] = useState("--");
    const [won_trades, setWonTrades] = useState(0);
    const [lost_trades, setLostTrades] = useState(0);
    const [profit_total, setProfitTotal] = useState(0);
    const [stake, setStake] = useState("0.5");
    const [take_profit, setTakeProfit] = useState("5");
    const [stop_loss, setStopLoss] = useState("30");
    const [martingale, setMartingale] = useState("2");
    const [current_stake, setCurrentStake] = useState("0.5");
    const [account_currency, setAccountCurrency] = useState("USD");
    const [available_symbols, setAvailableSymbols] = useState<string[]>([]);
    const [initial_trade_key, setInitialTradeKey] =
      useState<TInitialTradeOption["key"]>("initial_o1_u8_l2");
    const [recovery_key, setRecoveryKey] =
      useState<TRecoveryOption["key"]>("recovery_eo_l7");

    const selected_initial_trade_option = useMemo(
      () =>
        INITIAL_TRADE_OPTIONS.find(
          (option) => option.key === initial_trade_key,
        ) || INITIAL_TRADE_OPTIONS[0],
      [initial_trade_key],
    );
    const selected_recovery_option = useMemo(
      () =>
        RECOVERY_OPTIONS.find((option) => option.key === recovery_key) ||
        RECOVERY_OPTIONS[0],
      [recovery_key],
    );
    const preset = useMemo(
      () =>
        getStrategyPreset(
          strategy,
          selected_initial_trade_option,
          selected_recovery_option,
        ),
      [selected_initial_trade_option, selected_recovery_option, strategy],
    );

    const metric_cards = useMemo(
      () => [
        { label: "Won Trades", value: won_trades, type: "success" },
        { label: "Lost Trades", value: lost_trades, type: "danger" },
      ],
      [lost_trades, won_trades],
    );

    const reset_runtime = () => {
      tracked_contract_ids_ref.current.clear();
      cumulative_profit_ref.current = 0;
      recovery_mode_ref.current = false;
      stop_after_contract_ref.current = false;
      active_signal_ref.current = null;
      current_contract_id_ref.current = null;
      current_contract_subscription_id_ref.current = null;
      trade_in_flight_ref.current = false;
      live_stake_ref.current = Number(stake) || 0.5;
      base_stake_ref.current = Number(stake) || 0.5;
      martingale_ref.current = Number(martingale) || 2;
      setWonTrades(0);
      setLostTrades(0);
      setProfitTotal(0);
      setCurrentStake(String(live_stake_ref.current));
      setSelectedMarket("--");
      setSignalText("Waiting for analysis");
    };

    useEffect(() => {
      initial_trade_option_ref.current = selected_initial_trade_option;
    }, [selected_initial_trade_option]);

    useEffect(() => {
      recovery_option_ref.current = selected_recovery_option;
    }, [selected_recovery_option]);

    const bindApiMessageListener = (api_instance = apiRef.current) => {
      if (!api_instance?.connection) return;

      if (message_handler_ref.current) {
        api_instance.connection.removeEventListener?.(
          "message",
          message_handler_ref.current,
        );
      }

      const handleMessage = (evt: MessageEvent) => {
        try {
          const data =
            typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;

          if (
            data?.msg_type === "tick" &&
            data?.tick?.symbol &&
            data?.tick?.quote !== undefined
          ) {
            handleTick(data.tick.symbol, Number(data.tick.quote));
          }

          if (
            data?.msg_type === "proposal_open_contract" &&
            data?.proposal_open_contract
          ) {
            if (data?.proposal_open_contract?.contract_id) {
              transactions?.onBotContractEvent?.(
                createContractEventPayload(data.proposal_open_contract) as any,
              );
            }
            if (data?.subscription?.id) {
              current_contract_subscription_id_ref.current =
                current_contract_subscription_id_ref.current ||
                data.subscription.id;
            }

            if (
              data?.proposal_open_contract?.is_sold ||
              data?.proposal_open_contract?.status === "sold"
            ) {
              void handleContractClose(data.proposal_open_contract);
            }
          }
        } catch {
          // noop
        }
      };

      message_handler_ref.current = handleMessage;
      api_instance.connection.addEventListener?.("message", handleMessage);
    };

    const forgetSubscription = async (forget_id: string | null) => {
      if (!forget_id || !apiRef.current) return;
      try {
        await apiRef.current.forget({ forget: forget_id });
      } catch {
        // noop
      }
    };

    const stopScanning = async () => {
      const ids = Object.values(tick_subscription_ids_ref.current);
      tick_subscription_ids_ref.current = {};
      subscribed_symbols_ref.current = [];

      await Promise.all(ids.map((forget_id) => forgetSubscription(forget_id)));
    };

    const setRunPanelIdle = () => {
      run_panel?.setIsRunning(false);
      run_panel?.setHasOpenContract(false);
      run_panel?.setContractStage(contract_stages.NOT_RUNNING);
    };

    const evaluateStrategy = (symbol: string, digits: number[]) => {
      if (strategy === "ultimate_2026") {
        const quotes = price_buffers_ref.current[symbol] || [];

        if (recovery_mode_ref.current) {
          return evaluateUltimateRecoveryTrade(
            digits,
            quotes,
            recovery_option_ref.current,
          );
        }

        return evaluateUltimateInitialTrade(
          digits,
          initial_trade_option_ref.current,
        );
      }

      return evaluateNexusAI(digits);
    };

    const authorizeIfNeeded = async () => {
      const current_loginid = client?.loginid || V2GetActiveClientId() || "";
      const current_currency = client?.currency || account_currency || "USD";

      if (is_authorized_ref.current || !apiRef.current) {
        return {
          currency: current_currency,
          loginid: current_loginid,
        };
      }

      const token = V2GetActiveToken();
      if (!token) {
        throw new Error("No active token found. Please log in first.");
      }

      const { authorize, error } = await apiRef.current.authorize(token);
      if (error) {
        throw new Error(error.message || error.code || "Authorization failed");
      }

      const loginid = authorize?.loginid || V2GetActiveClientId() || "";
      const currency = authorize?.currency || "USD";

      is_authorized_ref.current = true;
      setIsApiConnected(true);
      setAccountCurrency(currency);
      client?.setLoginId?.(loginid);
      client?.setCurrency?.(currency);
      client?.setIsLoggedIn?.(true);

      return {
        currency,
        loginid,
      };
    };

    const createContractEventPayload = (
      contract: Record<string, unknown>,
      symbol?: string,
      trigger?: TStrategyTrigger,
    ) => {
      const loginid = client?.loginid || V2GetActiveClientId() || "";
      const currency =
        (contract.currency as string) ||
        client?.currency ||
        account_currency ||
        "USD";
      const market_symbol =
        symbol || (contract.underlying as string) || selected_market || "--";
      const active_trigger = trigger || active_signal_ref.current;
      const barrier =
        typeof contract.barrier === "string" ||
        typeof contract.barrier === "number"
          ? contract.barrier
          : typeof active_trigger?.prediction === "number"
            ? String(active_trigger.prediction)
            : undefined;
      const strategy_title = preset.heading;
      const signal_label = active_trigger?.label
        ? `${active_trigger.label} on ${market_symbol}`
        : market_symbol;

      return {
        ...contract,
        accountID: (contract.accountID as string) || loginid,
        barrier,
        currency,
        display_name:
          (contract.display_name as string) ||
          getSymbolDisplayName(market_symbol),
        longcode:
          (contract.longcode as string) || `${strategy_title}: ${signal_label}`,
        tick_count: contract.tick_count || 1,
        underlying: (contract.underlying as string) || market_symbol,
      };
    };

    const finalizeStop = async (reason = "Stopped") => {
      running_ref.current = false;
      stop_after_contract_ref.current = false;
      setIsRunning(false);
      setStatusText(reason);
      await stopScanning();
      setRunPanelIdle();
    };

    const handleContractClose = async (proposal_open_contract: any) => {
      const contract_id = Number(proposal_open_contract?.contract_id);
      if (!contract_id || contract_id !== current_contract_id_ref.current)
        return;

      const profit = Number(proposal_open_contract?.profit || 0);
      const next_total = Number(
        (cumulative_profit_ref.current + profit).toFixed(2),
      );
      cumulative_profit_ref.current = next_total;
      setProfitTotal(next_total);

      if (profit > 0) {
        setWonTrades((prev) => prev + 1);
        recovery_mode_ref.current = false;
        live_stake_ref.current = base_stake_ref.current;
        setCurrentStake(String(base_stake_ref.current));
        setSignalText(`Won ${profit.toFixed(2)} on ${selected_market}`);
      } else {
        setLostTrades((prev) => prev + 1);
        recovery_mode_ref.current = strategy === "ultimate_2026";
        live_stake_ref.current = Number(
          (live_stake_ref.current * martingale_ref.current).toFixed(2),
        );
        setCurrentStake(String(live_stake_ref.current));
        setSignalText(`Loss ${profit.toFixed(2)} -> martingale applied`);
      }

      run_panel?.setHasOpenContract(false);
      run_panel?.setContractStage(contract_stages.CONTRACT_CLOSED);

      current_contract_id_ref.current = null;
      tracked_contract_ids_ref.current.delete(contract_id);
      await forgetSubscription(current_contract_subscription_id_ref.current);
      current_contract_subscription_id_ref.current = null;

      const tp_value = Number(take_profit) || 0;
      const sl_value = Number(stop_loss) || 0;

      if (tp_value > 0 && next_total >= tp_value) {
        await finalizeStop(`TP hit at ${next_total.toFixed(2)}`);
        return;
      }

      if (sl_value > 0 && next_total <= -sl_value) {
        await finalizeStop(`SL hit at ${next_total.toFixed(2)}`);
        return;
      }

      if (stop_after_contract_ref.current) {
        await finalizeStop("Stopped after active trade");
        return;
      }

      run_panel?.setContractStage(contract_stages.STARTING);
      setStatusText("Scanning markets...");
    };

    const executeTrade = async (symbol: string, trigger: TStrategyTrigger) => {
      if (
        !apiRef.current ||
        trade_in_flight_ref.current ||
        current_contract_id_ref.current
      )
        return;

      trade_in_flight_ref.current = true;
      active_signal_ref.current = trigger;
      setSelectedMarket(symbol);
      setSignalText(`${trigger.label} on ${symbol}`);
      setStatusText(`Executing ${trigger.contract_type} on ${symbol}`);

      try {
        const { currency, loginid } = await authorizeIfNeeded();

        const amount = Number(live_stake_ref.current.toFixed(2));
        const buy_request = buildBuyRequest(
          symbol,
          currency,
          amount,
          trigger.contract_type,
          trigger.prediction,
        );

        const { buy, error } = await apiRef.current.buy(buy_request);
        if (error) {
          throw new Error(
            error.message || error.code || "Trade execution failed",
          );
        }

        const contract_id = Number(buy?.contract_id);
        if (!contract_id) {
          throw new Error("No contract id returned from API");
        }

        current_contract_id_ref.current = contract_id;
        tracked_contract_ids_ref.current.add(contract_id);

        transactions?.onBotContractEvent?.(
          createContractEventPayload(
            {
              contract_id,
              accountID: loginid,
              transaction_ids: { buy: buy.transaction_id },
              barrier:
                typeof trigger.prediction === "number"
                  ? String(trigger.prediction)
                  : undefined,
              buy_price: buy.buy_price,
              currency,
              contract_type: trigger.contract_type,
              underlying: symbol,
              date_start: Math.floor(Date.now() / 1000),
              status: "open",
            },
            symbol,
            trigger,
          ) as any,
        );

        run_panel?.toggleDrawer(true);
        run_panel?.setActiveTabIndex(1);
        run_panel?.setHasOpenContract(true);
        run_panel?.setContractStage(contract_stages.PURCHASE_SENT);
        setStatusText(`Trade live on ${symbol}`);

        const subscription_response = await apiRef.current.send({
          proposal_open_contract: 1,
          contract_id,
          subscribe: 1,
        });

        if (subscription_response?.error) {
          throw new Error(
            subscription_response.error.message ||
              subscription_response.error.code,
          );
        }

        current_contract_subscription_id_ref.current =
          subscription_response?.subscription?.id || null;

        if (
          subscription_response?.proposal_open_contract &&
          Number(subscription_response.proposal_open_contract.contract_id) ===
            contract_id
        ) {
          transactions?.onBotContractEvent?.(
            createContractEventPayload(
              subscription_response.proposal_open_contract,
              symbol,
              trigger,
            ) as any,
          );
        }
      } catch (error: any) {
        current_contract_id_ref.current = null;
        setStatusText(`Error: ${error?.message || "Trade failed"}`);
      } finally {
        trade_in_flight_ref.current = false;
      }
    };

    const seedSymbolBuffers = async (symbols_to_seed: string[]) => {
      if (!apiRef.current) return;

      await Promise.all(
        symbols_to_seed.map(async (symbol) => {
          try {
            const response = await apiRef.current.send({
              ticks_history: symbol,
              count: 8,
              end: "latest",
              style: "ticks",
            });

            const prices = response?.history?.prices || [];
            if (prices.length) {
              price_buffers_ref.current[symbol] = prices
                .map((price: number) => Number(price))
                .slice(-12);
              buffers_ref.current[symbol] = prices
                .map((price: number) => getLastDigit(price))
                .slice(-8);
            }
          } catch {
            price_buffers_ref.current[symbol] =
              price_buffers_ref.current[symbol] || [];
            buffers_ref.current[symbol] = buffers_ref.current[symbol] || [];
          }
        }),
      );
    };

    const startScanning = async () => {
      const symbols_to_scan = available_symbols.filter(Boolean);
      if (!apiRef.current || !symbols_to_scan.length) return;

      await stopScanning();
      await seedSymbolBuffers(symbols_to_scan);

      const responses = await Promise.all(
        symbols_to_scan.map((symbol) =>
          apiRef.current.send({ ticks: symbol, subscribe: 1 }),
        ),
      );

      responses.forEach((response, index) => {
        const subscription_id = response?.subscription?.id;
        if (subscription_id) {
          tick_subscription_ids_ref.current[symbols_to_scan[index]] =
            subscription_id;
        }
      });

      subscribed_symbols_ref.current = [...symbols_to_scan];
      setStatusText("Scanning markets...");
    };

    const handleTick = (symbol: string, quote: number) => {
      const next_digits = [
        ...(buffers_ref.current[symbol] || []),
        getLastDigit(quote),
      ].slice(-8);
      const next_prices = [
        ...(price_buffers_ref.current[symbol] || []),
        Number(quote),
      ].slice(-12);
      buffers_ref.current[symbol] = next_digits;
      price_buffers_ref.current[symbol] = next_prices;

      if (
        !running_ref.current ||
        stop_after_contract_ref.current ||
        trade_in_flight_ref.current ||
        current_contract_id_ref.current
      ) {
        return;
      }

      setSelectedMarket(symbol);
      const trigger = evaluateStrategy(symbol, next_digits);
      if (!trigger) return;

      void executeTrade(symbol, trigger);
    };

    const initializeApi = async () => {
      try {
        const { api, is_shared } =
          await getStandaloneOAuthAwareApi("dual-edge");
        apiRef.current = api;
        is_shared_api_ref.current = is_shared;
        bindApiMessageListener(api);

        await authorizeIfNeeded();

        const response = await api.send({ active_symbols: "brief" });
        if (response?.error) {
          throw new Error(
            response.error.message ||
              response.error.code ||
              "Failed to load markets",
          );
        }

        const symbols = (
          Array.isArray(response?.active_symbols) ? response.active_symbols : []
        )
          .filter((item) => item && isSyntheticRandomIndex(item) && item.symbol)
          .map((item: { symbol: string }) => item.symbol)
          .filter(Boolean);

        setAvailableSymbols(symbols);
        setMarketsReady(symbols.length > 0);
        setStatusText(
          symbols.length > 0 ? "Stopped" : "No random index markets found",
        );
      } catch (error: any) {
        setStatusText(error?.message || "Unable to initialize Dual Edge");
      }
    };

    useEffect(() => {
      void initializeApi();

      return () => {
        if (message_handler_ref.current && apiRef.current?.connection) {
          apiRef.current.connection.removeEventListener(
            "message",
            message_handler_ref.current,
          );
        }
        void stopScanning();
        void forgetSubscription(current_contract_subscription_id_ref.current);
        if (!is_shared_api_ref.current) {
          apiRef.current?.disconnect?.();
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onStartBot = async () => {
      if (!markets_ready || !available_symbols.length) {
        setStatusText("Markets are not ready yet");
        return;
      }

      reset_runtime();
      running_ref.current = true;
      setIsRunning(true);
      run_panel?.toggleDrawer(true);
      run_panel?.setActiveTabIndex(1);
      if (run_panel) {
        run_panel.run_id = `dual-edge-${strategy}-${Date.now()}`;
        run_panel.setIsRunning(true);
        run_panel.setContractStage(contract_stages.STARTING);
      }

      try {
        await startScanning();
      } catch (error: any) {
        await finalizeStop(error?.message || "Unable to start Dual Edge");
      }
    };

    const onStopBot = async () => {
      running_ref.current = false;
      setIsRunning(false);

      if (current_contract_id_ref.current) {
        stop_after_contract_ref.current = true;
        setStatusText("Stopping after active trade...");
        return;
      }

      await finalizeStop("Stopped");
    };

    return (
      <div className="dual-edge-panel">
        <div className="dual-edge-panel__top-strip">
          <div className="dual-edge-panel__badge">{preset.hero_badge}</div>
        </div>

        <div className="dual-edge-panel__hero">
          <div>
            <h1 className="dual-edge-panel__title">{preset.heading}</h1>
            <p className="dual-edge-panel__subtitle">{preset.subtitle}</p>
          </div>

          <div className="dual-edge-panel__status-group">
            <span className="dual-edge-panel__pill dual-edge-panel__pill--danger">
              {is_running ? "Running" : "Stopped"}
            </span>
            <span className="dual-edge-panel__pill dual-edge-panel__pill--success">
              {is_api_connected ? "API Connected" : "API Offline"}
            </span>
            <span className="dual-edge-panel__pill dual-edge-panel__pill--success">
              {markets_ready ? "Markets Ready" : "Loading Markets"}
            </span>
          </div>
        </div>

        <div className="dual-edge-panel__cards">
          {metric_cards.map((card) => (
            <div
              key={card.label}
              className={`dual-edge-panel__metric dual-edge-panel__metric--${card.type}`}
            >
              <span className="dual-edge-panel__metric-label">
                {card.label}
              </span>
              <strong className="dual-edge-panel__metric-value">
                {card.value}
              </strong>
            </div>
          ))}
        </div>

        <div className="dual-edge-panel__grid">
          <div className="dual-edge-panel__field">
            <label>Initial Trade Type</label>
            {strategy === "ultimate_2026" ? (
              <select
                value={initial_trade_key}
                onChange={(e) =>
                  setInitialTradeKey(
                    e.target.value as TInitialTradeOption["key"],
                  )
                }
              >
                {INITIAL_TRADE_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="dual-edge-panel__field-value">
                {preset.strategy_label}
              </div>
            )}
          </div>
          <div className="dual-edge-panel__field">
            <label>Recovery Type</label>
            {strategy === "ultimate_2026" ? (
              <select
                value={recovery_key}
                onChange={(e) =>
                  setRecoveryKey(e.target.value as TRecoveryOption["key"])
                }
              >
                {RECOVERY_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="dual-edge-panel__field-value">
                {preset.recovery_label}
              </div>
            )}
          </div>
        </div>

        <div className="dual-edge-panel__grid dual-edge-panel__grid--controls">
          <div className="dual-edge-panel__field">
            <label>Stake</label>
            <input
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              type="number"
              step="0.01"
              min="0.35"
            />
          </div>
          <div className="dual-edge-panel__field">
            <label>TP</label>
            <input
              value={take_profit}
              onChange={(e) => setTakeProfit(e.target.value)}
              type="number"
              step="0.01"
              min="0"
            />
          </div>
          <div className="dual-edge-panel__field">
            <label>SL</label>
            <input
              value={stop_loss}
              onChange={(e) => setStopLoss(e.target.value)}
              type="number"
              step="0.01"
              min="0"
            />
          </div>
          <div className="dual-edge-panel__field">
            <label>Martingale</label>
            <input
              value={martingale}
              onChange={(e) => setMartingale(e.target.value)}
              type="number"
              step="0.1"
              min="1"
            />
          </div>
        </div>

        <div className="dual-edge-panel__actions">
          <button
            className={`dual-edge-panel__start ${is_running ? "dual-edge-panel__start--stop" : ""}`}
            onClick={is_running ? onStopBot : onStartBot}
            disabled={!markets_ready}
          >
            {is_running ? "Stop Bot" : "Start Bot"}
          </button>
        </div>

        <div className="dual-edge-panel__runtime">
          <div className="dual-edge-panel__runtime-item">
            <span>Status</span>
            <strong>{status_text}</strong>
          </div>
          <div className="dual-edge-panel__runtime-item">
            <span>Active Market</span>
            <strong>{selected_market}</strong>
          </div>
          <div className="dual-edge-panel__runtime-item">
            <span>Signal</span>
            <strong>{signal_text}</strong>
          </div>
          <div className="dual-edge-panel__runtime-item">
            <span>Current Stake</span>
            <strong>
              {current_stake} {account_currency}
            </strong>
          </div>
          <div className="dual-edge-panel__runtime-item">
            <span>P/L</span>
            <strong>{profit_total.toFixed(2)}</strong>
          </div>
          <div className="dual-edge-panel__runtime-item">
            <span>Markets</span>
            <strong>{available_symbols.length}</strong>
          </div>
        </div>

        <div className="dual-edge-panel__how-it-works">
          <h3>{localize("How it works")}</h3>
          <ul>
            {preset.how_it_works.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
);

export default DualEdgeBotPanel;
