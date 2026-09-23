import "dotenv/config";
import { pool } from "./client.js";

const CURATED_CHANNELS: Array<{ name: string; youtubeChannelId: string }> = [];

async function seed() {
  if (CURATED_CHANNELS.length === 0) {
    console.log("No curated channels configured — skipping (using keyword discovery instead).");
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
