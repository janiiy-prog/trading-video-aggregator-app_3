# Trading Video Aggregator — full scaffold

Implements: DB schema, `/videos` `/facets` `/channels` `/saved-searches` API,
curated-channel ingestion poller, keyword-first classification pipeline with
LLM tiebreak, caption-scraping transcript provider, saved-search digest cron,
a frontend (`frontend/`) wired to the real API, and deploy configs for
Render + Vercel. Matches the architecture in `trading-video-aggregator-design.md`.

Not yet built: real auth (currently a stopgap that treats the `x-user-id`
header as an email and upserts a `users` row), Whisper transcript fallback.

## Setup

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL at minimum (YOUTUBE_API_KEY/ANTHROPIC_API_KEY only
# needed for the real ingestion/classification workers, see below)

npm run migrate          # creates tables
```

### Fast path: fake data (no YouTube API key needed)

To see the whole system working end-to-end immediately:

```bash
npm run seed:fake        # inserts ~7 realistic fake videos, channels, transcripts, and tags
npm run dev:api          # API on :3000
```

Then open the frontend (`frontend/`, a Vite project — see Deploying below for
running it locally with `npm run dev` or deployed on Vercel) with `VITE_API_BASE`
pointed at `http://localhost:3000`. You should see real facet counts, working
search with transcript snippets, and a working "save search" against the
actual `/saved-searches` endpoint. Re-running `npm run seed:fake` is safe —
it upserts rather than duplicating.

### Real path: actual YouTube ingestion

```bash
# also fill in YOUTUBE_API_KEY and ANTHROPIC_API_KEY in .env
# edit src/db/seed.ts with real curated channel IDs, then:
npx tsx src/db/seed.ts
```

## Running

```bash
npm run dev:api                 # API on :3000
npm run dev:worker:poll         # one-shot: pull new videos from curated channels
npx tsx src/worker/transcripts/runTranscripts.ts   # one-shot: fetch captions for new videos
npm run dev:worker:classify     # one-shot: classify anything unclassified
npm run dev:worker:digest       # one-shot: check saved searches, send digest emails for new matches
```

The digest cron reuses `buildVideoWhere` (same function `/videos` and
`/saved-searches/:id/matches` use), scoped to videos classified since each
search's `last_notified_at` (or `created_at` on first run). It dedupes
against the `notifications` table so a video is never emailed twice for the
same saved search, and skips advancing `last_notified_at` on send failure so
a bad run retries the same window next time rather than losing matches.

Saved searches now require a `users` row (added in migration 002) — the
`/saved-searches` routes treat the `x-user-id` header as an email and
upsert a user automatically, purely as a stopgap until real auth exists.

In production the three worker scripts are cron jobs (or a `pg-boss`
schedule) rather than manually run — `pg-boss` is already a dependency for
when that's wired up.

## Try the API

```bash
curl http://localhost:3000/videos?instrument=ES&methodology=ICT
curl http://localhost:3000/facets
curl -X POST http://localhost:3000/saved-searches \
  -H "Content-Type: application/json" -H "x-user-id: test@example.com" \
  -d '{"name":"ICT ES scalping","filter_spec":{"instrument":["ES"],"methodology":["ICT"]}}'
```

## Deploying

**Backend (Render, via the included `render.yaml` blueprint):**

1. Push this repo to GitHub.
2. In Render: New → Blueprint → point at the repo. It reads `render.yaml`
   and creates the API web service, a managed Postgres, and four cron jobs
   (channel poller, transcripts, classification, digest) on staggered
   schedules so each stage has data from the one before it.
3. Fill in the `sync: false` env vars in the Render dashboard for each
   service that needs them (`YOUTUBE_API_KEY`, `ANTHROPIC_API_KEY`,
   `RESEND_API_KEY`, `DIGEST_FROM_EMAIL`) — these aren't committed to the repo.
4. Run migrations once against the new database:
   `DATABASE_URL=<from Render dashboard> npx tsx src/db/migrate.ts`
5. Set `CORS_ORIGIN` on the API service to your frontend's URL once step 2
   below gives you one (or leave it as `*` while testing).

Railway/Fly.io work too (Section 8's other options) — same `npm run build`
/ `npm start` commands, just configured through their own dashboards/CLIs
instead of a Render blueprint.

**Frontend (Vercel):**

1. In Vercel: New Project → same repo → set **Root Directory** to `frontend`.
   Vercel auto-detects Vite.
2. Add env var `VITE_API_BASE` = your Render API URL (e.g.
   `https://trading-video-api.onrender.com`).
3. Deploy. Update the backend's `CORS_ORIGIN` to this Vercel URL afterward.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `main`:
- **backend job** — typechecks, builds, runs migrations twice against a real
  Postgres service container (checking idempotency), seeds fake data, boots
  the API, and curls `/health`, `/videos`, `/facets`, `/channels`, and
  `POST /saved-searches` to confirm they actually return the right shape —
  then runs the digest cron once against that data.
- **frontend job** — a real `vite build`, not just a syntax check.
- **validate-render-yaml job** — confirms the blueprint is well-formed.

No `package-lock.json` is committed yet (this scaffold was built without
network access to run a real `npm install`) — run `npm install` once
locally in both `/` and `/frontend`, commit the resulting lockfiles, and
CI will start caching dependencies faster on top of what's already here.

## What to build next

1. **Real auth** — replace the email-as-`x-user-id` stopgap in
   `savedSearches.ts` and the frontend's hardcoded `demo-user@example.com`.
2. **Whisper fallback** — implement `TranscriptProvider` for Approach B,
   only once `runTranscripts.ts`'s failure-rate log shows it's needed.
3. **Human correction/curation of auto-tags** and **channel credibility
   scoring** — both explicitly deferred in the design doc's Section 10.
