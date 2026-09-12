import { Router } from "express";
import { pool } from "../../db/client.js";

export const channelsRouter = Router();

channelsRouter.get("/channels", async (_req, res) => {
  const { rows } = await pool.query(
    `select id, name, youtube_channel_id, tier, created_at from channels order by name`
  );
  res.json({ channels: rows });
});
