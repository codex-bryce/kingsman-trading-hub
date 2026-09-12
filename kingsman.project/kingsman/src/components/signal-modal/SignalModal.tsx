import React, { useState } from "react";
import { observer } from "mobx-react-lite";
import { DBOT_TABS } from "@/constants/bot-contents";
import { useStore } from "@/hooks/useStore";
import { buildBotFromSignal, ParsedSignal } from "@/utils/signal-bot-xml";
import { load } from "@/external/bot-skeleton/scratch/utils";
import { save_types } from "@/external/bot-skeleton/constants/save-type";
import "./signal-modal.scss";

interface Props {
  signal: ParsedSignal;
  onClose: () => void;
}

const SignalModal = observer(({ signal, onClose }: Props) => {
  const { dashboard, run_panel } = useStore();
  const { setActiveTab, setPendingFreeBot } = dashboard;

  const [stake, setStake] = useState(1);
  const [wins, setWins] = useState(5);
  const [stopLoss, setStopLoss] = useState(10);
  const [martingale, setMartingale] = useState(1.3);
  const [loading, setLoading] = useState(false);

  const loadBot = async (autoRun: boolean) => {
    setLoading(true);
    try {
      const bot = buildBotFromSignal(signal, {
        stake,
        wins,
        stopLoss,
        martingale,
      });
      setPendingFreeBot(bot);
      setActiveTab(DBOT_TABS.BOT_BUILDER);
      onClose();

      if (autoRun) {
        // Wait for workspace to load the blocks, then run
        let attempts = 0;
        const tryRun = () => {
          attempts++;
          if (window.Blockly?.derivWorkspace && !dashboard.pending_free_bot) {
            run_panel.onRunButtonClick();
          } else if (attempts < 20) {
            setTimeout(tryRun, 300);
          }
        };
        setTimeout(tryRun, 500);
      }
    } finally {
      setLoading(false);
    }
  };

  const isOver = signal.contractType === "DIGITOVER";

  return (
    <div
      className="signal-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="signal-modal__card">
        <div className="signal-modal__header">
          <h2>🚀 KingsmanTradingHub AI Signal 🚀</h2>
          <button className="signal-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="signal-modal__body">
          {/* Profile card */}
          <div
            className="signal-modal__profile-card"
            style={{
              background: isOver
                ? "linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #1d4ed8 100%)"
                : "linear-gradient(135deg, #7f1d1d 0%, #991b1b 60%, #b91c1c 100%)",
            }}
          >
            <span className="signal-modal__profile-card-name">
              {signal.profileLabel}
            </span>
            {signal.strength > 0 && (
              <div className="signal-modal__profile-card-strength">
                <span className="value">{signal.strength}%</span>
                <span className="label">Strength</span>
              </div>
            )}
          </div>

          {/* Market + Entry digit */}
          <div className="signal-modal__info-row">
            <div className="signal-modal__info-card">
              <span className="label">Market</span>
              <span className="value">{signal.marketName}</span>
            </div>
            {signal.entryDigit > 0 && (
              <div className="signal-modal__info-card">
                <span className="label">Entry Digit</span>
                <span className="value">{signal.entryDigit}</span>
              </div>
            )}
          </div>

          {/* Score + Win rate */}
          {(signal.score > 0 || signal.winRate > 0) && (
            <div className="signal-modal__info-row">
              {signal.score > 0 && (
                <div className="signal-modal__info-card">
                  <span className="label">Score</span>
                  <span className="value">{signal.score}%</span>
                </div>
              )}
              {signal.winRate > 0 && (
                <div className="signal-modal__info-card">
                  <span className="label">Win Rate</span>
                  <span className="value">{signal.winRate}%</span>
                </div>
              )}
            </div>
          )}

          {/* Settings inputs */}
          <div className="signal-modal__inputs">
            <div className="signal-modal__input-group">
              <label>Stake</label>
              <input
                type="number"
                value={stake}
                min={0.35}
                step={0.01}
                onChange={(e) => setStake(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="signal-modal__input-group">
              <label>Number of wins</label>
              <input
                type="number"
                value={wins}
                min={1}
                step={1}
                onChange={(e) => setWins(parseInt(e.target.value, 10) || 1)}
              />
            </div>
          </div>

          <div className="signal-modal__inputs">
            <div className="signal-modal__input-group">
              <label>Stop loss</label>
              <input
                type="number"
                value={stopLoss}
                min={1}
                step={1}
                onChange={(e) => setStopLoss(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="signal-modal__input-group">
              <label>Martingale</label>
              <input
                type="number"
                value={martingale}
                min={1}
                step={0.1}
                onChange={(e) => setMartingale(parseFloat(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="signal-modal__actions">
            <button
              className="signal-modal__btn signal-modal__btn--secondary"
              onClick={() => loadBot(false)}
              disabled={loading}
            >
              Load only
            </button>
            <button
              className="signal-modal__btn signal-modal__btn--primary"
              onClick={() => loadBot(true)}
              disabled={loading}
            >
              Load &amp; Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default SignalModal;
