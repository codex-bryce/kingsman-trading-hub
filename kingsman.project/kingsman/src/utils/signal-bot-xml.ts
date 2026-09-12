export interface SignalBotParams {
  symbol: string;
  contractType: "DIGITOVER" | "DIGITUNDER";
  initialPrediction: number;
  recoveryPrediction: number;
  stake?: number;
  takeProfit?: number;
  martingale?: number;
  maxLosses?: number;
}

// entry op: DIGITOVER buys when last digit < prediction; DIGITUNDER when > prediction
const ENTRY_OP: Record<string, string> = {
  DIGITOVER: "LT",
  DIGITUNDER: "GT",
};

export function buildSignalBotXml({
  symbol,
  contractType,
  initialPrediction,
  recoveryPrediction,
  stake = 1,
  takeProfit = 100,
  martingale = 2,
  maxLosses = 10,
}: SignalBotParams): string {
  const entryOp = ENTRY_OP[contractType] ?? "LT";

  return `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">
  <variables>
    <variable id="v_stake">STAKE</variable>
    <variable id="v_tp">TAKE PROFIT</variable>
    <variable id="v_pred">PREDICTION</variable>
    <variable id="v_lc">LOSS COUNT</variable>
    <variable id="v_mart">MARTINGALE</variable>
    <variable id="v_ipred">INITIAL PREDICTION</variable>
    <variable id="v_stakew">STAKE W</variable>
    <variable id="v_maxloss">MAX. CONSECUTIVE LOSSES</variable>
    <variable id="v_rpred">RECOVERY PREDICTION</variable>
  </variables>
  <block type="trade_definition" id="b1" deletable="false" x="0" y="60">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="b2" deletable="false" movable="false">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">random_index</field>
        <field name="SYMBOL_LIST">${symbol}</field>
        <next>
          <block type="trade_definition_tradetype" id="b3" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">digits</field>
            <field name="TRADETYPE_LIST">overunder</field>
            <next>
              <block type="trade_definition_contracttype" id="b4" deletable="false" movable="false">
                <field name="TYPE_LIST">both</field>
                <next>
                  <block type="trade_definition_candleinterval" id="b5" deletable="false" movable="false">
                    <field name="CANDLEINTERVAL_LIST">60</field>
                    <next>
                      <block type="trade_definition_restartbuysell" id="b6" deletable="false" movable="false">
                        <field name="TIME_MACHINE_ENABLED">FALSE</field>
                        <next>
                          <block type="trade_definition_restartonerror" id="b7" deletable="false" movable="false">
                            <field name="RESTARTONERROR">TRUE</field>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
    <statement name="INITIALIZATION">
      <block type="variables_set" id="b8">
        <field name="VAR" id="v_stake">STAKE</field>
        <value name="VALUE"><block type="math_number" id="b9"><field name="NUM">${stake}</field></block></value>
        <next><block type="variables_set" id="b10">
          <field name="VAR" id="v_tp">TAKE PROFIT</field>
          <value name="VALUE"><block type="math_number" id="b11"><field name="NUM">${takeProfit}</field></block></value>
          <next><block type="variables_set" id="b12">
            <field name="VAR" id="v_mart">MARTINGALE</field>
            <value name="VALUE"><block type="math_number" id="b13"><field name="NUM">${martingale}</field></block></value>
            <next><block type="variables_set" id="b14" collapsed="true">
              <field name="VAR" id="v_lc">LOSS COUNT</field>
              <value name="VALUE"><block type="math_number" id="b15"><field name="NUM">0</field></block></value>
              <next><block type="variables_set" id="b16" collapsed="true">
                <field name="VAR" id="v_stakew">STAKE W</field>
                <value name="VALUE"><block type="variables_get" id="b17"><field name="VAR" id="v_stake">STAKE</field></block></value>
                <next><block type="variables_set" id="b18" collapsed="true">
                  <field name="VAR" id="v_ipred">INITIAL PREDICTION</field>
                  <value name="VALUE"><block type="math_number" id="b19"><field name="NUM">${initialPrediction}</field></block></value>
                  <next><block type="variables_set" id="b20" collapsed="true">
                    <field name="VAR" id="v_pred">PREDICTION</field>
                    <value name="VALUE"><block type="variables_get" id="b21"><field name="VAR" id="v_ipred">INITIAL PREDICTION</field></block></value>
                    <next><block type="variables_set" id="b22" collapsed="true">
                      <field name="VAR" id="v_rpred">RECOVERY PREDICTION</field>
                      <value name="VALUE"><block type="math_number" id="b23"><field name="NUM">${recoveryPrediction}</field></block></value>
                      <next><block type="variables_set" id="b24" collapsed="true">
                        <field name="VAR" id="v_maxloss">MAX. CONSECUTIVE LOSSES</field>
                        <value name="VALUE"><block type="math_number" id="b25"><field name="NUM">${maxLosses}</field></block></value>
                      </block></next>
                    </block></next>
                  </block></next>
                </block></next>
              </block></next>
            </block></next>
          </block></next>
        </block></next>
      </block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions" id="b26">
        <mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="true"></mutation>
        <field name="DURATIONTYPE_LIST">t</field>
        <value name="DURATION"><shadow type="math_number_positive" id="b27"><field name="NUM">1</field></shadow></value>
        <value name="AMOUNT">
          <shadow type="math_number_positive" id="b28"><field name="NUM">1</field></shadow>
          <block type="variables_get" id="b29"><field name="VAR" id="v_stake">STAKE</field></block>
        </value>
        <value name="PREDICTION">
          <shadow type="math_number_positive" id="b30" inline="true"><field name="NUM">1</field></shadow>
          <block type="variables_get" id="b31"><field name="VAR" id="v_pred">PREDICTION</field></block>
        </value>
      </block>
    </statement>
  </block>
  <block type="during_purchase" id="b32" collapsed="true" x="906" y="60">
    <statement name="DURING_PURCHASE_STACK">
      <block type="controls_if" id="b33">
        <value name="IF0"><block type="check_sell" id="b34"></block></value>
      </block>
    </statement>
  </block>
  <block type="after_purchase" id="b35" collapsed="true" x="906" y="156">
    <statement name="AFTERPURCHASE_STACK">
      <block type="controls_if" id="b36" collapsed="true">
        <mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>
        <value name="IF0"><block type="contract_check_result" id="b37"><field name="CHECK_RESULT">win</field></block></value>
        <statement name="DO0">
          <block type="variables_set" id="b38" collapsed="true">
            <field name="VAR" id="v_pred">PREDICTION</field>
            <value name="VALUE"><block type="variables_get" id="b39"><field name="VAR" id="v_ipred">INITIAL PREDICTION</field></block></value>
            <next><block type="variables_set" id="b40" collapsed="true">
              <field name="VAR" id="v_stake">STAKE</field>
              <value name="VALUE"><block type="variables_get" id="b41"><field name="VAR" id="v_stakew">STAKE W</field></block></value>
              <next><block type="variables_set" id="b42" collapsed="true">
                <field name="VAR" id="v_lc">LOSS COUNT</field>
                <value name="VALUE"><block type="math_number" id="b43"><field name="NUM">0</field></block></value>
              </block></next>
            </block></next>
          </block>
        </statement>
        <statement name="ELSE">
          <block type="math_change" id="b44" collapsed="true">
            <field name="VAR" id="v_lc">LOSS COUNT</field>
            <value name="DELTA"><shadow type="math_number" id="b45"><field name="NUM">1</field></shadow></value>
            <next><block type="variables_set" id="b50" collapsed="true">
              <field name="VAR" id="v_pred">PREDICTION</field>
              <value name="VALUE"><block type="variables_get" id="b51"><field name="VAR" id="v_rpred">RECOVERY PREDICTION</field></block></value>
              <next><block type="variables_set" id="b57" collapsed="true">
                <field name="VAR" id="v_stake">STAKE</field>
                <value name="VALUE">
                  <block type="math_arithmetic" id="b58">
                    <field name="OP">MULTIPLY</field>
                    <value name="A">
                      <shadow type="math_number" id="b59"><field name="NUM">1</field></shadow>
                      <block type="variables_get" id="b60"><field name="VAR" id="v_stake">STAKE</field></block>
                    </value>
                    <value name="B">
                      <shadow type="math_number" id="b61"><field name="NUM">1</field></shadow>
                      <block type="variables_get" id="b62"><field name="VAR" id="v_mart">MARTINGALE</field></block>
                    </value>
                  </block>
                </value>
              </block></next>
            </block></next>
          </block>
        </statement>
        <next>
          <block type="controls_if" id="b64" collapsed="true">
            <mutation xmlns="http://www.w3.org/1999/xhtml" elseif="1" else="1"></mutation>
            <value name="IF0">
              <block type="logic_compare" id="b65">
                <field name="OP">GTE</field>
                <value name="A"><block type="total_profit" id="b66"></block></value>
                <value name="B"><block type="variables_get" id="b67"><field name="VAR" id="v_tp">TAKE PROFIT</field></block></value>
              </block>
            </value>
            <statement name="DO0">
              <block type="text_print" id="b68" collapsed="true">
                <value name="TEXT"><shadow type="text" id="b69"><field name="TEXT">Take Profit Hit!</field></shadow></value>
              </block>
            </statement>
            <value name="IF1">
              <block type="logic_compare" id="b70">
                <field name="OP">GTE</field>
                <value name="A"><block type="variables_get" id="b71"><field name="VAR" id="v_lc">LOSS COUNT</field></block></value>
                <value name="B"><block type="variables_get" id="b72"><field name="VAR" id="v_maxloss">MAX. CONSECUTIVE LOSSES</field></block></value>
              </block>
            </value>
            <statement name="DO1">
              <block type="text_print" id="b73" collapsed="true">
                <value name="TEXT"><shadow type="text" id="b74"><field name="TEXT">Maximum Losses Hit!</field></shadow></value>
              </block>
            </statement>
            <statement name="ELSE">
              <block type="trade_again" id="b75"></block>
            </statement>
          </block>
        </next>
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="b76" collapsed="true" deletable="false" x="0" y="1120">
    <statement name="BEFOREPURCHASE_STACK">
      <block type="controls_if" id="b77" collapsed="true">
        <value name="IF0">
          <block type="logic_compare" id="b78">
            <field name="OP">${entryOp}</field>
            <value name="A"><block type="last_digit" id="b79"></block></value>
            <value name="B"><block type="variables_get" id="b80"><field name="VAR" id="v_ipred">INITIAL PREDICTION</field></block></value>
          </block>
        </value>
        <statement name="DO0">
          <block type="purchase" id="b81" collapsed="true">
            <field name="PURCHASE_LIST">${contractType}</field>
          </block>
        </statement>
      </block>
    </statement>
  </block>
</xml>`;
}

export interface ParsedSignal {
  name: string;
  profileLabel: string;
  contractType: "DIGITOVER" | "DIGITUNDER";
  initialPrediction: number;
  recoveryPrediction: number;
  symbol: string;
  marketName: string;
  strength: number;
  winRate: number;
  entryDigit: number;
  score: number;
}

// Parse ?signal=over_2_4&symbol=R_50&strength=91&winrate=100&entry=5&score=91&mkt=... from URL
export function parseSignalParams(
  params: URLSearchParams,
): ParsedSignal | null {
  const signalParam = params.get("signal");
  if (!signalParam) return null;

  const parts = signalParam.split("_");
  if (parts.length < 3) return null;

  const type = parts[0].toUpperCase();
  const initial = parseInt(parts[1], 10);
  const recovery = parseInt(parts[2], 10);

  if (!["OVER", "UNDER"].includes(type) || isNaN(initial) || isNaN(recovery))
    return null;

  const contractType = (type === "OVER" ? "DIGITOVER" : "DIGITUNDER") as
    | "DIGITOVER"
    | "DIGITUNDER";
  const symbol = params.get("symbol") ?? "R_100";
  const profileLabel = `${type === "OVER" ? "Over" : "Under"} ${initial} Recovery ${type === "OVER" ? "Over" : "Under"} ${recovery}`;

  return {
    name: `Signal Bot – ${profileLabel} (${symbol})`,
    profileLabel,
    contractType,
    initialPrediction: initial,
    recoveryPrediction: recovery,
    symbol,
    marketName: params.get("mkt") ?? symbol,
    strength: Number(params.get("strength") ?? 0),
    winRate: Number(params.get("winrate") ?? 0),
    entryDigit: Number(params.get("entry") ?? 0),
    score: Number(params.get("score") ?? 0),
  };
}

export function buildBotFromSignal(
  signal: ParsedSignal,
  settings: {
    stake: number;
    wins: number;
    stopLoss: number;
    martingale: number;
  },
): { name: string; xml: string } {
  const takeProfit = settings.stake * settings.wins;
  return {
    name: signal.name,
    xml: buildSignalBotXml({
      symbol: signal.symbol,
      contractType: signal.contractType,
      initialPrediction: signal.initialPrediction,
      recoveryPrediction: signal.recoveryPrediction,
      stake: settings.stake,
      takeProfit,
      martingale: settings.martingale,
      maxLosses: settings.stopLoss,
    }),
  };
}
