type TTabsTitle = {
  [key: string]: string | number;
};

type TDashboardTabIndex = {
  [key: string]: number;
};

export const tabs_title: TTabsTitle = Object.freeze({
  WORKSPACE: "Workspace",
  CHART: "Chart",
});

export const DBOT_TABS: TDashboardTabIndex = Object.freeze({
  DASHBOARD: 0,
  BOT_BUILDER: 1,
  CHART: 2,
  TRADING_BOTS: 3,
  DUAL_EDGE: 4,
  GLEAN_VOLATILITIES: 5,
  FLIGHT_MODE: 6,
  HYBRID_BOTS: 7,
  SPEEDBOT: 8,
  ANALYSIS_TOOL: 9,
  COPY_TRADING: 10,
  DTRADER: 11,
  TRADINGVIEW: 12,
  // Keep TUTORIAL as a non-active sentinel to avoid index mismatches in legacy checks
  TUTORIAL: 999,
  // Legacy tabs - kept for backward compatibility but redirect to TRADING_BOTS
  FREE_BOTS: 3,
  MATCHES: 7,
  HYPERBOT: 7,
  DIFFBOT: 7,
  DCIRCLES: 9,
  DP_TOOLS: 9,
});

export const MAX_STRATEGIES = 10;

export const TAB_IDS = [
  "id-dbot-dashboard",
  "id-bot-builder",
  "id-charts",
  "id-trading-bots",
  "id-dual-edge",
  "id-glean-volatilities",
  "id-flight-mode",
  "id-hybrid-bots",
  "id-speedbot",
  "id-analysis-tool",
  "id-copy-trading",
  "id-dtrader",
  "id-tradingview",
];

export const DEBOUNCE_INTERVAL_TIME = 500;
