import React, { useState } from "react";
import { localize } from "@deriv-com/translations";
import FreeBots from "./free-bots";
import RiskCalculator from "./risk-calculator";
import CapitalGrowthCalculator from "./capital-growth-calculator";
import "./trading-bots.scss";

const TradingBots: React.FC = () => {
  const [active_subtab, setActiveSubtab] = useState<
    "bots" | "risk-management" | "risk-calculator"
  >("bots");

  return (
    <div className="trading-bots">
      <div className="trading-bots__cards-container">
        <button
          type="button"
          className={`trading-bots__card trading-bots__card--dark ${
            active_subtab === "bots" ? "trading-bots__card--active" : ""
          }`}
          onClick={() => setActiveSubtab("bots")}
        >
          <div className="trading-bots__card-content">
            <span className="trading-bots__card-label">
              {localize("Trading Bots")}
            </span>
          </div>
        </button>
        <button
          type="button"
          className={`trading-bots__card trading-bots__card--light ${
            active_subtab === "risk-management"
              ? "trading-bots__card--active"
              : ""
          }`}
          onClick={() => setActiveSubtab("risk-management")}
        >
          <div className="trading-bots__card-content">
            <span className="trading-bots__card-label">
              {localize("Risk Management")}
            </span>
          </div>
        </button>
        <button
          type="button"
          className={`trading-bots__card trading-bots__card--dark ${
            active_subtab === "risk-calculator"
              ? "trading-bots__card--active"
              : ""
          }`}
          onClick={() => setActiveSubtab("risk-calculator")}
        >
          <div className="trading-bots__card-content">
            <span className="trading-bots__card-label">
              {localize("Risk Calculator")}
            </span>
          </div>
        </button>
      </div>
      <div className="trading-bots__content">
        {active_subtab === "bots" ? (
          <FreeBots />
        ) : active_subtab === "risk-management" ? (
          <RiskCalculator />
        ) : (
          <CapitalGrowthCalculator />
        )}
      </div>
    </div>
  );
};

export default TradingBots;
