import React from "react";
import { observer } from "mobx-react-lite";
import Button from "@/components/shared_ui/button";
import Modal from "@/components/shared_ui/modal";
import { DBOT_TABS } from "@/constants/bot-contents";
import { api_base } from "@/external/bot-skeleton";
import { useStore } from "@/hooks/useStore";
import { localize } from "@deriv-com/translations";
import "./ai-scanner.scss";

type TContractType = "DIGITOVER" | "DIGITUNDER";

type TMarketTarget = {
  label: string;
  symbol: string;
};

type TScanResult = {
  contract_label: "Over" | "Under";
  contract_type: TContractType;
  current_streak: number;
  entry_prediction: number;
  entry_step: number;
  label: string;
  prediction_path: string;
  quality: number;
  recovery_prediction: number;
  score: number;
  summary: string;
  symbol: string;
};

type TScannerParameters = {
  martingale: number;
  stake: number;
  stop_loss: number;
  take_profit: number;
  use_martingale: boolean;
};

const SCAN_MARKETS: TMarketTarget[] = [
  { label: "Volatility 10 Index", symbol: "R_10" },
  { label: "Volatility 25 Index", symbol: "R_25" },
  { label: "Volatility 50 Index", symbol: "R_50" },
  { label: "Volatility 75 Index", symbol: "R_75" },
  { label: "Volatility 100 Index", symbol: "R_100" },
  { label: "Volatility 10 (1s) Index", symbol: "1HZ10V" },
  { label: "Volatility 15 (1s) Index", symbol: "1HZ15V" },
  { label: "Volatility 25 (1s) Index", symbol: "1HZ25V" },
  { label: "Volatility 30 (1s) Index", symbol: "1HZ30V" },
  { label: "Volatility 50 (1s) Index", symbol: "1HZ50V" },
  { label: "Volatility 75 (1s) Index", symbol: "1HZ75V" },
  { label: "Volatility 90 (1s) Index", symbol: "1HZ90V" },
  { label: "Volatility 100 (1s) Index", symbol: "1HZ100V" },
];

const AI_SCANNER_TEMPLATE = () =>
  import(/* webpackChunkName: "ai-scanner-template" */ "@/xml/ai_scanner.xml");

const DEFAULT_PARAMETERS: TScannerParameters = {
  martingale: 2,
  stake: 0.5,
  stop_loss: 50,
  take_profit: 25,
  use_martingale: true,
};

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const normalizeNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureScannerConnection = async () => {
  if (!api_base.api || api_base.api?.connection?.readyState !== 1) {
    await api_base.init(true);
  }

  if (!api_base.api) {
    throw new Error(
      localize("Scanner is not connected yet. Please try again."),
    );
  }

  return api_base.api;
};

const fetchTicks = async (symbol: string, count: number) => {
  const api = await ensureScannerConnection();
  const response = await api.send({
    adjust_start_time: 1,
    count,
    end: "latest",
    style: "ticks",
    ticks_history: symbol,
  });

  if (response?.error) {
    throw new Error(
      response.error.message ||
        localize("Failed to scan {{symbol}}.", { symbol }),
    );
  }

  const prices = (response?.history?.prices || []).filter(
    (price: string | number) =>
      typeof price === "string" || typeof price === "number",
  ) as Array<string | number>;

  if (prices.length < 100) {
    throw new Error(
      localize("Not enough tick history returned for {{symbol}}.", { symbol }),
    );
  }

  return prices;
};

const getLastDigit = (price: string | number) => {
  const normalized = String(price).replace(/\D/g, "");
  if (!normalized) return 0;

  return Number(normalized[normalized.length - 1]);
};

const getHitRate = (digits: number[], predicate: (digit: number) => boolean) =>
  digits.filter(predicate).length / Math.max(1, digits.length);

const getRecentHitRate = (
  digits: number[],
  windowSize: number,
  predicate: (digit: number) => boolean,
) => getHitRate(digits.slice(-windowSize), predicate);

const getCurrentStreak = (
  digits: number[],
  predicate: (digit: number) => boolean,
) => {
  let streak = 0;
  for (let index = digits.length - 1; index >= 0; index--) {
    if (!predicate(digits[index])) break;
    streak += 1;
  }

  return streak;
};

const getLongestStreak = (
  digits: number[],
  predicate: (digit: number) => boolean,
) => {
  let longest = 0;
  let current = 0;

  digits.forEach((digit) => {
    if (predicate(digit)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });

  return longest;
};

const evaluateCandidate = (
  digits: number[],
  contract_type: TContractType,
  entry_prediction: number,
  recovery_prediction: number,
) => {
  const is_over = contract_type === "DIGITOVER";
  const predicate = (prediction: number) => (digit: number) =>
    is_over ? digit > prediction : digit < prediction;
  const base_predicate = predicate(entry_prediction);
  const recovery_predicate = predicate(recovery_prediction);
  const base_rate = getHitRate(digits, base_predicate);
  const recovery_rate = getHitRate(digits, recovery_predicate);
  const recent_base_rate = getRecentHitRate(digits, 50, base_predicate);
  const recent_recovery_rate = getRecentHitRate(digits, 25, recovery_predicate);
  const current_streak = getCurrentStreak(digits, base_predicate);
  const longest_streak = getLongestStreak(digits.slice(-80), base_predicate);
  const base_balance = clamp(1 - Math.abs(base_rate - 0.8) / 0.8);
  const recovery_balance = clamp(1 - Math.abs(recovery_rate - 0.5) / 0.5);
  const separation_score = clamp(
    (Math.abs(recovery_prediction - entry_prediction) - 1) / 5,
  );
  const streak_score = clamp((current_streak + longest_streak) / 18);
  const score = clamp(
    base_balance * 0.32 +
      recovery_balance * 0.24 +
      recent_base_rate * 0.18 +
      recent_recovery_rate * 0.12 +
      separation_score * 0.06 +
      streak_score * 0.08,
  );

  return {
    base_rate,
    current_streak,
    quality: Number((60 + score * 39.5).toFixed(2)),
    recovery_rate,
    score,
  };
};

const analyseTicks = (
  market: TMarketTarget,
  prices: Array<string | number>,
): TScanResult => {
  const digits = prices
    .map(getLastDigit)
    .filter((digit) => Number.isInteger(digit) && digit >= 0 && digit <= 9);
  let best_candidate:
    | (ReturnType<typeof evaluateCandidate> & {
        contract_label: "Over" | "Under";
        contract_type: TContractType;
        entry_prediction: number;
        recovery_prediction: number;
      })
    | null = null;

  for (let entry_prediction = 1; entry_prediction <= 4; entry_prediction += 1) {
    for (
      let recovery_prediction = Math.max(4, entry_prediction + 2);
      recovery_prediction <= 7;
      recovery_prediction += 1
    ) {
      const candidate = evaluateCandidate(
        digits,
        "DIGITOVER",
        entry_prediction,
        recovery_prediction,
      );
      if (!best_candidate || candidate.score > best_candidate.score) {
        best_candidate = {
          ...candidate,
          contract_label: "Over",
          contract_type: "DIGITOVER",
          entry_prediction,
          recovery_prediction,
        };
      }
    }
  }

  for (let entry_prediction = 6; entry_prediction <= 8; entry_prediction += 1) {
    for (
      let recovery_prediction = 3;
      recovery_prediction <= entry_prediction - 2;
      recovery_prediction += 1
    ) {
      const candidate = evaluateCandidate(
        digits,
        "DIGITUNDER",
        entry_prediction,
        recovery_prediction,
      );
      if (!best_candidate || candidate.score > best_candidate.score) {
        best_candidate = {
          ...candidate,
          contract_label: "Under",
          contract_type: "DIGITUNDER",
          entry_prediction,
          recovery_prediction,
        };
      }
    }
  }

  if (!best_candidate) {
    throw new Error(
      localize(
        "Scanner could not determine a valid Over/Under setup for {{market}}.",
        { market: market.label },
      ),
    );
  }

  const entry_step = best_candidate.score >= 0.82 ? 1 : 2;
  const trade_label = `${best_candidate.contract_label} ${best_candidate.entry_prediction}`;
  const recovery_label = `${best_candidate.contract_label} ${best_candidate.recovery_prediction}`;

  return {
    contract_label: best_candidate.contract_label,
    contract_type: best_candidate.contract_type,
    current_streak: best_candidate.current_streak,
    entry_prediction: best_candidate.entry_prediction,
    entry_step,
    label: market.label,
    prediction_path: `${best_candidate.entry_prediction} | recovery ${best_candidate.recovery_prediction}`,
    quality: best_candidate.quality,
    recovery_prediction: best_candidate.recovery_prediction,
    score: best_candidate.score,
    summary: `${trade_label} Recovery ${recovery_label} | Entry ${entry_step}`,
    symbol: market.symbol,
  };
};

const modifyValueInputs = (
  strategy_dom: XMLDocument,
  key: string,
  value: number | boolean,
) => {
  const elements = strategy_dom?.querySelectorAll(
    `value[strategy_value="${key}"]`,
  );
  elements?.forEach((element) => {
    const target = element as HTMLElement;
    if (typeof value === "boolean") {
      target.innerHTML = `<block type="logic_boolean"><field name="BOOL">${value ? "TRUE" : "FALSE"}</field></block>`;
    } else {
      target.innerHTML = `<shadow type="math_number"><field name="NUM">${value}</field></shadow>`;
    }
  });
};

const modifyFieldDropdownValues = (
  strategy_dom: XMLDocument,
  name: string,
  value: string,
) => {
  const name_list = `${name.toUpperCase()}_LIST`;
  const elements = strategy_dom?.querySelectorAll(`field[name="${name_list}"]`);
  elements?.forEach((element) => {
    (element as HTMLElement).innerHTML = value;
  });
};

const buildScannerXml = async (
  result: TScanResult,
  parameters: TScannerParameters,
) => {
  const template_module = await AI_SCANNER_TEMPLATE();
  const strategy_dom = window.Blockly.utils.xml.textToDom(
    template_module.default,
  );

  const numeric_values: Record<string, number | boolean> = {
    duration: 1,
    entry_prediction: result.entry_prediction,
    martingale: parameters.martingale,
    recovery_prediction: result.recovery_prediction,
    stake: parameters.stake,
    stop_loss: parameters.stop_loss,
    take_profit: parameters.take_profit,
    use_martingale: parameters.use_martingale,
  };

  Object.entries(numeric_values).forEach(([key, value]) => {
    modifyValueInputs(strategy_dom, key, value);
  });

  const dropdown_values = {
    market: "synthetic_index",
    purchase: result.contract_type,
    submarket: "random_index",
    symbol: result.symbol,
    tradetype: "overunder",
    tradetypecat: "digits",
    type: "both",
  };

  Object.entries(dropdown_values).forEach(([key, value]) => {
    modifyFieldDropdownValues(strategy_dom, key, value);
  });

  return window.Blockly.Xml.domToText(strategy_dom);
};

const getBestMarketLine = (result: TScanResult) =>
  `Best market: ${result.label} (${result.symbol}) | ${result.contract_label} ${result.entry_prediction} Recovery ${result.contract_label} ${result.recovery_prediction} | Entry ${result.entry_step} | Quality ${result.quality}%`;

const AiScanner = observer(() => {
  const { dashboard } = useStore();
  const { setActiveTab, setPendingFreeBot } = dashboard;
  const [is_scanner_open, setIsScannerOpen] = React.useState(false);
  const [is_parameters_open, setIsParametersOpen] = React.useState(false);
  const [is_scanning, setIsScanning] = React.useState(false);
  const [is_loading_bot, setIsLoadingBot] = React.useState(false);
  const [tick_count, setTickCount] = React.useState("500");
  const [scan_error, setScanError] = React.useState("");
  const [scan_progress, setScanProgress] = React.useState(0);
  const [active_market_label, setActiveMarketLabel] = React.useState(
    localize("Ready for deep scan"),
  );
  const [results, setResults] = React.useState<TScanResult[]>([]);
  const [selected_result, setSelectedResult] =
    React.useState<TScanResult | null>(null);
  const [parameters, setParameters] =
    React.useState<TScannerParameters>(DEFAULT_PARAMETERS);

  const toggleScanner = () => {
    if (!is_scanning) {
      setIsScannerOpen((prev) => !prev);
      setScanError("");
    }
  };

  const updateParameter = (
    key: keyof TScannerParameters,
    value: number | boolean,
  ) => {
    setParameters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleScan = async () => {
    const requested_ticks = Math.max(
      100,
      Math.min(5000, Math.round(normalizeNumber(tick_count, 500))),
    );

    setIsScanning(true);
    setScanError("");
    setResults([]);
    setSelectedResult(null);
    setScanProgress(0);
    setActiveMarketLabel(localize("Starting deep scan..."));

    try {
      const scanned_results: TScanResult[] = [];

      for (let index = 0; index < SCAN_MARKETS.length; index++) {
        const market = SCAN_MARKETS[index];
        setActiveMarketLabel(
          localize("Scanning {{market}}...", { market: market.label }),
        );
        const prices = await fetchTicks(market.symbol, requested_ticks);
        const result = analyseTicks(market, prices);
        scanned_results.push(result);
        setResults(
          [...scanned_results].sort((left, right) => right.score - left.score),
        );
        setScanProgress(index + 1);
      }

      const best_result = [...scanned_results].sort(
        (left, right) => right.score - left.score,
      )[0];
      setSelectedResult(best_result);
      setActiveMarketLabel(getBestMarketLine(best_result));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : localize("Scanner failed. Please try again.");
      setScanError(message);
      setActiveMarketLabel(localize("Deep scan failed"));
    } finally {
      setIsScanning(false);
    }
  };

  const handleLoadToBuilder = async () => {
    if (!selected_result || is_loading_bot) return;

    setIsLoadingBot(true);
    setScanError("");

    try {
      const xml = await buildScannerXml(selected_result, parameters);
      const label = `Deep Scanner - ${selected_result.symbol} ${selected_result.contract_label} ${selected_result.entry_prediction}`;

      setPendingFreeBot({
        name: label,
        xml,
      });

      setActiveTab(DBOT_TABS.BOT_BUILDER);
      setIsParametersOpen(false);
      setIsScannerOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : localize("Failed to load the scanner bot into Builder.");
      setScanError(message);
    } finally {
      setIsLoadingBot(false);
    }
  };

  return (
    <>
      <button className="ai-scanner-fab" onClick={toggleScanner} type="button">
        <span className="ai-scanner-fab__glow" />
        <span className="ai-scanner-fab__label">AI</span>
      </button>

      <Modal
        className="ai-scanner-modal"
        is_open={is_scanner_open && !is_parameters_open}
        toggleModal={toggleScanner}
        title={localize("Entry Scanner")}
        width="56rem"
      >
        <Modal.Body>
          <div className="ai-scanner-modal__content">
            <p className="ai-scanner-modal__intro">
              {localize(
                "Deep scanner evaluates all synthetic_index / random_index markets, then updates AI SIGNAL SCANNER with the best Over/Under entry.",
              )}
            </p>

            <div className="ai-scanner-modal__grid">
              <div className="ai-scanner-modal__field">
                <label>{localize("Selected market")}</label>
                <div className="ai-scanner-modal__value">
                  {selected_result
                    ? `${selected_result.label} (${selected_result.symbol})`
                    : localize("Scan for best market")}
                </div>
              </div>
              <div className="ai-scanner-modal__field">
                <label>{localize("Trade type")}</label>
                <div className="ai-scanner-modal__value">
                  {selected_result
                    ? `${selected_result.contract_label} ${selected_result.entry_prediction} Recovery ${selected_result.contract_label} ${selected_result.recovery_prediction}`
                    : localize("Waiting for scan")}
                </div>
              </div>
              <div className="ai-scanner-modal__field">
                <label>{localize("Ticks number (100-5000)")}</label>
                <input
                  className="ai-scanner-modal__input"
                  disabled={is_scanning}
                  onChange={(event) => setTickCount(event.target.value)}
                  type="number"
                  value={tick_count}
                />
              </div>
              <div className="ai-scanner-modal__field">
                <label>{localize("Prediction (auto)")}</label>
                <div className="ai-scanner-modal__value">
                  {selected_result?.prediction_path || "--"}
                </div>
              </div>
            </div>

            <div className="ai-scanner-modal__progress-card">
              <div className="ai-scanner-modal__progress-header">
                <span>{active_market_label}</span>
                <strong>
                  {scan_progress}/{SCAN_MARKETS.length}
                </strong>
              </div>
              <div className="ai-scanner-modal__progress-track">
                <div
                  className="ai-scanner-modal__progress-bar"
                  style={{
                    width: `${(scan_progress / SCAN_MARKETS.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            {selected_result && (
              <div className="ai-scanner-modal__headline">
                {localize("Bot started: {{summary}}", {
                  summary: `${selected_result.label} | ${selected_result.contract_label} ${selected_result.entry_prediction} Recovery ${selected_result.contract_label} ${selected_result.recovery_prediction} | Entry ${selected_result.entry_step}`,
                })}
              </div>
            )}

            <div className="ai-scanner-modal__results">
              {results.length ? (
                results.map((result) => (
                  <button
                    className={`ai-scanner-modal__result ${
                      selected_result?.symbol === result.symbol
                        ? "ai-scanner-modal__result--active"
                        : ""
                    }`}
                    key={result.symbol}
                    onClick={() => setSelectedResult(result)}
                    type="button"
                  >
                    <div>
                      <strong>{result.label}</strong>
                      <p>{result.summary}</p>
                    </div>
                    <div className="ai-scanner-modal__metrics">
                      <span>{result.current_streak}/10</span>
                      <span>{result.quality}%</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="ai-scanner-modal__empty">
                  {localize(
                    "Run the deep scanner to rank all configured synthetic markets.",
                  )}
                </div>
              )}
            </div>

            {scan_error && (
              <div className="ai-scanner-modal__error">{scan_error}</div>
            )}

            <div className="ai-scanner-modal__actions">
              <Button
                className="ai-scanner-modal__primary"
                is_disabled={is_scanning}
                onClick={handleScan}
                primary
              >
                {is_scanning
                  ? localize("Scanning best market...")
                  : localize("Deep Scan for Best Market")}
              </Button>
              <Button
                className="ai-scanner-modal__secondary"
                is_disabled={!selected_result || is_scanning}
                onClick={() => setIsParametersOpen(true)}
                secondary
              >
                {localize("Load Deep Scanner Bot")}
              </Button>
            </div>
          </div>
        </Modal.Body>
      </Modal>

      <Modal
        className="ai-scanner-params"
        is_open={is_parameters_open}
        toggleModal={() => setIsParametersOpen(false)}
        title={localize("Scanner Parameters")}
        width="46rem"
      >
        <Modal.Body>
          <div className="ai-scanner-params__content">
            <div className="ai-scanner-params__grid">
              <div className="ai-scanner-params__field">
                <label>{localize("Stake")}</label>
                <input
                  className="ai-scanner-params__input"
                  min="0.35"
                  onChange={(event) =>
                    updateParameter(
                      "stake",
                      normalizeNumber(event.target.value, 0.5),
                    )
                  }
                  step="0.01"
                  type="number"
                  value={parameters.stake}
                />
              </div>
              <div className="ai-scanner-params__field">
                <label>{localize("Martingale")}</label>
                <input
                  className="ai-scanner-params__input"
                  disabled={!parameters.use_martingale}
                  min="1"
                  onChange={(event) =>
                    updateParameter(
                      "martingale",
                      normalizeNumber(event.target.value, 2),
                    )
                  }
                  step="0.1"
                  type="number"
                  value={parameters.martingale}
                />
              </div>
              <div className="ai-scanner-params__field">
                <label>{localize("Take profit")}</label>
                <input
                  className="ai-scanner-params__input"
                  min="1"
                  onChange={(event) =>
                    updateParameter(
                      "take_profit",
                      normalizeNumber(event.target.value, 25),
                    )
                  }
                  step="1"
                  type="number"
                  value={parameters.take_profit}
                />
              </div>
              <div className="ai-scanner-params__field">
                <label>{localize("Stop loss")}</label>
                <input
                  className="ai-scanner-params__input"
                  min="1"
                  onChange={(event) =>
                    updateParameter(
                      "stop_loss",
                      normalizeNumber(event.target.value, 50),
                    )
                  }
                  step="1"
                  type="number"
                  value={parameters.stop_loss}
                />
              </div>
            </div>

            <label className="ai-scanner-params__toggle">
              <span>{localize("Use martingale")}</span>
              <input
                checked={parameters.use_martingale}
                onChange={(event) =>
                  updateParameter("use_martingale", event.target.checked)
                }
                type="checkbox"
              />
              <span className="ai-scanner-params__switch" />
            </label>

            <div className="ai-scanner-params__footer">
              <Button onClick={() => setIsParametersOpen(false)} secondary>
                {localize("Cancel")}
              </Button>
              <Button
                is_disabled={is_loading_bot}
                onClick={handleLoadToBuilder}
                primary
              >
                {is_loading_bot
                  ? localize("Loading bot...")
                  : localize("Load Deep Scanner Bot")}
              </Button>
            </div>
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
});

export default AiScanner;
