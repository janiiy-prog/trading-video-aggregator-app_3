import type { TermRule } from "./dictionaries.js";
import { INSTRUMENT_TERMS, METHODOLOGY_TERMS, STRATEGY_TERMS, FORMAT_TERMS } from "./dictionaries.js";

export interface TagResult {
  tag: string;
  category: "instrument" | "strategy" | "methodology" | "format";
  confidence: "high" | "low";
}

// Counts occurrences of each term in text, returns which tags in a
// dictionary cleared their minHits threshold, and confidence:
//  - high: hit count comfortably clears the threshold (>= minHits, and for
//          minHits===1 dictionaries any hit at all is high-confidence per
//          the doc's "ICT vocabulary ... even 1-2 hits = high confidence")
//  - low:  hit but only barely, worth surfacing but marking "unverified"
function scoreDictionary(
  text: string,
  dictionary: Record<string, TermRule>,
  category: TagResult["category"]
): TagResult[] {
  const lower = text.toLowerCase();
  const results: TagResult[] = [];

  for (const [tag, rule] of Object.entries(dictionary)) {
    const minHits = rule.minHits ?? 1;
    let hits = 0;
    for (const term of rule.terms) {
      // naive substring count — good enough for short jargon phrases;
      // revisit with word-boundary regex if false positives show up
      let idx = lower.indexOf(term);
      while (idx !== -1) {
        hits++;
        idx = lower.indexOf(term, idx + term.length);
      }
    }
    if (hits === 0) continue;
    if (hits < minHits) continue; // doesn't clear the bar at all — no tag

    const confidence: TagResult["confidence"] = hits >= minHits + 1 || minHits === 1 ? "high" : "low";
    results.push({ tag, category, confidence });
  }

  return results;
}

export interface ClassifyInput {
  title: string;
  description: string;
  transcript?: string;
}

export interface ClassifyOutput {
  tags: TagResult[];
  needsLlmTiebreak: boolean; // true when strategy/methodology got zero hits — ambiguous, worth an LLM pass
}

export function keywordClassify(input: ClassifyInput): ClassifyOutput {
  // Title + description first (cheap, always available); transcript adds
  // recall but is optional so classification can still run before the
  // transcript pipeline has caught up.
  const text = [input.title, input.description, input.transcript ?? ""].join("\n");

  const tags: TagResult[] = [
    ...scoreDictionary(text, INSTRUMENT_TERMS, "instrument"),
    ...scoreDictionary(text, METHODOLOGY_TERMS, "methodology"),
    ...scoreDictionary(text, STRATEGY_TERMS, "strategy"),
    ...scoreDictionary(text, FORMAT_TERMS, "format"),
  ];

  const hasMethodology = tags.some((t) => t.category === "methodology");
  const hasStrategy = tags.some((t) => t.category === "strategy");

  return {
    tags,
    needsLlmTiebreak: !hasMethodology || !hasStrategy,
  };
}
