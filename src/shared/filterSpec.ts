import { z } from "zod";

// The one filter shape used by: the frontend UI state, the /videos query
// params, and saved_searches.filter_spec (Section 3 of the design doc:
// "reused identically by the UI, the API query params, and saved searches").
// Keep this the single source of truth — every layer imports it rather than
// re-declaring its own shape.

export const TAG_CATEGORIES = ["instrument", "strategy", "methodology", "format", "timeframe"] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

export const FilterSpecSchema = z.object({
  instrument: z.array(z.string()).optional(),
  strategy: z.array(z.string()).optional(),
  methodology: z.array(z.string()).optional(),
  format: z.array(z.string()).optional(),
  timeframe: z.array(z.string()).optional(),
  q: z.string().optional(), // free-text search (title/description/transcript)
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

export type FilterSpec = z.infer<typeof FilterSpecSchema>;

/**
 * Parses a filter_spec out of Express query params, e.g.
 *   ?instrument=ES&instrument=SPX&methodology=ICT&q=order+block
 * Query params that repeat become arrays; single values become single-item arrays.
 */
export function filterSpecFromQuery(query: Record<string, unknown>): FilterSpec {
  const toArray = (v: unknown): string[] | undefined => {
    if (v === undefined) return undefined;
    return Array.isArray(v) ? (v as string[]) : [v as string];
  };

  return FilterSpecSchema.parse({
    instrument: toArray(query.instrument),
    strategy: toArray(query.strategy),
    methodology: toArray(query.methodology),
    format: toArray(query.format),
    timeframe: toArray(query.timeframe),
    q: query.q as string | undefined,
    date_from: query.date_from as string | undefined,
    date_to: query.date_to as string | undefined,
  });
}
