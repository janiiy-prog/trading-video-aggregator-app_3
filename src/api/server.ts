import "dotenv/config";
import express from "express";
import { videosRouter } from "./routes/videos.js";
import { facetsRouter } from "./routes/facets.js";
import { channelsRouter } from "./routes/channels.js";
import { savedSearchesRouter } from "./routes/savedSearches.js";

const app = express();
app.use(express.json());

// Manual CORS — the frontend is a separate origin (Vercel/Netlify) hitting
// this API directly. Tighten allowed origin(s) before going to production.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-user-id");
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(videosRouter);
app.use(facetsRouter);
app.use(channelsRouter);
app.use(savedSearchesRouter);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Basic error handler so thrown errors (e.g. missing x-user-id, zod parse
// failures) come back as JSON instead of crashing the process.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(400).json({ error: err.message ?? "bad request" });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`API listening on :${port}`));
