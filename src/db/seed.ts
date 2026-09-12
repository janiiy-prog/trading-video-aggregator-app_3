import "dotenv/config";
import { pool } from "./client.js";

// Replace with real curated channel IDs before running — these are
// placeholders. Find a channel's ID via its "About" page > Share channel,
// or the URL if it's already in /channel/UC... form.
const CURATED_CHANNELS: Array<{ name: string; youtubeChannelId: string }> = [
  // { name: "Example Trading Channel", youtubeChannelId: "UCxxxxxxxxxxxxxxxxxxxxxx" },
];

async function seed() {
  if (CURATED_CHANNELS.length === 0) {
    console.log("No channels in CURATED_CHANNELS — edit src/db/seed.ts and add some, then re-run.");
    return;
  }
  for (const ch of CURATED_CHANNELS) {
    await pool.query(
      `insert into channels (name, youtube_channel_id, tier) values ($1, $2, 'curated')
       on conflict (youtube_channel_id) do nothing`,
      [ch.name, ch.youtubeChannelId]
    );
  }
  console.log(`Seeded ${CURATED_CHANNELS.length} channel(s).`);
  await pool.end();
}

seed();
