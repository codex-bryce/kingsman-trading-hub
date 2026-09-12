import React from "react";
import "./session-result-modal.scss";

interface Props {
  message: string;
  onClose: () => void;
}

function classify(msg: string): { icon: string; display: string } {
  const lower = msg.toLowerCase();
  if (lower.includes("take profit") || lower.includes("congratulations")) {
    return { icon: "🎉", display: "Session Completed!" };
  }
  if (
    lower.includes("loss") ||
    lower.includes("maximum") ||
    lower.includes("stop loss")
  ) {
    return { icon: "⛔", display: "Session Stopped." };
  }
  return { icon: "🤖", display: "Session Ended." };
}

const SessionResultModal: React.FC<Props> = ({ message, onClose }) => {
  const { icon, display } = classify(message);

  return (
    <div className="session-result-modal">
      <div className="session-result-modal__card">
        <div className="session-result-modal__header">
          <h2>KingsmanTradingHub</h2>
          <button className="session-result-modal__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="session-result-modal__body">
          <div className="session-result-modal__icon">{icon}</div>
          <p className="session-result-modal__message">
            {display}
            <br />
            {message}
          </p>
          <div className="session-result-modal__actions">
            <button
              className="session-result-modal__btn session-result-modal__btn--ok"
              onClick={onClose}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionResultModal;
