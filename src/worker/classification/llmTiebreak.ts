import type { TagResult } from "./keywordClassify.js";
import type { ClassifyInput } from "./keywordClassify.js";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const STRATEGY_OPTIONS = ["Scalping", "Day Trading", "Swing", "Options Income"] as const;
const METHODOLOGY_OPTIONS = ["ICT", "VWAP", "Price Action", "Order Flow", "Elliott Wave", "Indicator-based"] as const;

// Called only when the keyword pass left strategy or methodology empty —
// this is the "LLM classification only for ambiguous remainders" step from
// design doc Section 4, kept as a narrow, cheap, structured-output call.
export async function llmTiebreak(input: ClassifyInput): Promise<TagResult[]> {
  if (!ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY not set — skipping LLM tiebreak, video stays keyword-only tagged");
    return [];
  }

  const prompt = `You are classifying a trading YouTube video. Based on the title and description
below, pick the single best-fitting strategy type and methodology from these closed lists —
or "none" if genuinely none apply. Respond with ONLY a JSON object, no other text:
{"strategy": "<one of ${STRATEGY_OPTIONS.join(" | ")} | none>", "methodology": "<one of ${METHODOLOGY_OPTIONS.join(" | ")} | none>"}

Title: ${input.title}
Description: ${input.description.slice(0, 500)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error(`LLM tiebreak call failed: ${res.status} ${await res.text()}`);
    return [];
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
   const text = data.content?.find((b) => b.type === "text")?.text ?? "{}";

  let parsed: { strategy?: string; methodology?: string };
  try {
    parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch {
    console.error("LLM tiebreak returned unparseable JSON:", text);
    return [];
  }

  const tags: TagResult[] = [];
  if (parsed.strategy && parsed.strategy !== "none") {
    tags.push({ tag: parsed.strategy, category: "strategy", confidence: "low" }); // LLM-only tags start as low-confidence/unverified
  }
  if (parsed.methodology && parsed.methodology !== "none") {
    tags.push({ tag: parsed.methodology, category: "methodology", confidence: "low" });
  }
  return tags;
}
