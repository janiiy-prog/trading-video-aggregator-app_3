// Interface so the fallback ratio (caption scraping vs. Whisper ASR) is
// swappable without a pipeline rewrite — per design doc Section 9's
// explicit call-out that this is the riskiest piece.

export interface TranscriptResult {
  text: string;
  source: "caption" | "whisper";
}

export interface TranscriptProvider {
  fetch(youtubeVideoId: string): Promise<TranscriptResult | null>; // null = no transcript available from this provider
}
