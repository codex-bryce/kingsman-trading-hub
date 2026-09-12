import React, { useMemo, useState } from "react";
import Text from "@/components/shared_ui/text";
import { localize } from "@deriv-com/translations";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./capital-growth-calculator.scss";

type TGrowthRow = {
  day: number;
  capital: number;
  session_1: number;
  session_2: number;
  session_3: number;
  profit: number;
  reinvest: number;
  withdraw: number;
  end_balance: number;
};

type TChallengeSummary = {
  initial_capital: number;
  total_profit: number;
  total_withdrawn: number;
  balance_after_challenge: number;
};

const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

const CapitalGrowthCalculator: React.FC = () => {
  const [starting_capital_input, setStartingCapitalInput] = useState("10");
  const [number_of_days_input, setNumberOfDaysInput] = useState("30");
  const [daily_target_input, setDailyTargetInput] = useState("30");
  const [rows, setRows] = useState<TGrowthRow[]>([]);
  const [summary, setSummary] = useState<TChallengeSummary>({
    initial_capital: 0,
    total_profit: 0,
    total_withdrawn: 0,
    balance_after_challenge: 0,
  });

  const has_results = rows.length > 0;

  const parsed_values = useMemo(
    () => ({
      starting_capital: Math.max(Number(starting_capital_input) || 0, 0),
      number_of_days: Math.max(
        Math.floor(Number(number_of_days_input) || 0),
        0,
      ),
      daily_target: Math.max(Number(daily_target_input) || 0, 0),
    }),
    [daily_target_input, number_of_days_input, starting_capital_input],
  );

  const handleCalculate = () => {
    const { starting_capital, number_of_days, daily_target } = parsed_values;
    const next_rows: TGrowthRow[] = [];
    const session_rate = daily_target / 100 / 3;
    let capital = starting_capital;
    let total_profit = 0;
    let total_withdrawn = 0;

    for (let day = 1; day <= number_of_days; day++) {
      const starting_day_capital = capital;
      const session_1 = capital * session_rate;
      capital += session_1;
      const session_2 = capital * session_rate;
      capital += session_2;
      const session_3 = capital * session_rate;
      capital += session_3;

      const profit = session_1 + session_2 + session_3;
      const reinvest = profit * 0.5;
      const withdraw = profit * 0.5;
      const end_balance = starting_day_capital + reinvest;

      next_rows.push({
        day,
        capital: starting_day_capital,
        session_1,
        session_2,
        session_3,
        profit,
        reinvest,
        withdraw,
        end_balance,
      });

      capital = end_balance;
      total_profit += profit;
      total_withdrawn += withdraw;
    }

    setRows(next_rows);
    setSummary({
      initial_capital: starting_capital,
      total_profit,
      total_withdrawn,
      balance_after_challenge:
        next_rows[next_rows.length - 1]?.end_balance || starting_capital,
    });
  };

  const handleDownloadPdf = () => {
    if (!has_results) return;

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    const page_width = doc.internal.pageSize.getWidth();
    const summary_cards = [
      {
        label: localize("Initial Capital"),
        value: formatCurrency(summary.initial_capital),
        color: "#123a8f",
      },
      {
        label: localize("Total Profit Gained"),
        value: formatCurrency(summary.total_profit),
        color: "#16a34a",
      },
      {
        label: localize("Total Withdrawn"),
        value: formatCurrency(summary.total_withdrawn),
        color: "#ea580c",
      },
      {
        label: localize("Balance After Challenge"),
        value: formatCurrency(summary.balance_after_challenge),
        color: "#2563eb",
      },
    ];

    doc.setFillColor(248, 251, 255);
    doc.rect(24, 24, page_width - 48, 74, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(18, 58, 143);
    doc.setFontSize(22);
    doc.text("30 Day Capital Growth Challenge", 40, 54);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      "Projected challenge schedule with 3 sessions per day and a 50/50 reinvest / withdraw split.",
      40,
      76,
    );

    const card_y = 118;
    const card_gap = 12;
    const card_width = (page_width - 80 - card_gap * 3) / 4;

    summary_cards.forEach((card, index) => {
      const x = 40 + index * (card_width + card_gap);
      doc.setDrawColor(219, 234, 254);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, card_y, card_width, 62, 10, 10, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(card.label, x + 12, card_y + 19);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(card.color);
      doc.text(card.value, x + 12, card_y + 43);
    });

    autoTable(doc, {
      startY: 200,
      margin: { left: 40, right: 40, bottom: 44 },
      head: [
        [
          "#",
          "Capital",
          "Session 1",
          "Session 2",
          "Session 3",
          "Profit",
          "Re-Invest",
          "Withdraw",
        ],
      ],
      body: rows.map((row) => [
        String(row.day),
        formatCurrency(row.capital),
        formatCurrency(row.session_1),
        formatCurrency(row.session_2),
        formatCurrency(row.session_3),
        formatCurrency(row.profit),
        formatCurrency(row.reinvest),
        formatCurrency(row.withdraw),
      ]),
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 6,
        textColor: [15, 23, 42],
        lineColor: [219, 234, 254],
        lineWidth: 1,
      },
      headStyles: {
        fillColor: [18, 58, 143],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { halign: "center" },
        5: { textColor: [22, 163, 74], fontStyle: "bold" },
        6: { textColor: [37, 99, 235], fontStyle: "bold" },
        7: { textColor: [234, 88, 12], fontStyle: "bold" },
      },
    });

    const file_name = `30-day-capital-growth-challenge-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(file_name);
  };

  return (
    <div className="capital-growth-calculator">
      <div className="capital-growth-calculator__hero">
        <div>
          <Text
            as="h2"
            weight="bold"
            className="capital-growth-calculator__title"
          >
            {localize("30 Day Capital Growth Challenge")}
          </Text>
          <Text
            size="s"
            color="less-prominent"
            className="capital-growth-calculator__subtitle"
          >
            {localize(
              "Enter your values, generate your schedule, then download the full plan as PDF.",
            )}
          </Text>
        </div>
      </div>

      <section className="capital-growth-calculator__panel capital-growth-calculator__panel--controls">
        <div className="capital-growth-calculator__controls">
          <label className="capital-growth-calculator__field">
            <span>{localize("Starting Capital")}</span>
            <div className="capital-growth-calculator__input-wrap">
              <strong>$</strong>
              <input
                type="number"
                min="0"
                step="0.01"
                value={starting_capital_input}
                onChange={(e) => setStartingCapitalInput(e.target.value)}
              />
            </div>
          </label>

          <label className="capital-growth-calculator__field">
            <span>{localize("Number of Days")}</span>
            <div className="capital-growth-calculator__input-wrap">
              <input
                type="number"
                min="1"
                step="1"
                value={number_of_days_input}
                onChange={(e) => setNumberOfDaysInput(e.target.value)}
              />
              <em>{localize("days")}</em>
            </div>
          </label>

          <label className="capital-growth-calculator__field">
            <span>{localize("Daily Target")}</span>
            <div className="capital-growth-calculator__input-wrap">
              <input
                type="number"
                min="0"
                step="0.1"
                value={daily_target_input}
                onChange={(e) => setDailyTargetInput(e.target.value)}
              />
              <em>%</em>
            </div>
            <small>{localize("Recommended: 30%")}</small>
          </label>

          <div className="capital-growth-calculator__actions">
            <button
              type="button"
              className="capital-growth-calculator__button capital-growth-calculator__button--primary"
              onClick={handleCalculate}
            >
              {localize("Calculate")}
            </button>
            <button
              type="button"
              className={`capital-growth-calculator__button capital-growth-calculator__button--secondary ${
                has_results
                  ? "capital-growth-calculator__button--secondary-active"
                  : ""
              }`}
              onClick={handleDownloadPdf}
              disabled={!has_results}
            >
              {localize("Download PDF")}
            </button>
          </div>
        </div>
      </section>

      <section className="capital-growth-calculator__panel capital-growth-calculator__panel--table">
        <div className="capital-growth-calculator__table-wrap">
          <table className="capital-growth-calculator__table">
            <thead>
              <tr>
                <th>#</th>
                <th>{localize("Capital")}</th>
                <th>{localize("Session 1")}</th>
                <th>{localize("Session 2")}</th>
                <th>{localize("Session 3")}</th>
                <th>{localize("Profit")}</th>
                <th>{localize("Re-Invest")}</th>
                <th>{localize("Withdraw")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="capital-growth-calculator__empty">
                    {localize(
                      "Click Calculate to generate the 30-day challenge schedule.",
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.day}>
                    <td>{row.day}</td>
                    <td>{formatCurrency(row.capital)}</td>
                    <td>{formatCurrency(row.session_1)}</td>
                    <td>{formatCurrency(row.session_2)}</td>
                    <td>{formatCurrency(row.session_3)}</td>
                    <td>{formatCurrency(row.profit)}</td>
                    <td>{formatCurrency(row.reinvest)}</td>
                    <td>{formatCurrency(row.withdraw)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="capital-growth-calculator__summary">
        <div className="capital-growth-calculator__metric">
          <span>{localize("Initial Capital")}</span>
          <strong>{formatCurrency(summary.initial_capital)}</strong>
        </div>
        <div className="capital-growth-calculator__metric capital-growth-calculator__metric--profit">
          <span>{localize("Total Profit Gained")}</span>
          <strong>{formatCurrency(summary.total_profit)}</strong>
        </div>
        <div className="capital-growth-calculator__metric capital-growth-calculator__metric--withdraw">
          <span>{localize("Total Withdrawn")}</span>
          <strong>{formatCurrency(summary.total_withdrawn)}</strong>
        </div>
        <div className="capital-growth-calculator__metric capital-growth-calculator__metric--balance">
          <span>{localize("Balance After Challenge")}</span>
          <strong>{formatCurrency(summary.balance_after_challenge)}</strong>
        </div>
      </section>

      <section className="capital-growth-calculator__panel capital-growth-calculator__panel--note">
        <Text size="s" color="less-prominent">
          {localize(
            "Default model: 3 sessions per day, daily target split across those sessions, with 50% of each day’s profit re-invested and 50% marked for withdrawal.",
          )}
        </Text>
      </section>
    </div>
  );
};

export default CapitalGrowthCalculator;
