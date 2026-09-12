import "dotenv/config";
import { pool } from "./client.js";

// Bypasses the real ingestion/transcript/classification pipeline entirely —
// inserts realistic-looking rows directly so you can bring up the API +
// frontend and see real data flow through (facet counts, search snippets,
// tag confidence) without a YouTube API key or waiting on workers to run.
// Safe to re-run: uses ON CONFLICT DO NOTHING throughout.

const CHANNELS = [
  { name: "Level II Desk", youtubeChannelId: "FAKE_channel_1" },
  { name: "QuietMarkets", youtubeChannelId: "FAKE_channel_2" },
  { name: "The Kill Zone", youtubeChannelId: "FAKE_channel_3" },
  { name: "Premium Sellers Club", youtubeChannelId: "FAKE_channel_4" },
];

const VIDEOS = [
  {
    channel: "Level II Desk",
    title: "ES Open Range + Order Blocks — Full Morning Session Recap",
    description: "Live recap of the ES morning session with order block entries.",
    daysAgo: 2, durationSeconds: 2292, viewCount: 12400,
    transcript: "we're watching the fair value gap left over from the overnight session, and if price sweeps that liquidity below the Asian low before nine thirty five, that's our confirmation for a long into the order block. This is a classic ICT setup with a clear judas swing before the real move.",
    tags: [
      { tag: "ES", category: "instrument", confidence: "high" },
      { tag: "ICT", category: "methodology", confidence: "high" },
      { tag: "Order Flow", category: "methodology", confidence: "high" },
      { tag: "Day Trading", category: "strategy", confidence: "high" },
      { tag: "Live/Recap", category: "format", confidence: "high" },
    ],
  },
  {
    channel: "QuietMarkets",
    title: "Anchored VWAP Reversion Setups on SPY — Live Walkthrough",
    description: "Walking through anchored VWAP reversion trades on SPY.",
    daysAgo: 5, durationSeconds: 1443, viewCount: 6100,
    transcript: "anchor the VWAP to the prior day's high, then wait for a two standard deviation stretch, that's usually where I start scaling into the reversion trade against the anchored vwap band.",
    tags: [
      { tag: "SPY", category: "instrument", confidence: "high" },
      { tag: "SPX", category: "instrument", confidence: "high" },
      { tag: "VWAP", category: "methodology", confidence: "high" },
      { tag: "Day Trading", category: "strategy", confidence: "high" },
      { tag: "Tutorial", category: "format", confidence: "high" },
    ],
  },
  {
    channel: "The Kill Zone",
    title: "Why Everyone's ICT Silver Bullet Entries Are Late (Judas Swing Explained)",
    description: "Breaking down why late silver bullet entries happen.",
    daysAgo: 7, durationSeconds: 1007, viewCount: 31200,
    transcript: "the judas swing isn't a trick, it's just liquidity engineering, the algo needs your stop before it can deliver price to the real target in the kill zone during the silver bullet window.",
    tags: [
      { tag: "ES", category: "instrument", confidence: "high" },
      { tag: "NQ", category: "instrument", confidence: "high" },
      { tag: "ICT", category: "methodology", confidence: "high" },
      { tag: "Scalping", category: "strategy", confidence: "high" },
      { tag: "Analysis", category: "format", confidence: "high" },
    ],
  },
  {
    channel: "Premium Sellers Club",
    title: "0DTE Iron Condors on SPX: Theta Decay Mechanics for Beginners",
    description: "Beginner walkthrough of 0DTE iron condor mechanics on SPX.",
    daysAgo: 3, durationSeconds: 1195, viewCount: 8900,
    transcript: "once gamma exposure flips negative into the close, theta decay accelerates fast, that's why most zero dte condors are managed before the last hour of the session.",
    tags: [
      { tag: "SPX", category: "instrument", confidence: "high" },
      { tag: "Options-on-SPX", category: "instrument", confidence: "high" },
      { tag: "Indicator-based", category: "methodology", confidence: "low" },
      { tag: "Options Income", category: "strategy", confidence: "high" },
      { tag: "Tutorial", category: "format", confidence: "high" },
    ],
  },
  {
    channel: "Level II Desk",
    title: "Footprint Chart Basics: Reading Bid/Ask Imbalance Live on ES",
    description: "Introduction to footprint charts and order flow reading.",
    daysAgo: 6, durationSeconds: 1664, viewCount: 9700,
    transcript: "the absorption at the point of control is the tell, aggressive sellers hit the bid repeatedly but the delta doesn't confirm, so we fade the move using the footprint chart imbalance.",
    tags: [
      { tag: "ES", category: "instrument", confidence: "high" },
      { tag: "Order Flow", category: "methodology", confidence: "high" },
      { tag: "Scalping", category: "strategy", confidence: "high" },
      { tag: "Tutorial", category: "format", confidence: "high" },
    ],
  },
  {
    channel: "Premium Sellers Club",
    title: "FOMC Day Playbook for SPX Options Traders",
    description: "How to trade SPX options around FOMC announcements.",
    daysAgo: 1, durationSeconds: 860, viewCount: 18600,
    transcript: "implied vol usually crushes within the first fifteen minutes after the statement drops, so if you're short premium going into the fed rate decision, that's your window to manage risk.",
    tags: [
      { tag: "SPX", category: "instrument", confidence: "high" },
      { tag: "Indicator-based", category: "methodology", confidence: "low" },
      { tag: "Options Income", category: "strategy", confidence: "high" },
      { tag: "Q&A", category: "format", confidence: "high" },
    ],
  },
  {
    channel: "QuietMarkets",
    title: "Backtesting a Simple VWAP Bounce Strategy — 6 Months of ES Data",
    description: "Backtest results for a VWAP bounce strategy on ES futures.",
    daysAgo: 8, durationSeconds: 1989, viewCount: 5400,
    transcript: "across one hundred eighteen trading days, the bounce held on the first touch about sixty one percent of the time, but that number drops sharply on trend days away from vwap.",
    tags: [
      { tag: "ES", category: "instrument", confidence: "high" },
      { tag: "VWAP", category: "methodology", confidence: "high" },
      { tag: "Day Trading", category: "strategy", confidence: "high" },
      { tag: "Backtest", category: "format", confidence: "high" },
    ],
  },
];

async function seed() {
  const channelIds: Record<string, string> = {};

  for (const ch of CHANNELS) {
    const { rows } = await pool.query(
      `insert into channels (name, youtube_channel_id, tier) values ($1, $2, 'curated')
       on conflict (youtube_channel_id) do update set name = excluded.name
       returning id`,
      [ch.name, ch.youtubeChannelId]
    );
    channelIds[ch.name] = rows[0].id;
  }

  for (const [i, v] of VIDEOS.entries()) {
    const youtubeVideoId = `FAKE_video_${i + 1}`;
    const publishedAt = new Date(Date.now() - v.daysAgo * 86400000).toISOString();

    const { rows } = await pool.query(
      `insert into videos (channel_id, youtube_video_id, title, description, published_at, duration_seconds, view_count, classified_at)
       values ($1, $2, $3, $4, $5, $6, $7, now())
       on conflict (youtube_video_id) do update set title = excluded.title
       returning id`,
      [channelIds[v.channel], youtubeVideoId, v.title, v.description, publishedAt, v.durationSeconds, v.viewCount]
    );
    const videoId = rows[0].id;

    await pool.query(
      `insert into transcripts (video_id, text, source) values ($1, $2, 'caption')
       on conflict (video_id) do update set text = excluded.text`,
      [videoId, v.transcript]
    );

    for (const tag of v.tags) {
      await pool.query(
        `insert into tags (video_id, tag, category, confidence) values ($1, $2, $3, $4)
         on conflict (video_id, tag, category) do nothing`,
        [videoId, tag.tag, tag.category, tag.confidence]
      );
    }
  }

  console.log(`Seeded ${CHANNELS.length} channels and ${VIDEOS.length} videos (with transcripts + tags).`);
  await pool.end();
}

seed();
