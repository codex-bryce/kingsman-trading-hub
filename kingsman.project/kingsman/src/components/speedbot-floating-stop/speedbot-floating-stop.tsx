import React from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "@/hooks/useStore";
import { useDevice } from "@deriv-com/ui";
import { localize } from "@deriv-com/translations";
import "./speedbot-floating-stop.scss";

const SpeedBotFloatingStop = observer(() => {
  const { dashboard, run_panel } = useStore();
  const { isDesktop } = useDevice();
  const { active_tab } = dashboard;
  const { DBOT_TABS } = require("@/constants/bot-contents");

  // Check if we're on SpeedBot tab and if there's an active contract or running
  const isSpeedBotActive = active_tab === DBOT_TABS.SPEEDBOT;
  const hasOpenContract = run_panel.has_open_contract;
  const isRunning = run_panel.is_running;

  // Only show on mobile when SpeedBot is running or has open contracts
  if (isDesktop || !isSpeedBotActive || (!hasOpenContract && !isRunning)) {
    return null;
  }

  const handleStop = () => {
    // Use SpeedBot's own stop function if available
    if ((window as any).speedbotStop) {
      (window as any).speedbotStop();
    } else {
      // Fallback to run panel stop
      run_panel.stopBot();
    }
  };

  return (
    <div className="speedbot-floating-stop">
      <button
        className="speedbot-floating-stop__button"
        onClick={handleStop}
        title={localize("Stop SpeedBot")}
      >
        <span className="speedbot-floating-stop__icon">⏹</span>
        <span className="speedbot-floating-stop__text">{localize("Stop")}</span>
      </button>
    </div>
  );
});

export default SpeedBotFloatingStop;
