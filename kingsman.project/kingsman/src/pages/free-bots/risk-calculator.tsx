import React, { useState } from "react";
import Text from "@/components/shared_ui/text";
import { localize } from "@deriv-com/translations";
import "./risk-calculator.scss";

const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

const buildStakeSequence = (
  base_stake: number,
  multiplier: number,
  steps: number,
) => {
  return Array.from(
    { length: steps },
    (_, index) => base_stake * Math.pow(multiplier, index),
  );
};

const RiskCalculator: React.FC = () => {
  const [balance_input, setBalanceInput] = useState("30");
  const [martingale_input, setMartingaleInput] = useState("2");
  const [take_profit_input, setTakeProfitInput] = useState("10");
  const [stop_loss_input, setStopLossInput] = useState("30");
  const [consecutive_losses_input, setConsecutiveLossesInput] = useState("3");

  const balance = Math.max(Number(balance_input) || 0, 0);
  const martingale_size = Math.max(Number(martingale_input) || 1, 1);
  const take_profit_percent = Math.max(Number(take_profit_input) || 0, 0);
  const stop_loss_percent = Math.max(Number(stop_loss_input) || 0, 0);
  const consecutive_losses = Math.max(
    Math.floor(Number(consecutive_losses_input) || 0),
    0,
  );

  const take_profit = balance * (take_profit_percent / 100);
  const stop_loss = balance * (stop_loss_percent / 100);
  const sequence_steps = consecutive_losses + 1;
  const total_multiplier_weight =
    martingale_size === 1
      ? sequence_steps
      : (Math.pow(martingale_size, sequence_steps) - 1) / (martingale_size - 1);
  const base_stake =
    total_multiplier_weight > 0 ? stop_loss / total_multiplier_weight : 0;
  const stake_sequence = buildStakeSequence(
    base_stake,
    martingale_size,
    sequence_steps,
  );
  const required_capital = stake_sequence.reduce(
    (sum, stake) => sum + stake,
    0,
  );

  const handleKeypadInput = (digit: string) => {
    setBalanceInput((current) => {
      if (current === "0") return digit;
      return `${current}${digit}`;
    });
  };

  const handleClear = () => {
    setBalanceInput("0");
  };

  const handleDelete = () => {
    setBalanceInput((current) => {
      if (current.length <= 1) return "0";
      return current.slice(0, -1);
    });
  };

  return (
    <div className="risk-calculator">
      <div className="risk-calculator__hero">
        <div>
          <Text as="h2" weight="bold" className="risk-calculator__title">
            {localize("Deriv Risk Management Calculator")}
          </Text>
          <Text
            size="s"
            color="less-prominent"
            className="risk-calculator__subtitle"
          >
            {localize("Calculate optimal stakes and manage risk effectively")}
          </Text>
        </div>
      </div>

      <div className="risk-calculator__layout">
        <section className="risk-calculator__panel risk-calculator__panel--keypad">
          <div className="risk-calculator__display">
            <span className="risk-calculator__currency">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={balance_input}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="risk-calculator__display-input"
            />
          </div>

          <div className="risk-calculator__keypad">
            {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((key) => (
              <button
                key={key}
                type="button"
                className="risk-calculator__key"
                onClick={() => handleKeypadInput(key)}
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              className="risk-calculator__key risk-calculator__key--delete"
              onClick={handleDelete}
            >
              DEL
            </button>
            <button
              type="button"
              className="risk-calculator__key risk-calculator__key--clear"
              onClick={handleClear}
            >
              C
            </button>
            <button
              type="button"
              className="risk-calculator__key"
              onClick={() => handleKeypadInput("0")}
            >
              0
            </button>
          </div>
        </section>

        <section className="risk-calculator__panel risk-calculator__panel--summary">
          <div className="risk-calculator__settings">
            <label className="risk-calculator__setting">
              <span>{localize("Martingale Size")}</span>
              <div className="risk-calculator__setting-input-wrap">
                <span>x</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={martingale_input}
                  onChange={(e) => setMartingaleInput(e.target.value)}
                />
              </div>
            </label>
            <label className="risk-calculator__setting">
              <span>{localize("Take Profit %")}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={take_profit_input}
                onChange={(e) => setTakeProfitInput(e.target.value)}
              />
            </label>
            <label className="risk-calculator__setting">
              <span>{localize("Stop Loss %")}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={stop_loss_input}
                onChange={(e) => setStopLossInput(e.target.value)}
              />
            </label>
            <label className="risk-calculator__setting">
              <span>{localize("Consecutive Losses")}</span>
              <input
                type="number"
                min="0"
                step="1"
                value={consecutive_losses_input}
                onChange={(e) => setConsecutiveLossesInput(e.target.value)}
              />
            </label>
          </div>

          <div className="risk-calculator__stats">
            <div className="risk-calculator__stat">
              <span>{localize("Stake")}</span>
              <strong>{formatCurrency(base_stake)}</strong>
            </div>
            <div className="risk-calculator__stat">
              <span>{localize("Martingale Size")}</span>
              <strong>{`x${martingale_size.toFixed(1).replace(/\.0$/, "")}`}</strong>
            </div>
            <div className="risk-calculator__stat">
              <span>{localize("Take Profit")}</span>
              <strong>{formatCurrency(take_profit)}</strong>
            </div>
            <div className="risk-calculator__stat">
              <span>{localize("Stop Loss")}</span>
              <strong>{formatCurrency(stop_loss)}</strong>
            </div>
            <div className="risk-calculator__stat">
              <span>{localize("Consecutive Losses")}</span>
              <strong>{consecutive_losses}</strong>
            </div>
            <div className="risk-calculator__stat">
              <span>{localize("Required Capital")}</span>
              <strong>{formatCurrency(required_capital)}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="risk-calculator__panel risk-calculator__panel--sequence">
        <div className="risk-calculator__sequence-header">
          <Text weight="bold">{localize("Stake Sequence")}</Text>
          <Text size="xs" color="less-prominent">
            {localize(
              "Initial stake plus each martingale step up to your loss limit",
            )}
          </Text>
        </div>
        <div className="risk-calculator__sequence-list">
          {stake_sequence.map((stake, index) => (
            <div
              key={`${stake}-${index}`}
              className="risk-calculator__sequence-item"
            >
              <span className="risk-calculator__sequence-step">{`${localize("Step")} ${index + 1}`}</span>
              <strong>{formatCurrency(stake)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="risk-calculator__panel risk-calculator__panel--note">
        <Text size="s" color="less-prominent">
          {localize(
            "This powerful calculator helps you manage risk effectively by determining appropriate stakes based on your risk management strategy.",
          )}
        </Text>
        <Text size="s" color="less-prominent">
          {localize(
            "It calculates stake amounts, take profit and stop loss levels, and shows the capital required to sustain consecutive losses.",
          )}
        </Text>
      </section>
    </div>
  );
};

export default RiskCalculator;
