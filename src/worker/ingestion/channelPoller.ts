import "dotenv/config";
import { pool } from "../../db/client.js";

// Polls each curated channel's "uploads" playlist via playlistItems.list
// (~1 quota unit/call vs. 100 for search.list — see design doc Section 9).
// New video IDs are inserted with classified_at = null so the classification
// worker's queue query (videos_classified_at_idx) picks them up next run.

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY not set");

interface PlaylistItem {
  contentDetails: { videoId: string; videoPublishedAt: string };
  snippet: { title: string; description: string };
}

async function getUploadsPlaylistId(channelId: string): Promise<string> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  const playlistId = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new Error(`No uploads playlist found for channel ${channelId}`);
  return playlistId;
}

async function fetchPlaylistItems(playlistId: string, pageToken?: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", playlistId);
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", YOUTUBE_API_KEY!);
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ items: PlaylistItem[]; nextPageToken?: string }>;
}

async function pollChannel(channelDbId: string, youtubeChannelId: string) {
  const playlistId = await getUploadsPlaylistId(youtubeChannelId);
  let pageToken: string | undefined;
  let newCount = 0;

  // Only need to page back far enough to hit videos we've already seen —
  // in steady state this is usually just the first page.
  do {
    const { items, nextPageToken } = await fetchPlaylistItems(playlistId, pageToken);

    for (const item of items) {
      const { rowCount } = await pool.query(
        `insert into videos (channel_id, youtube_video_id, title, description, published_at)
         values ($1, $2, $3, $4, $5)
         on conflict (youtube_video_id) do nothing`,
        [channelDbId, item.contentDetails.videoId, item.snippet.title, item.snippet.description, item.contentDetails.videoPublishedAt]
      );
      if (rowCount) newCount++;
      else {
        // Hit a video we've already ingested — assume everything older on
        // this channel is also already known, and stop paging.
        pageToken = undefined;
        break;
      }
    }
    pageToken = nextPageToken;
  } while (pageToken);

  return newCount;
}

async function run() {
  const { rows: channels } = await pool.query(
    `select id, youtube_channel_id, name from channels where tier = 'curated'`
  );

  for (const channel of channels) {
    try {
      const newCount = await pollChannel(channel.id, channel.youtube_channel_id);
      console.log(`${channel.name}: ${newCount} new video(s)`);
    } catch (err) {
      // One bad channel shouldn't kill the whole run.
      console.error(`Failed to poll ${channel.name}:`, err);
    }
  }

  await pool.end();
}

run();
