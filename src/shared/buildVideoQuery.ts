import type { FilterSpec } from "./filterSpec.js";

/**
 * Builds the WHERE clause + params shared by /videos, /facets, and the
 * saved-search matcher, so filter behavior can't drift between them.
 *
 * Tag filters (instrument/strategy/methodology/format/timeframe) are AND'd
 * across categories, OR'd within a category — e.g. instrument=[ES,SPX] AND
 * methodology=[ICT] means (ES or SPX) and ICT.
 */
export function buildVideoWhere(filter: FilterSpec, opts: { sinceClassifiedAt?: string } = {}) {
  const clauses: string[] = ["v.classified_at is not null"]; // only show videos that finished the pipeline
  const params: unknown[] = [];

  const tagCategories = ["instrument", "strategy", "methodology", "format", "timeframe"] as const;
  for (const category of tagCategories) {
    const values = filter[category];
    if (!values || values.length === 0) continue;
    params.push(category, values);
    clauses.push(`
      exists (
        select 1 from tags t
        where t.video_id = v.id
          and t.category = $${params.length - 1}
          and t.tag = any($${params.length}::text[])
      )
    `);
  }

  if (filter.q) {
    params.push(filter.q);
    clauses.push(`(
      v.search_vector @@ plainto_tsquery('english', $${params.length})
      or exists (
        select 1 from transcripts tr
        where tr.video_id = v.id
          and tr.search_vector @@ plainto_tsquery('english', $${params.length})
      )
    )`);
  }

  if (filter.date_from) {
    params.push(filter.date_from);
    clauses.push(`v.published_at >= $${params.length}`);
  }
  if (filter.date_to) {
    params.push(filter.date_to);
    clauses.push(`v.published_at <= $${params.length}`);
  }

  if (opts.sinceClassifiedAt) {
    params.push(opts.sinceClassifiedAt);
    clauses.push(`v.classified_at > $${params.length}`);
  }

  return { whereSql: clauses.join(" and "), params };
}
