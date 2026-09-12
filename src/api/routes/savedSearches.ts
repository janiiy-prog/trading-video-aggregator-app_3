import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/client.js";
import { FilterSpecSchema } from "../../shared/filterSpec.js";
import { buildVideoWhere } from "../../shared/buildVideoQuery.js";

export const savedSearchesRouter = Router();

// NOTE: real auth should replace this. For now the x-user-id header is
// treated as an email and upserted into `users`, so saved_searches.user_id
// has a real row to satisfy its foreign key — and the digest cron has an
// email address to send to.
async function getUserId(req: any): Promise<string> {
  const email = req.header("x-user-id");
  if (!email) throw new Error("x-user-id header required (auth not wired up yet — send an email address)");
  const { rows } = await pool.query(
    `insert into users (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  );
  return rows[0].id;
}

const CreateSavedSearchSchema = z.object({
  name: z.string().min(1),
  filter_spec: FilterSpecSchema,
});

savedSearchesRouter.post("/saved-searches", async (req, res) => {
  const userId = await getUserId(req);
  const body = CreateSavedSearchSchema.parse(req.body);

  const { rows } = await pool.query(
    `insert into saved_searches (user_id, name, filter_spec) values ($1, $2, $3) returning *`,
    [userId, body.name, body.filter_spec]
  );
  res.status(201).json(rows[0]);
});

savedSearchesRouter.get("/saved-searches", async (req, res) => {
  const userId = await getUserId(req);
  const { rows } = await pool.query(
    `select * from saved_searches where user_id = $1 order by created_at desc`,
    [userId]
  );
  res.json({ saved_searches: rows });
});

savedSearchesRouter.delete("/saved-searches/:id", async (req, res) => {
  const userId = await getUserId(req);
  await pool.query(`delete from saved_searches where id = $1 and user_id = $2`, [req.params.id, userId]);
  res.status(204).send();
});

// Preview what a saved search currently matches — same filter logic the cron
// sweep uses, exposed so the UI can show "this would match 14 videos" live.
savedSearchesRouter.get("/saved-searches/:id/matches", async (req, res) => {
  const userId = await getUserId(req);
  const { rows: searches } = await pool.query(
    `select * from saved_searches where id = $1 and user_id = $2`,
    [req.params.id, userId]
  );
  if (searches.length === 0) return res.status(404).json({ error: "not found" });

  const { whereSql, params } = buildVideoWhere(searches[0].filter_spec);
  const { rows } = await pool.query(
    `select v.id, v.title, v.published_at from videos v where ${whereSql} order by v.published_at desc limit 50`,
    params
  );
  res.json({ matches: rows });
});
