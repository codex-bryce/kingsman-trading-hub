import React, { useState } from "react";
import Matches from "../matches";
import Hyperbot from "../hyperbot";
import Diffbot from "../diffbot";
import { Localize } from "@deriv-com/translations";
import { LabelPairedPuzzlePieceTwoCaptionBoldIcon } from "@deriv/quill-icons/LabelPaired";
import "./hybrid-bots.scss";

type HybridBotSubTab = "matches" | "diffbot" | "hyperbot";

const HybridBots: React.FC = () => {
  const [active_tool, setActiveTool] = useState<HybridBotSubTab>("matches");

  const handleCardClick = (tool: HybridBotSubTab) => {
    setActiveTool(tool);
  };

  const renderContent = () => {
    if (!active_tool) return null;

    switch (active_tool) {
      case "matches":
        return <Matches />;
      case "diffbot":
        return <Diffbot />;
      case "hyperbot":
        return <Hyperbot />;
      default:
        return null;
    }
  };

  return (
    <div className="hybrid-bots">
      <div className="hybrid-bots__cards-container">
        <div
          className={`hybrid-bots__card hybrid-bots__card--light ${active_tool === "matches" ? "hybrid-bots__card--active" : ""}`}
          onClick={() => handleCardClick("matches")}
        >
          <div className="hybrid-bots__card-content">
            <LabelPairedPuzzlePieceTwoCaptionBoldIcon
              height="16px"
              width="16px"
              fill={active_tool === "matches" ? "#ffffff" : "#1e3a8a"}
            />
            <span className="hybrid-bots__card-label">
              <Localize i18n_default_text="Matches" />
            </span>
          </div>
        </div>
        <div
          className={`hybrid-bots__card hybrid-bots__card--light ${active_tool === "diffbot" ? "hybrid-bots__card--active" : ""}`}
          onClick={() => handleCardClick("diffbot")}
        >
          <div className="hybrid-bots__card-content">
            <LabelPairedPuzzlePieceTwoCaptionBoldIcon
              height="16px"
              width="16px"
              fill={active_tool === "diffbot" ? "#ffffff" : "#1e3a8a"}
            />
            <span className="hybrid-bots__card-label">
              <Localize i18n_default_text="Diffbot" />
            </span>
          </div>
        </div>
        <div
          className={`hybrid-bots__card hybrid-bots__card--light ${active_tool === "hyperbot" ? "hybrid-bots__card--active" : ""}`}
          onClick={() => handleCardClick("hyperbot")}
        >
          <div className="hybrid-bots__card-content">
            <LabelPairedPuzzlePieceTwoCaptionBoldIcon
              height="16px"
              width="16px"
              fill={active_tool === "hyperbot" ? "#ffffff" : "#1e3a8a"}
            />
            <span className="hybrid-bots__card-label">
              <Localize i18n_default_text="Hyperbot" />
            </span>
          </div>
        </div>
      </div>
      {active_tool && (
        <div className="hybrid-bots__content">{renderContent()}</div>
      )}
    </div>
  );
};

export default HybridBots;
