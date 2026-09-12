import "dotenv/config";
import { pool } from "../../db/client.js";
import { keywordClassify } from "./keywordClassify.js";
import { llmTiebreak } from "./llmTiebreak.js";

const BATCH_SIZE = 50;

async function run() {
  // videos_classified_at_idx (partial index on classified_at is null) makes
  // this a cheap queue query even at 100k+ rows.
  const { rows: videos } = await pool.query(
    `
    select v.id, v.title, v.description, tr.text as transcript_text
    from videos v
    left join transcripts tr on tr.video_id = v.id
    where v.classified_at is null
    order by v.published_at desc
    limit $1
    `,
    [BATCH_SIZE]
  );

  console.log(`Classifying ${videos.length} video(s)...`);

  for (const video of videos) {
    const input = { title: video.title, description: video.description, transcript: video.transcript_text ?? undefined };
    const { tags: keywordTags, needsLlmTiebreak } = keywordClassify(input);

    let allTags = keywordTags;
    if (needsLlmTiebreak) {
      const llmTags = await llmTiebreak(input);
      allTags = [...keywordTags, ...llmTags];
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const tag of allTags) {
        await client.query(
          `insert into tags (video_id, tag, category, confidence)
           values ($1, $2, $3, $4)
           on conflict (video_id, tag, category) do nothing`,
          [video.id, tag.tag, tag.category, tag.confidence]
        );
      }
      await client.query(`update videos set classified_at = now() where id = $1`, [video.id]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      console.error(`Failed to classify video ${video.id}:`, err);
    } finally {
      client.release();
    }
  }

  await pool.end();
}

run();
