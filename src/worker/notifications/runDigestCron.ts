import "dotenv/config";
import { pool } from "../../db/client.js";
import { buildVideoWhere } from "../../shared/buildVideoQuery.js";
import { sendDigestEmail } from "./sendDigest.js";

// Batch sweep, not event-driven, per design doc Section 6: run this every
// few hours (cron/pg-boss schedule), not on every classified video.
// Digest, not per-video email — one message per saved search per run.

async function run() {
  const { rows: searches } = await pool.query(`
    select ss.id, ss.name, ss.filter_spec, ss.created_at, ss.last_notified_at, u.email
    from saved_searches ss
    join users u on u.id = ss.user_id
  `);

  console.log(`Checking ${searches.length} saved search(es)...`);

  for (const search of searches) {
    // sinceClassifiedAt anchors to last_notified_at once we've notified at
    // least once, otherwise created_at — so a brand-new saved search only
    // gets notified about videos classified after it was created, not the
    // entire backlog.
    const sinceClassifiedAt = search.last_notified_at ?? search.created_at;
    const { whereSql, params } = buildVideoWhere(search.filter_spec, { sinceClassifiedAt });

    // Anti-join against notifications so a video already sent for this
    // saved search (e.g. from an overlapping run window) never repeats —
    // belt-and-suspenders on top of the notifications unique constraint.
    params.push(search.id);
    const sql = `
      select v.id, v.youtube_video_id, v.title, v.published_at
      from videos v
      where ${whereSql}
        and not exists (
          select 1 from notifications n
          where n.saved_search_id = $${params.length} and n.video_id = v.id
        )
      order by v.published_at desc
      limit 50
    `;

    const { rows: matches } = await pool.query(sql, params);
    if (matches.length === 0) continue;

    try {
      await sendDigestEmail(search.email, search.name, matches);

      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const video of matches) {
          await client.query(
            `insert into notifications (saved_search_id, video_id, channel) values ($1, $2, 'email')
             on conflict (saved_search_id, video_id) do nothing`,
            [search.id, video.id]
          );
        }
        await client.query(`update saved_searches set last_notified_at = now() where id = $1`, [search.id]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }

      console.log(`"${search.name}" (${search.email}): sent digest with ${matches.length} video(s)`);
    } catch (err) {
      // One failed send/email shouldn't block the rest of the sweep, and
      // deliberately doesn't advance last_notified_at — next run retries
      // the same window rather than silently dropping these matches.
      console.error(`Failed to notify saved search "${search.name}":`, err);
    }
  }

  await pool.end();
}

run();
