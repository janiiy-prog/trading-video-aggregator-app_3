// Seed term dictionaries per design doc Section 4.
// "expand quarterly as jargon evolves" — this file is the thing to revisit
// on that cadence. Each entry can optionally set minHits > 1 for generic
// terms that need corroborating evidence (e.g. RSI alone is weak signal).

export interface TermRule {
  terms: string[];
  minHits?: number; // default 1
}

export const INSTRUMENT_TERMS: Record<string, TermRule> = {
  SPX: { terms: ["spx", "s&p 500 index", "s&p 500 futures"] },
  ES: { terms: ["/es", " es futures", "e-mini s&p", "emini s&p"] },
  SPY: { terms: ["spy", "s&p 500 etf"] },
  NQ: { terms: ["/nq", "nq futures", "e-mini nasdaq", "emini nasdaq"] },
  "Options-on-SPX": { terms: ["spx options", "spx 0dte", "options on spx"] },
};

export const METHODOLOGY_TERMS: Record<string, TermRule> = {
  // ICT/SMC — unusually high-signal per the doc: 1-2 hits already = high confidence
  ICT: {
    terms: [
      "order block", "fair value gap", "fvg", "liquidity sweep", "inducement",
      "breaker block", "judas swing", "mss", "bos", "choch", "premium/discount",
      "ote", "kill zone", "silver bullet", "power of three", "smart money concepts",
    ],
    minHits: 1,
  },
  "Order Flow": {
    terms: [
      "volume profile", "point of control", "order flow", "footprint chart",
      "bid/ask imbalance", "delta", "absorption", "tape reading", "dom",
    ],
    minHits: 1,
  },
  VWAP: {
    terms: ["vwap", "anchored vwap", "standard deviation bands", "vwap reversion"],
    minHits: 1,
  },
  "Price Action": {
    terms: [
      "naked chart", "candlestick pattern", "pin bar", "engulfing candle",
      "rejection wick", "higher highs higher lows",
    ],
    minHits: 1,
  },
  "Elliott Wave": {
    terms: ["wave count", "impulse wave", "corrective wave", "abc correction", "elliott wave"],
    minHits: 1,
  },
  "Indicator-based": {
    // Generic technical-indicator terms — weak individually, need corroboration.
    terms: ["rsi", "macd", "moving average", "bollinger band", "stochastic", "support and resistance"],
    minHits: 2,
  },
};

export const STRATEGY_TERMS: Record<string, TermRule> = {
  Scalping: { terms: ["scalp", "scalping"] },
  "Day Trading": { terms: ["day trading", "day trade", "intraday trading"] },
  Swing: { terms: ["swing trade", "swing trading", "multi-day hold"] },
  "Options Income": {
    terms: ["0dte", "credit spread", "iron condor", "theta decay", "gamma exposure", "gex", "unusual options activity"],
    minHits: 1,
  },
};

export const FORMAT_TERMS: Record<string, TermRule> = {
  "Live/Recap": { terms: ["live trading", "morning recap", "session recap", "live stream"] },
  Tutorial: { terms: ["how to", "tutorial", "beginner", "step by step"] },
  Analysis: { terms: ["market analysis", "weekly outlook", "technical analysis"] },
  Backtest: { terms: ["backtest", "backtesting", "historical results"] },
  "Q&A": { terms: ["q&a", "question and answer", "ask me anything", "ama"] },
};

export const MACRO_TERMS: TermRule = {
  terms: ["fomc", "cpi print", "jobs report", "nfp", "fed rate decision", "economic calendar"],
  minHits: 1,
};
