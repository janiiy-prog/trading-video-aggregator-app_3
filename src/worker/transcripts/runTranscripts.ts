import "dotenv/config";
import { pool } from "../../db/client.js";
import { TimedTextProvider } from "./timedtextProvider.js";

const BATCH_SIZE = 50;
const provider = new TimedTextProvider();

async function run() {
  const { rows: videos } = await pool.query(
    `
    select v.id, v.youtube_video_id
    from videos v
    left join transcripts tr on tr.video_id = v.id
    where tr.video_id is null
    order by v.published_at desc
    limit $1
    `,
    [BATCH_SIZE]
  );

  let succeeded = 0;
  let failed = 0;

  for (const video of videos) {
    const result = await provider.fetch(video.youtube_video_id);
    if (result) {
      await pool.query(
        `insert into transcripts (video_id, text, source) values ($1, $2, $3)
         on conflict (video_id) do nothing`,
        [video.id, result.text, result.source]
      );
      succeeded++;
    } else {
      // No fallback wired up yet — Whisper (Approach B) gets added here once
      // the failure rate below justifies the extra compute/storage cost.
      failed++;
    }
  }

  const failureRate = videos.length ? (failed / videos.length) * 100 : 0;
  console.log(`Transcripts: ${succeeded} fetched, ${failed} failed (${failureRate.toFixed(1)}% failure rate)`);
  // TODO: push failureRate to whatever metrics/alerting exists once it exists —
  // per design doc Section 9, a rising trend here is the signal to build the
  // Whisper fallback, not a one-off number to eyeball in logs.

  await pool.end();
}

run();
