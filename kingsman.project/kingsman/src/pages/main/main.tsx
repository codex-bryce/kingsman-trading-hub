import React, { lazy, Suspense, useEffect } from "react";
import classNames from "classnames";
import { observer } from "mobx-react-lite";
import { useLocation, useNavigate } from "react-router-dom";
import ChunkLoader from "@/components/loader/chunk-loader";
import Dialog from "@/components/shared_ui/dialog";
import Tabs from "@/components/shared_ui/tabs/tabs";
import TradingViewModal from "@/components/trading-view-chart/trading-view-modal";
import { DBOT_TABS, TAB_IDS } from "@/constants/bot-contents";
import { api_base, updateWorkspaceName } from "@/external/bot-skeleton";
import { CONNECTION_STATUS } from "@/external/bot-skeleton/services/api/observables/connection-status-stream";
import { isDbotRTL } from "@/external/bot-skeleton/utils/workspace";
import { useOauth2 } from "@/hooks/auth/useOauth2";
import { useApiBase } from "@/hooks/useApiBase";
import { useStore } from "@/hooks/useStore";
import useTMB from "@/hooks/useTMB";
import {
  LabelPairedCircleInfoCaptionBoldIcon,
  LabelPairedChartLineCaptionRegularIcon,
  LabelPairedObjectsColumnCaptionRegularIcon,
  LabelPairedPuzzlePieceTwoCaptionBoldIcon,
  LegacyTimeIcon,
} from "@deriv/quill-icons";
import {
  LegacyChartsIcon,
  LegacyGuide1pxIcon,
  LegacyHomeOldIcon,
  LegacyIndicatorsIcon,
  LegacyReportsIcon,
} from "@deriv/quill-icons/Legacy";
import { StandaloneCircleUserRegularIcon } from "@deriv/quill-icons/Standalone";
import { Localize, localize } from "@deriv-com/translations";
import { useDevice } from "@deriv-com/ui";
import RunPanel from "../../components/run-panel";
import SpeedBotFloatingStop from "../../components/speedbot-floating-stop";
import ChartModal from "../chart/chart-modal";
import Dashboard from "../dashboard";
import RunStrategy from "../dashboard/run-strategy";
import SignupModal, { captureAffiliateParams } from "@/components/signup-modal";
import { parseSignalParams, ParsedSignal } from "@/utils/signal-bot-xml";
import SignalModal from "@/components/signal-modal/SignalModal";
import SessionResultModal from "@/components/session-result-modal/SessionResultModal";
import "./main.scss";

const ChartWrapper = lazy(() => import("../chart/chart-wrapper"));

const TradingView = lazy(() => import("../tradingview"));
// Analysis tool entry now lives at src/pages/analysis-tool/analysis-tool.tsx
const AnalysisTools = lazy(() => import("../analysis-tool"));
const CopyTrading = lazy(() => import("../copy-trading"));
const ProTool = lazy(() => import("../pro-tool"));
const Dtrader = lazy(() => import("../dtrader"));
const SpeedBot = lazy(() => import("../speedbot"));
const DualEdge = lazy(() => import("../dual-edge"));
const HybridBots = lazy(() => import("../hybrid-bots"));
// Import TradingBots directly instead of lazy loading for faster access
import TradingBots from "../free-bots/trading-bots";

const AppWrapper = observer(() => {
  const { connectionStatus } = useApiBase();
  const {
    dashboard,
    load_modal,
    run_panel,
    quick_strategy,
    summary_card,
    blockly_store,
  } = useStore();
  const {
    active_tab,
    active_tour,
    is_chart_modal_visible,
    is_trading_view_modal_visible,
    setActiveTab,
    setWebSocketState,
    setActiveTour,
    setTourDialogVisibility,
  } = dashboard;
  const { dashboard_strategies } = load_modal;
  const {
    is_dialog_open,
    is_drawer_open,
    dialog_options,
    onCancelButtonClick,
    onCloseDialog,
    onOkButtonClick,
    stopBot,
  } = run_panel;
  const { is_open } = quick_strategy;
  const {
    cancel_button_text,
    ok_button_text,
    title,
    message,
    dismissable,
    is_closed_on_cancel,
  } = dialog_options as {
    [key: string]: string;
  };
  const { clear } = summary_card;
  const {
    DASHBOARD,
    BOT_BUILDER,
    CHART,
    TRADING_BOTS,
    SPEEDBOT,
    DUAL_EDGE,
    DTRADER,
  } = DBOT_TABS;
  const [signalModal, setSignalModal] = React.useState<ParsedSignal | null>(
    null,
  );
  const [sessionAlert, setSessionAlert] = React.useState<string | null>(null);
  const init_render = React.useRef(true);
  const hash = [
    "dashboard",
    "bot_builder",
    "chart",
    "trading_bots",
    "dual_edge",
    "glean_volatilities",
    "flight_mode",
    "hybrid_bots",
    "speedbot",
    "analysis_tool",
    "copy_trading",
    "dtrader",
    "tradingview",
  ];
  const show_run_panel_shell =
    [DASHBOARD, BOT_BUILDER, CHART, TRADING_BOTS, SPEEDBOT, DUAL_EDGE].includes(
      active_tab,
    ) || Boolean(active_tour);
  const { isDesktop } = useDevice();
  const location = useLocation();
  const navigate = useNavigate();
  // Removed tab shadow states to fix mobile edge fading issue

  let tab_value: number | string = active_tab;
  const GetHashedValue = (tab: number) => {
    tab_value = location.hash?.split("#")[1];
    if (!tab_value) return tab;
    return Number(hash.indexOf(String(tab_value)));
  };
  const active_hash_tab = GetHashedValue(active_tab);

  const { onRenderTMBCheck, isTmbEnabled } = useTMB();

  // Removed intersection observer for tab shadows to fix mobile edge fading

  React.useEffect(() => {
    if (connectionStatus !== CONNECTION_STATUS.OPENED) {
      if (api_base.suppress_disconnect_modal) {
        return;
      }
      const is_bot_running =
        document.getElementById("db-animation__stop-button") !== null;
      if (is_bot_running) {
        clear();
        stopBot();
        api_base.setIsRunning(false);
        setWebSocketState(false);
      }
    }
  }, [clear, connectionStatus, setWebSocketState, stopBot]);

  // Removed updateTabShadowsHeight function to fix mobile edge fading

  React.useEffect(() => {
    // Removed updateTabShadowsHeight call to fix mobile edge fading

    if (is_open) {
      setTourDialogVisibility(false);
    }

    if (init_render.current) {
      // On page refresh, default to BOT_BUILDER tab if no hash is present
      const tabToSet = location.hash
        ? Number(active_hash_tab)
        : DBOT_TABS.BOT_BUILDER;
      setActiveTab(tabToSet);
      if (!isDesktop) handleTabChange(tabToSet);
      // Navigate to the correct hash if not already set
      if (!location.hash) {
        navigate(`#${hash[tabToSet] || hash[DBOT_TABS.BOT_BUILDER]}`);
      }
      init_render.current = false;
    } else {
      navigate(`#${hash[active_tab] || hash[DBOT_TABS.BOT_BUILDER]}`);
    }
    if (active_tour !== "") {
      setActiveTour("");
    }

    // Prevent scrolling when tutorial tab is active (only on mobile)
    const mainElement = document.querySelector(".main__container");
    if (active_tab === DBOT_TABS.TUTORIAL && !isDesktop) {
      document.body.style.overflow = "hidden";
      if (mainElement instanceof HTMLElement) {
        mainElement.classList.add("no-scroll");
      }
    } else {
      document.body.style.overflow = "";
      if (mainElement instanceof HTMLElement) {
        mainElement.classList.remove("no-scroll");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active_tab]);

  React.useEffect(() => {
    const trashcan_init_id = setTimeout(() => {
      if (active_tab === BOT_BUILDER && Blockly?.derivWorkspace?.trashcan) {
        const trashcanY = window.innerHeight - 250;
        let trashcanX;
        if (is_drawer_open) {
          trashcanX = isDbotRTL() ? 380 : window.innerWidth - 460;
        } else {
          trashcanX = isDbotRTL() ? 20 : window.innerWidth - 100;
        }
        Blockly?.derivWorkspace?.trashcan?.setTrashcanPosition(
          trashcanX,
          trashcanY,
        );
      }
    }, 100);

    return () => {
      clearTimeout(trashcan_init_id); // Clear the timeout on unmount
    };
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active_tab, is_drawer_open]);

  React.useEffect(() => {
    if (active_tab !== BOT_BUILDER || !isDesktop) return;

    const resize_id = window.setTimeout(() => {
      blockly_store.setContainerSize();
    }, 50);

    return () => {
      window.clearTimeout(resize_id);
    };
  }, [active_tab, isDesktop, blockly_store]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (dashboard_strategies.length > 0) {
      // Needed to pass this to the Callback Queue as on tab changes
      // document title getting override by 'Bot | Deriv' only
      timer = setTimeout(() => {
        updateWorkspaceName();
      });
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [dashboard_strategies, active_tab]);

  const handleTabChange = React.useCallback(
    (tab_index: number) => {
      if (tab_index === DBOT_TABS.GLEAN_VOLATILITIES) {
        window.open(
          "https://www.gleanvolatilities.com/",
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      if (tab_index === DBOT_TABS.FLIGHT_MODE) {
        window.open(
          "https://derivaviator.vercel.app/",
          "_blank",
          "noopener,noreferrer",
        );
        return;
      }
      setActiveTab(tab_index);
      const el_id = TAB_IDS[tab_index];
      if (el_id) {
        const el_tab = document.getElementById(el_id);
        setTimeout(() => {
          el_tab?.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
          });
        }, 10);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active_tab],
  );

  // Override window.alert so the bot's text_print block shows our styled modal instead of the browser alert
  React.useEffect(() => {
    const original = window.alert;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).alert = (msg: string) => setSessionAlert(String(msg ?? ""));
    return () => {
      window.alert = original;
    };
  }, []);

  // Capture signal params immediately on load and persist to sessionStorage so they survive OAuth redirects
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const parsed = parseSignalParams(params);
    if (!parsed) return;
    sessionStorage.setItem("pending_signal", JSON.stringify(parsed));
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.hash,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the signal modal once the WebSocket is open (works for already-logged-in AND after OAuth login redirect)
  React.useEffect(() => {
    if (connectionStatus !== CONNECTION_STATUS.OPENED) return;
    const raw = sessionStorage.getItem("pending_signal");
    if (!raw) return;
    sessionStorage.removeItem("pending_signal");
    try {
      const parsed = JSON.parse(raw) as ParsedSignal;
      setSignalModal(parsed);
      setActiveTab(DBOT_TABS.BOT_BUILDER);
    } catch {
      /* malformed data */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  const { retriggerOAuth2Login } = useOauth2();
  const handleLoginGeneration = async () => {
    const getQueryParams = new URLSearchParams(window.location.search);
    const currency = getQueryParams.get("account") ?? "";
    const query_param_currency =
      currency || sessionStorage.getItem("query_param_currency") || "USD";

    try {
      const tmbEnabled = await isTmbEnabled();
      if (tmbEnabled) {
        await onRenderTMBCheck();
      } else {
        if (query_param_currency) {
          sessionStorage.setItem("query_param_currency", query_param_currency);
        }
        await retriggerOAuth2Login();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
    }
  };
  return (
    <React.Fragment>
      <div className="main">
        <div
          className={classNames("main__container", {
            "main__container--active":
              active_tour && active_tab === DASHBOARD && !isDesktop,
          })}
        >
          <div>
            <Tabs
              active_index={active_tab}
              className="main__tabs"
              onTabItemClick={handleTabChange}
              top
            >
              <div
                label={
                  <>
                    <LegacyHomeOldIcon
                      iconSize="sm"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Dashboard" />
                  </>
                }
                id="id-dbot-dashboard"
              >
                <Dashboard handleTabChange={handleTabChange} />
              </div>
              <div
                label={
                  <>
                    <LabelPairedPuzzlePieceTwoCaptionBoldIcon
                      height="24px"
                      width="24px"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Bot Builder" />
                  </>
                }
                id="id-bot-builder"
              />
              <div
                label={
                  <>
                    <LegacyChartsIcon
                      iconSize="sm"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Charts" />
                  </>
                }
                id={
                  is_chart_modal_visible || is_trading_view_modal_visible
                    ? "id-charts--disabled"
                    : "id-charts"
                }
              >
                <Suspense
                  fallback={
                    <ChunkLoader
                      message={localize("Please wait, loading chart...")}
                    />
                  }
                >
                  <ChartWrapper show_digits_stats={false} />
                </Suspense>
              </div>
              <div
                label={
                  <>
                    <LegacyGuide1pxIcon
                      iconSize="sm"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Trading Bots" />
                  </>
                }
                id="id-trading-bots"
              >
                <TradingBots />
              </div>
              <div
                label={
                  <>
                    <LabelPairedObjectsColumnCaptionRegularIcon
                      height="24px"
                      width="24px"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Dual Edge" />
                  </>
                }
                id="id-dual-edge"
              >
                <Suspense
                  fallback={
                    <ChunkLoader
                      message={localize("Please wait, loading Dual Edge...")}
                    />
                  }
                >
                  <DualEdge />
                </Suspense>
              </div>
              <div
                label={
                  <>
                    <LegacyGuide1pxIcon
                      iconSize="sm"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Glean Volatilities" />
                  </>
                }
                id="id-glean-volatilities"
              >
                <div />
              </div>
              <div
                label={
                  <>
                    <LegacyTimeIcon iconSize="sm" fill="var(--text-general)" />
                    <Localize i18n_default_text="Flight Mode" />
                  </>
                }
                id="id-flight-mode"
              >
                <div />
              </div>
              <div
                label={
                  <>
                    <LegacyIndicatorsIcon
                      iconSize="sm"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Hybrid Bots" />
                  </>
                }
                id="id-hybrid-bots"
              >
                <Suspense
                  fallback={
                    <ChunkLoader
                      message={localize("Please wait, loading Hybrid Bots...")}
                    />
                  }
                >
                  <HybridBots />
                </Suspense>
              </div>
              <div
                label={
                  <>
                    <LegacyTimeIcon iconSize="sm" fill="var(--text-general)" />
                    <Localize i18n_default_text="SpeedBots" />
                  </>
                }
                id="id-speedbot"
              >
                <Suspense
                  fallback={
                    <ChunkLoader
                      message={localize("Please wait, loading SpeedBots...")}
                    />
                  }
                >
                  <SpeedBot />
                </Suspense>
              </div>
              <div
                label={
                  <>
                    <LabelPairedCircleInfoCaptionBoldIcon
                      height="20px"
                      width="20px"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Analysis Tool" />
                  </>
                }
                id="id-analysis-tool"
              >
                <Suspense
                  fallback={
                    <ChunkLoader
                      message={localize(
                        "Please wait, loading Analysis Tool...",
                      )}
                    />
                  }
                >
                  <AnalysisTools />
                </Suspense>
              </div>
              <div
                label={
                  <>
                    <StandaloneCircleUserRegularIcon
                      height="20px"
                      width="20px"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="Copy Trading" />
                  </>
                }
                id="id-copy-trading"
              >
                <Suspense
                  fallback={
                    <ChunkLoader
                      message={localize("Please wait, loading Copy Trading...")}
                    />
                  }
                >
                  <CopyTrading />
                </Suspense>
              </div>
              <div
                label={
                  <>
                    <LabelPairedChartLineCaptionRegularIcon
                      height="24px"
                      width="24px"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="DTrader" />
                  </>
                }
                id="id-dtrader"
              >
                <Suspense
                  fallback={
                    <ChunkLoader
                      message={localize("Please wait, loading DTrader...")}
                    />
                  }
                >
                  <Dtrader />
                </Suspense>
              </div>
              <div
                label={
                  <>
                    <LegacyReportsIcon
                      iconSize="sm"
                      fill="var(--text-general)"
                    />
                    <Localize i18n_default_text="TradingView" />
                  </>
                }
                id="id-tradingview"
              >
                <Suspense
                  fallback={
                    <ChunkLoader
                      message={localize("Please wait, loading TradingView...")}
                    />
                  }
                >
                  <TradingView />
                </Suspense>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
      {isDesktop && (
        <>
          {active_tab !== DTRADER && show_run_panel_shell && (
            <div
              className={classNames("main__run-strategy-wrapper", {
                "main__run-strategy-wrapper--bot-builder":
                  active_tab === DBOT_TABS.BOT_BUILDER,
              })}
            >
              <RunStrategy />
              <RunPanel />
            </div>
          )}
          <ChartModal />
          <TradingViewModal />
        </>
      )}
      {!isDesktop &&
        !is_open &&
        active_tab !== DTRADER &&
        show_run_panel_shell && <RunPanel />}
      <SpeedBotFloatingStop />
      <Dialog
        cancel_button_text={cancel_button_text || localize("Cancel")}
        className="dc-dialog__wrapper--fixed"
        confirm_button_text={ok_button_text || localize("Ok")}
        has_close_icon
        is_mobile_full_width={false}
        is_visible={is_dialog_open}
        onCancel={onCancelButtonClick}
        onClose={onCloseDialog}
        onConfirm={onOkButtonClick || onCloseDialog}
        portal_element_id="modal_root"
        title={title}
        login={handleLoginGeneration}
        dismissable={dismissable} // Prevents closing on outside clicks
        is_closed_on_cancel={is_closed_on_cancel}
      >
        {message}
      </Dialog>
      <SignupModal />
      {signalModal && (
        <SignalModal
          signal={signalModal}
          onClose={() => setSignalModal(null)}
        />
      )}
      {sessionAlert && (
        <SessionResultModal
          message={sessionAlert}
          onClose={() => setSessionAlert(null)}
        />
      )}
    </React.Fragment>
  );
});

export default AppWrapper;
