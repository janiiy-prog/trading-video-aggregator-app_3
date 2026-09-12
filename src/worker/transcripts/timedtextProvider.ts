import type { TranscriptProvider, TranscriptResult } from "./transcriptProvider.js";

// Approach A (primary) from design doc Section 9: free, off-quota, but an
// undocumented endpoint that YouTube can change/block without warning.
// Fails cleanly (returns null) when captions are disabled — the caller
// falls back to WhisperTranscriptProvider in that case.
export class TimedTextProvider implements TranscriptProvider {
  async fetch(youtubeVideoId: string): Promise<TranscriptResult | null> {
    // Step 1: get the caption track list from the video's timedtext list endpoint.
    const listUrl = `https://video.google.com/timedtext?type=list&v=${youtubeVideoId}`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) return null;
    const listXml = await listRes.text();

    // Prefer English, prefer manual captions over auto-generated (kind="asr").
    const trackMatch =
      listXml.match(/<track[^>]*lang_code="en"[^>]*(?!kind="asr")[^>]*\/>/)?.[0] ??
      listXml.match(/<track[^>]*lang_code="en"[^>]*\/>/)?.[0];
    if (!trackMatch) return null; // no English captions — caller should try Whisper fallback

    const name = trackMatch.match(/name="([^"]*)"/)?.[1] ?? "";

    // Step 2: fetch the actual transcript in that track.
    const transcriptUrl = `https://video.google.com/timedtext?lang=en&v=${youtubeVideoId}${name ? `&name=${encodeURIComponent(name)}` : ""}`;
    const transcriptRes = await fetch(transcriptUrl);
    if (!transcriptRes.ok) return null;
    const xml = await transcriptRes.text();

    const text = [...xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
      .map((m) => decodeXmlEntities(m[1]))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) return null;
    return { text, source: "caption" };
  }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
