import React, { useState } from "react";
import { Localize } from "@deriv-com/translations";
import { LabelPairedPuzzlePieceTwoCaptionBoldIcon } from "@deriv/quill-icons/LabelPaired";
import DualEdgeBotPanel from "./dual-edge-bot-panel";
import "./dual-edge.scss";

type TDualEdgeSubTab = "ultimate_2026" | "nexus_ai";

const DualEdge: React.FC = () => {
  const [active_tool, setActiveTool] =
    useState<TDualEdgeSubTab>("ultimate_2026");

  return (
    <div className="dual-edge">
      <div className="dual-edge__cards-container">
        <div
          className={`dual-edge__card dual-edge__card--light ${
            active_tool === "ultimate_2026" ? "dual-edge__card--active" : ""
          }`}
          onClick={() => setActiveTool("ultimate_2026")}
        >
          <div className="dual-edge__card-content">
            <LabelPairedPuzzlePieceTwoCaptionBoldIcon
              height="16px"
              width="16px"
              fill={active_tool === "ultimate_2026" ? "#ffffff" : "#1e3a8a"}
            />
            <span className="dual-edge__card-label">
              <Localize i18n_default_text="Ultimate Bot" />
            </span>
          </div>
        </div>
        <div
          className={`dual-edge__card dual-edge__card--light ${
            active_tool === "nexus_ai" ? "dual-edge__card--active" : ""
          }`}
          onClick={() => setActiveTool("nexus_ai")}
        >
          <div className="dual-edge__card-content">
            <LabelPairedPuzzlePieceTwoCaptionBoldIcon
              height="16px"
              width="16px"
              fill={active_tool === "nexus_ai" ? "#ffffff" : "#1e3a8a"}
            />
            <span className="dual-edge__card-label">
              <Localize i18n_default_text="Glean AI" />
            </span>
          </div>
        </div>
      </div>

      <div className="dual-edge__content">
        <div
          className={`dual-edge__content-panel ${
            active_tool === "ultimate_2026"
              ? "dual-edge__content-panel--active"
              : "dual-edge__content-panel--inactive"
          }`}
        >
          <DualEdgeBotPanel strategy="ultimate_2026" />
        </div>
        <div
          className={`dual-edge__content-panel ${
            active_tool === "nexus_ai"
              ? "dual-edge__content-panel--active"
              : "dual-edge__content-panel--inactive"
          }`}
        >
          <DualEdgeBotPanel strategy="nexus_ai" />
        </div>
      </div>
    </div>
  );
};

export default DualEdge;
