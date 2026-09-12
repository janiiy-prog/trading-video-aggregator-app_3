const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL ?? "alerts@yourdomain.com";

export interface DigestVideo {
  id: string; // internal UUID, used for the notifications dedup table
  youtube_video_id: string;
  title: string;
  published_at: string;
}

export async function sendDigestEmail(to: string, searchName: string, videos: DigestVideo[]): Promise<void> {
  if (!RESEND_API_KEY) {
    // Don't crash the cron run over a missing key in dev — just log what
    // would have been sent, so the matching logic can still be tested.
    console.log(`[digest email skipped, no RESEND_API_KEY] Would send to ${to}: "${searchName}" (${videos.length} new video(s))`);
    return;
  }

  const listHtml = videos
    .map((v) => `<li><a href="https://youtube.com/watch?v=${v.youtube_video_id}">${escapeHtml(v.title)}</a></li>`)
    .join("");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject: `${videos.length} new video${videos.length !== 1 ? "s" : ""} matched "${searchName}"`,
      html: `<p>New videos matching your saved search "${escapeHtml(searchName)}":</p><ul>${listHtml}</ul>`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error ${res.status}: ${await res.text()}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
