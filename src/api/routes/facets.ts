import { Router } from "express";
import { pool } from "../../db/client.js";
import { filterSpecFromQuery, TAG_CATEGORIES } from "../../shared/filterSpec.js";
import { buildVideoWhere } from "../../shared/buildVideoQuery.js";

export const facetsRouter = Router();

// Returns counts per tag, scoped to whatever filters are already applied
// (so e.g. selecting instrument=ES narrows the methodology counts shown
// next to it) — this is what powers "ICT (342)" style labels in the sidebar.
facetsRouter.get("/facets", async (req, res) => {
  const filter = filterSpecFromQuery(req.query as Record<string, unknown>);
  const { whereSql, params } = buildVideoWhere(filter);

  const sql = `
    select t.category, t.tag, count(distinct v.id) as count
    from videos v
    join tags t on t.video_id = v.id
    where ${whereSql}
    group by t.category, t.tag
    order by t.category, count desc
  `;

  const { rows } = await pool.query(sql, params);

  const facets: Record<string, Array<{ tag: string; count: number }>> = {};
  for (const category of TAG_CATEGORIES) facets[category] = [];
  for (const row of rows) {
    facets[row.category].push({ tag: row.tag, count: Number(row.count) });
  }

  res.json({ facets });
});
