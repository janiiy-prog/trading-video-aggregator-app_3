import "dotenv/config";
import { pool } from "../../db/client.js";

// Discovery Jobs > "Keyword search (YouTube API)" from the design doc's
// architecture diagram — this is the missing half of ingestion. Unlike
// channelPoller.ts (which only checks channels you've explicitly named),
// this searches ALL of YouTube for trading-related terms.
//
// Costs 100 quota units per search.list call against a 10,000/day default
// budget (design doc Section 9: "ration keyword search (~50 calls/day)") —
// this only uses a handful of terms per run, run once daily by the cron
// schedule, to stay well within that.

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY not set");

// A representative slice of the taxonomy from the classification
// dictionaries — broad enough to surface new channels, not so broad it
// burns quota fast. Edit this list any time; no other code needs to change.
const SEARCH_TERMS = [
  "SPX options trading",
  "ES futures day trading",
  "ICT trading strategy",
  "order flow trading futures",
  "VWAP trading strategy",
  "0DTE options trading",
  "futures scalping strategy",
  "SPX 0DTE",
];

interface SearchResultItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelId: string;
    channelTitle: string;
  };
}

async function searchYoutube(query: string): Promise<SearchResultItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("order", "date"); // bias toward recent uploads, matches "near-daily refresh" scale target
  url.searchParams.set("relevanceLanguage", "en");
  url.searchParams.set("key", YOUTUBE_API_KEY!);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`search.list failed for "${query}": ${res.status} ${await res.text()}`);
    return [];
  }
  const data = (await res.json()) as { items?: SearchResultItem[] };
  return data.items ?? [];
}

// Batches up to 50 video IDs per call (videos.list is cheap — 1 quota unit
// regardless of batch size) to backfill duration + view count, which
// search.list doesn't include.
async function fetchVideoDetails(videoIds: string[]): Promise<Map<string, { durationSeconds: number; viewCount: number }>> {
  const result = new Map<string, { durationSeconds: number; viewCount: number }>();
  if (videoIds.length === 0) return result;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "contentDetails,statistics");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("key", YOUTUBE_API_KEY!);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`videos.list failed: ${res.status} ${await res.text()}`);
    return result;
  }
  const data = (await res.json()) as {
    items?: Array<{ id: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string } }>;
  };

  for (const item of data.items ?? []) {
    result.set(item.id, {
      durationSeconds: item.contentDetails?.duration ? parseIso8601Duration(item.contentDetails.duration) : 0,
      viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : 0,
    });
  }
  return result;
}

// "PT1H2M10S" -> 3730. YouTube always returns this ISO 8601 duration format.
function parseIso8601Duration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

async function run() {
  let discoveredVideos = 0;
  let discoveredChannels = 0;

  for (const term of SEARCH_TERMS) {
    const items = await searchYoutube(term);
    if (items.length === 0) continue;

    const videoIds = items.map((i) => i.id.videoId);
    const details = await fetchVideoDetails(videoIds);

    for (const item of items) {
      // Insert the channel as "discovered" (vs. "curated") if we haven't seen it —
      // this is exactly the tier distinction the schema was built for.
      const channelResult = await pool.query(
        `insert into channels (name, youtube_channel_id, tier) values ($1, $2, 'discovered')
         on conflict (youtube_channel_id) do nothing
         returning id`,
        [item.snippet.channelTitle, item.snippet.channelId]
      );
      if (channelResult.rowCount) discoveredChannels++;

      const { rows: channelRows } = await pool.query(
        `select id from channels where youtube_channel_id = $1`,
        [item.snippet.channelId]
      );
      const channelId = channelRows[0].id;

      const detail = details.get(item.id.videoId);
      const videoResult = await pool.query(
        `insert into videos (channel_id, youtube_video_id, title, description, published_at, duration_seconds, view_count)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (youtube_video_id) do nothing`,
        [
          channelId,
          item.id.videoId,
          item.snippet.title,
          item.snippet.description,
          item.snippet.publishedAt,
          detail?.durationSeconds ?? null,
          detail?.viewCount ?? null,
        ]
      );
      if (videoResult.rowCount) discoveredVideos++;
    }
  }

  console.log(`Discovery: ${discoveredVideos} new video(s) across ${discoveredChannels} new channel(s), from ${SEARCH_TERMS.length} search term(s).`);
  await pool.end();
}

run();

