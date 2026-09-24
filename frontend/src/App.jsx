import React, { useState, useMemo, useEffect } from "react";
import { Search, Clock, Eye, ChevronDown, ChevronRight, X, Bell, PlayCircle, ExternalLink, Loader2 } from "lucide-react";

// Locally this falls back to the default `npm run dev:api` port. In
// production, set VITE_API_BASE in Vercel's project env vars to the
// deployed API's URL (e.g. https://trading-video-api.onrender.com).
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

const FACET_LABELS = {
  instrument: "Instrument",
  methodology: "Methodology",
  strategy: "Strategy",
  format: "Format",
};

const SORT_TO_API = { Newest: "newest", Relevance: "relevance", "Most viewed": "most_viewed" };

const CONF_STYLE = {
  high: "border-[#D9B45C] text-[#8A6512] bg-[#FBF3DE]",
  low: "border-[#DDE1E6] text-[#5B6270] bg-transparent",
};

// ---------- Formatting helpers (API returns raw timestamps/numbers, not display strings) ----------

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  return `${weeks} weeks ago`;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatViews(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// ---------- API layer ----------

function buildQueryParams({ selected, query, sort, page }) {
  const params = new URLSearchParams();
  for (const [facet, values] of Object.entries(selected)) {
    for (const v of values) params.append(facet, v);
  }
  if (query) params.set("q", query);
  params.set("sort", SORT_TO_API[sort] ?? "newest");
  params.set("page", String(page));
  return params;
}

async function fetchVideos({ selected, query, sort, page }) {
  const params = buildQueryParams({ selected, query, sort, page });
  const res = await fetch(`${API_BASE}/videos?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load videos (${res.status})`);
  return res.json();
}

async function fetchFacets({ selected, query }) {
  const params = buildQueryParams({ selected, query, sort: "Newest", page: 1 });
  params.delete("sort");
  params.delete("page");
  const res = await fetch(`${API_BASE}/facets?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load facets (${res.status})`);
  return res.json();
}

async function createSavedSearch({ name, filterSpec }) {
  const res = await fetch(`${API_BASE}/saved-searches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-id": "demo-user" }, // auth not wired up yet — see backend README
    body: JSON.stringify({ name, filter_spec: filterSpec }),
  });
  if (!res.ok) throw new Error(`Failed to save search (${res.status})`);
  return res.json();
}

// ---------- Small building blocks ----------

function FacetGroup({ label, options, counts, selected, onToggle, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  if (options.length === 0) return null; // no data yet for this facet — don't show an empty section
  return (
    <div className="border-b border-[#E4E7EC] py-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-[13px] font-medium text-[#12151C]">{label}</span>
        {open ? <ChevronDown size={14} className="text-[#9AA1AD]" /> : <ChevronRight size={14} className="text-[#9AA1AD]" />}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1">
          {options.map((opt) => {
            const isOn = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={`flex items-center justify-between rounded px-2 py-1.5 text-[13px] transition-colors ${
                  isOn ? "bg-[#12151C] text-white" : "text-[#2B303B] hover:bg-[#F6F7F9]"
                }`}
              >
                <span>{opt}</span>
                <span className={`font-mono text-[11px] tabular-nums ${isOn ? "text-[#C9962C]" : "text-[#9AA1AD]"}`}>
                  {counts[opt] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TagChip({ label, muted }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none ${muted ? CONF_STYLE.low : CONF_STYLE.high}`}
      title={muted ? "Unverified — low classification confidence" : undefined}
    >
      {label}
    </span>
  );
}

function VideoRow({ video, query }) {
  function highlight(text) {
    if (!query || !text) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[#FBF3DE] text-[#12151C]">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
  const thumbnailUrl = `https://i.ytimg.com/vi/${video.youtube_video_id}/hqdefault.jpg`;

  return (
    <a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block border-b border-[#E4E7EC] py-4"
    >
      <div className="flex gap-4">
        <div className="relative mt-0.5 h-14 w-24 shrink-0 overflow-hidden rounded bg-[#F6F7F9]">
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Fake/demo video IDs (from seed:fake) don't have a real thumbnail — fall back to the icon.
              e.target.style.display = "none";
              e.target.nextSibling.style.display = "flex";
            }}
          />
          <div className="absolute inset-0 hidden items-center justify-center text-[#9AA1AD]" style={{ display: "none" }}>
            <PlayCircle size={22} strokeWidth={1.5} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-medium leading-snug text-[#12151C] group-hover:underline">{video.title}</h3>
            <ExternalLink size={14} className="mt-1 shrink-0 text-[#C2C7CF] opacity-0 group-hover:opacity-100" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#5B6270]">
            <span>{video.channel_name}</span>
            <span>{timeAgo(video.published_at)}</span>
            <span className="flex items-center gap-1 font-mono tabular-nums"><Clock size={11} />{formatDuration(video.duration_seconds)}</span>
            <span className="flex items-center gap-1 font-mono tabular-nums"><Eye size={11} />{formatViews(video.view_count)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {video.tags.map((t) => (
              <TagChip key={t.category + t.tag} label={t.tag} muted={t.confidence === "low"} />
            ))}
          </div>
          {video.snippet && (
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#5B6270]">{highlight(video.snippet)}</p>
          )}
        </div>
      </div>
    </a>
  );
}

// ---------- Main app ----------

export default function TradingVideoAggregator() {
  const [selected, setSelected] = useState({ instrument: [], methodology: [], strategy: [], format: [] });
  const [queryInput, setQueryInput] = useState(""); // raw input, updates every keystroke
  const [query, setQuery] = useState(""); // debounced value actually sent to the API
  const [sort, setSort] = useState("Newest");
  const [page, setPage] = useState(1);

  const [videos, setVideos] = useState([]);
  const [totalOnPage, setTotalOnPage] = useState(0);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videosError, setVideosError] = useState(null);

  const [facets, setFacets] = useState({ instrument: [], methodology: [], strategy: [], format: [] });
  const [facetCounts, setFacetCounts] = useState({});

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error

  // Debounce the search box so we're not hitting the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQuery(queryInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  function toggle(facet, value) {
    setPage(1);
    setSelected((prev) => {
      const cur = prev[facet];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      return { ...prev, [facet]: next };
    });
  }

  const activeFilters = useMemo(
    () => Object.entries(selected).flatMap(([facet, vals]) => vals.map((v) => ({ facet, v }))),
    [selected]
  );

  // Refetch videos whenever filters/query/sort/page change.
  useEffect(() => {
    let cancelled = false;
    setLoadingVideos(true);
    setVideosError(null);
    fetchVideos({ selected, query, sort, page })
      .then((data) => {
        if (cancelled) return;
        setVideos(data.videos);
        setTotalOnPage(data.videos.length);
      })
      .catch((err) => { if (!cancelled) setVideosError(err.message); })
      .finally(() => { if (!cancelled) setLoadingVideos(false); });
    return () => { cancelled = true; };
  }, [selected, query, sort, page]);

  // Refetch facet counts whenever filters/query change (not sort/page — those don't affect counts).
  useEffect(() => {
    let cancelled = false;
    fetchFacets({ selected, query })
      .then((data) => {
        if (cancelled) return;
        const options = {}, counts = {};
        for (const [category, entries] of Object.entries(data.facets)) {
          options[category] = entries.map((e) => e.tag);
          for (const e of entries) counts[e.tag] = e.count;
        }
        setFacets(options);
        setFacetCounts(counts);
      })
      .catch(() => {}); // facet counts are non-critical — fail silently rather than blocking the page
    return () => { cancelled = true; };
  }, [selected, query]);

  async function handleSaveSearch() {
    setSaveState("saving");
    try {
      const filterSpec = { ...selected, ...(query ? { q: query } : {}) };
      await createSavedSearch({ name: savedName || "Untitled search", filterSpec });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#12151C]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`.font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }`}</style>

      <div className="border-b-2 border-[#B8860B] bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <div style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="shrink-0 text-[16px] font-semibold tracking-tight text-[#12151C]">
            SPX/ES Video Desk
          </div>
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA1AD]" />
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search titles, transcripts, channels…"
              className="w-full rounded border border-[#E4E7EC] bg-[#F6F7F9] py-2 pl-9 pr-3 text-[13px] text-[#12151C] placeholder-[#9AA1AD] outline-none focus:border-[#B8860B] focus:bg-white"
            />
          </div>
          <button
            onClick={() => { setShowSaveModal(true); setSaveState("idle"); }}
            className="flex shrink-0 items-center gap-1.5 rounded border border-[#E4E7EC] px-3 py-2 text-[13px] font-medium text-[#2B303B] hover:border-[#B8860B] hover:text-[#8A6512]"
          >
            <Bell size={13} /> Save this search
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-6">
        <aside className="w-56 shrink-0">
          {Object.entries(FACET_LABELS).map(([category, label]) => (
            <FacetGroup
              key={category}
              label={label}
              options={facets[category] ?? []}
              counts={facetCounts}
              selected={selected[category]}
              onToggle={(v) => toggle(category, v)}
              defaultOpen={category === "instrument" || category === "methodology"}
            />
          ))}
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] text-[#5B6270]">
              {loadingVideos ? "Loading…" : `${totalOnPage} video${totalOnPage !== 1 ? "s" : ""} on this page`}
              {activeFilters.length > 0 && <span> — {activeFilters.length} filter{activeFilters.length !== 1 ? "s" : ""} applied</span>}
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#5B6270]">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                className="rounded border border-[#E4E7EC] bg-white px-2 py-1 text-[#12151C] outline-none"
              >
                <option>Newest</option>
                <option>Relevance</option>
                <option>Most viewed</option>
              </select>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {activeFilters.map(({ facet, v }) => (
                <button
                  key={facet + v}
                  onClick={() => toggle(facet, v)}
                  className="flex items-center gap-1 rounded bg-[#12151C] px-2 py-1 text-[12px] text-white"
                >
                  {v} <X size={11} />
                </button>
              ))}
              <button
                onClick={() => { setSelected({ instrument: [], methodology: [], strategy: [], format: [] }); setPage(1); }}
                className="px-2 py-1 text-[12px] text-[#8A6512] underline underline-offset-2"
              >
                Clear all
              </button>
            </div>
          )}

          {videosError ? (
            <div className="py-16 text-center text-[13px] text-[#B3261E]">
              Couldn't reach the API at {API_BASE} — {videosError}. Is the backend running?
            </div>
          ) : loadingVideos ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[#5B6270]">
              <Loader2 size={16} className="animate-spin" /> Loading videos…
            </div>
          ) : videos.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-[#5B6270]">No videos match these filters. Try removing one.</div>
          ) : (
            <div>
              {videos.map((v) => <VideoRow key={v.id} video={v} query={query} />)}
            </div>
          )}

          {!loadingVideos && !videosError && (videos.length > 0 || page > 1) && (
            <div className="mt-4 flex items-center justify-between text-[13px] text-[#5B6270]">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="disabled:opacity-30"
              >
                ← Prev
              </button>
              <span>Page {page}</span>
              <button
                disabled={videos.length < 20}
                onClick={() => setPage((p) => p + 1)}
                className="disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </main>
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-[#12151C]/40 px-6">
          <div className="w-full max-w-sm rounded border border-[#E4E7EC] bg-white p-5 shadow-lg">
            {saveState !== "saved" ? (
              <>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="mb-1 text-[15px] font-semibold text-[#12151C]">Save search</div>
                <p className="mb-3 text-[13px] text-[#5B6270]">
                  We'll email a daily digest when new videos match {activeFilters.length > 0 ? "these filters" : "this search"}.
                </p>
                <input
                  value={savedName}
                  onChange={(e) => setSavedName(e.target.value)}
                  placeholder={'Name this search, e.g. "ICT ES scalping"'}
                  className="mb-3 w-full rounded border border-[#E4E7EC] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#B8860B]"
                />
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {activeFilters.length === 0 && !query ? (
                    <span className="text-[12px] text-[#9AA1AD]">No filters set — this will match all new videos.</span>
                  ) : (
                    <>
                      {query && <TagChip label={`q: ${query}`} />}
                      {activeFilters.map(({ v }) => <TagChip key={v} label={v} />)}
                    </>
                  )}
                </div>
                {saveState === "error" && (
                  <p className="mb-3 text-[12px] text-[#B3261E]">Couldn't save — check the API is running and try again.</p>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowSaveModal(false)} className="px-3 py-1.5 text-[13px] text-[#5B6270]">Cancel</button>
                  <button
                    onClick={handleSaveSearch}
                    disabled={saveState === "saving"}
                    className="flex items-center gap-1.5 rounded bg-[#12151C] px-3 py-1.5 text-[13px] text-white disabled:opacity-60"
                  >
                    {saveState === "saving" && <Loader2 size={13} className="animate-spin" />}
                    Save search
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="mb-1 text-[15px] font-semibold text-[#12151C]">Saved</div>
                <p className="mb-4 text-[13px] text-[#5B6270]">
                  "{savedName || "Untitled search"}" will check for new matches every few hours and send you a digest.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => { setShowSaveModal(false); setSaveState("idle"); setSavedName(""); }}
                    className="rounded bg-[#12151C] px-3 py-1.5 text-[13px] text-white"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
