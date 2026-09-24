import { Router } from "express";
import { pool } from "../../db/client.js";
import { filterSpecFromQuery } from "../../shared/filterSpec.js";
import { buildVideoWhere } from "../../shared/buildVideoQuery.js";

export const videosRouter = Router();

const PAGE_SIZE = 20;

videosRouter.get("/videos", async (req, res) => {
  const filter = filterSpecFromQuery(req.query as Record<string, unknown>);
  const page = Math.max(1, Number(req.query.page) || 1);
  const sort = (req.query.sort as string) || "newest";

  const { whereSql, params } = buildVideoWhere(filter);

  const orderSql =
    sort === "most_viewed" ? "v.view_count desc nulls last"
    : sort === "relevance" && filter.q ? `ts_rank(v.search_vector, plainto_tsquery('english', $${params.length + 1})) desc`
    : "v.published_at desc";

  // relevance sort needs the query term again for ts_rank — reuse the same param list
  const orderParams = sort === "relevance" && filter.q ? [...params, filter.q] : params;

  const offset = (page - 1) * PAGE_SIZE;

  // Only pull a transcript snippet when there's a search term — otherwise
  // there's nothing meaningful to excerpt around, and it's wasted work.
  let snippetSelect = "null as snippet";
  let snippetParamIndex: number | null = null;
  if (filter.q) {
    orderParams.push(filter.q);
    snippetParamIndex = orderParams.length;
    snippetSelect = `
      (
        select ts_headline(
          'english', tr.text, plainto_tsquery('english', $${snippetParamIndex}),
          'StartSel=,StopSel=,MaxWords=40,MinWords=15'
        )
        from transcripts tr where tr.video_id = v.id
      ) as snippet
    `;
  }

  orderParams.push(PAGE_SIZE, offset);

  const sql = `
    select
      v.id, v.youtube_video_id, v.title, v.description, v.published_at, v.duration_seconds, v.view_count,
      c.name as channel_name,
      ${snippetSelect},
      coalesce(
        json_agg(json_build_object('tag', t.tag, 'category', t.category, 'confidence', t.confidence))
          filter (where t.id is not null),
        '[]'
      ) as tags
    from videos v
    join channels c on c.id = v.channel_id
    left join tags t on t.video_id = v.id
    where ${whereSql}
    group by v.id, c.name
    order by ${orderSql}
    limit $${orderParams.length - 1} offset $${orderParams.length}
  `;

  const { rows } = await pool.query(sql, orderParams);
  res.json({ videos: rows, page, page_size: PAGE_SIZE });
});

videosRouter.get("/videos/:id", async (req, res) => {
  const { rows } = await pool.query(
    `
    select
      v.*,
      c.name as channel_name, c.youtube_channel_id,
      tr.text as transcript_text,
      coalesce(
        json_agg(json_build_object('tag', t.tag, 'category', t.category, 'confidence', t.confidence))
          filter (where t.id is not null),
        '[]'
      ) as tags
    from videos v
    join channels c on c.id = v.channel_id
    left join transcripts tr on tr.video_id = v.id
    left join tags t on t.video_id = v.id
    where v.id = $1
    group by v.id, c.name, c.youtube_channel_id, tr.text
    `,
    [req.params.id]
  );

  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});
