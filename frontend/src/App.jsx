import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Search, Clock, Eye, ChevronDown, ChevronRight, X, Bell, PlayCircle, ExternalLink, Loader2 } from "lucide-react";

// Locally this falls back to the default `npm run dev:api` port. In
// production, set VITE_API_BASE in Vercel's project env vars to the
// deployed API's URL (e.g. https://trading-video-api.onrender.com).
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000";

const FACET_LABELS = {
  instrument: "INSTRUMENT",
  methodology: "METHODOLOGY",
  strategy: "STRATEGY",
  format: "FORMAT",
};

const SORT_TO_API = { Newest: "newest", Relevance: "relevance", "Most viewed": "most_viewed" };

const CONF_STYLE = {
  high: "border-[#8a7a3f] text-[#5c4f22] bg-[#f4ecd0]",
  low: "border-[#c9c3b4] text-[#7a7566] bg-transparent",
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
    <div className="border-b border-[#d8d4c8] py-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="font-mono text-[11px] tracking-wide text-[#5b5646]">{label}</span>
        {open ? <ChevronDown size={14} className="text-[#8a8471]" /> : <ChevronRight size={14} className="text-[#8a8471]" />}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {options.map((opt) => {
            const isOn = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={`flex items-center justify-between rounded-sm px-1.5 py-1 text-[13px] transition-colors ${
                  isOn ? "bg-[#1c2233] text-[#f2efe6]" : "text-[#2c2a22] hover:bg-[#e7e3d6]"
                }`}
              >
                <span>{opt}</span>
                <span className={`font-mono text-[11px] ${isOn ? "text-[#c9c2a3]" : "text-[#948d78]"}`}>
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
      className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10.5px] leading-none ${muted ? CONF_STYLE.low : CONF_STYLE.high}`}
      title={muted ? "Unverified — low classification confidence" : undefined}
    >
      {label}{muted ? " ·" : ""}
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
        <mark className="bg-[#f4ecd0] text-[#1c2233]">{text.slice(idx, idx + query.length)}</mark>
        {text.slice(idx + query.length)}
      </>
    );
  }

  return (
    <div className="group border-b border-[#d8d4c8] py-4">
      <div className="flex gap-4">
        <div className="mt-0.5 flex h-14 w-24 shrink-0 items-center justify-center rounded-sm bg-[#1c2233] text-[#c9c2a3]">
          <PlayCircle size={22} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[15px] font-medium leading-snug text-[#1c2233] group-hover:underline">{video.title}</h3>
            <ExternalLink size={14} className="mt-1 shrink-0 text-[#a39d89] opacity-0 group-hover:opacity-100" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[#7a7566]">
            <span>{video.channel_name}</span>
            <span>·</span>
            <span>{timeAgo(video.published_at)}</span>
            <span className="flex items-center gap-1"><Clock size={11} />{formatDuration(video.duration_seconds)}</span>
            <span className="flex items-center gap-1"><Eye size={11} />{formatViews(video.view_count)}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {video.tags.map((t) => (
              <TagChip key={t.category + t.tag} label={t.tag} muted={t.confidence === "low"} />
            ))}
          </div>
          {video.snippet && (
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#4a4636]">{highlight(video.snippet)}</p>
          )}
        </div>
      </div>
    </div>
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
    <div className="min-h-screen bg-[#efece2] text-[#1c2233]" style={{ fontFamily: "system-ui, sans-serif" }}>
      <style>{`.font-mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; }`}</style>

      <div className="border-b border-[#d8d4c8] bg-[#1c2233] text-[#f2efe6]">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <div className="font-mono text-[13px] tracking-tight text-[#c9c2a3]">SPX/ES · VIDEO DESK</div>
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8a8471]" />
            <input
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search titles, transcripts, channels…"
              className="w-full rounded-sm border border-[#3a4257] bg-[#242b3f] py-1.5 pl-8 pr-3 text-[13px] text-[#f2efe6] placeholder-[#7f8598] outline-none focus:border-[#c9c2a3]"
            />
          </div>
          <button
            onClick={() => { setShowSaveModal(true); setSaveState("idle"); }}
            className="flex shrink-0 items-center gap-1.5 rounded-sm border border-[#3a4257] px-3 py-1.5 text-[12px] text-[#c9c2a3] hover:border-[#c9c2a3] hover:text-[#f2efe6]"
          >
            <Bell size={13} /> Save this search
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-6">
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
            <div className="font-mono text-[12px] text-[#5b5646]">
              {loadingVideos ? "Loading…" : `${totalOnPage} video${totalOnPage !== 1 ? "s" : ""} on this page`}
              {activeFilters.length > 0 && <span> · {activeFilters.length} filter{activeFilters.length !== 1 ? "s" : ""} applied</span>}
            </div>
            <div className="flex items-center gap-2 font-mono text-[12px] text-[#5b5646]">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                className="rounded-sm border border-[#d8d4c8] bg-transparent px-2 py-1 text-[#1c2233] outline-none"
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
                  className="flex items-center gap-1 rounded-sm border border-[#1c2233] bg-[#1c2233] px-2 py-1 font-mono text-[11px] text-[#f2efe6]"
                >
                  {v} <X size={11} />
                </button>
              ))}
              <button
                onClick={() => { setSelected({ instrument: [], methodology: [], strategy: [], format: [] }); setPage(1); }}
                className="px-2 py-1 font-mono text-[11px] text-[#8a7a3f] underline underline-offset-2"
              >
                clear all
              </button>
            </div>
          )}

          {videosError ? (
            <div className="py-16 text-center text-[13px] text-[#a13d3d]">
              Couldn't reach the API at {API_BASE} — {videosError}. Is the backend running?
            </div>
          ) : loadingVideos ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[#7a7566]">
              <Loader2 size={16} className="animate-spin" /> Loading videos…
            </div>
          ) : videos.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-[#7a7566]">No videos match these filters. Try removing one.</div>
          ) : (
            <div>
              {videos.map((v) => <VideoRow key={v.id} video={v} query={query} />)}
            </div>
          )}

          {!loadingVideos && !videosError && (videos.length > 0 || page > 1) && (
            <div className="mt-4 flex items-center justify-between font-mono text-[12px] text-[#5b5646]">
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
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-[#1c2233]/40 px-6">
          <div className="w-full max-w-sm rounded-sm border border-[#d8d4c8] bg-[#efece2] p-5 shadow-xl">
            {saveState !== "saved" ? (
              <>
                <div className="mb-1 font-mono text-[11px] tracking-wide text-[#5b5646]">SAVE SEARCH</div>
                <p className="mb-3 text-[13px] text-[#4a4636]">
                  We'll email a daily digest when new videos match {activeFilters.length > 0 ? "these filters" : "this search"}.
                </p>
                <input
                  value={savedName}
                  onChange={(e) => setSavedName(e.target.value)}
                  placeholder={'Name this search, e.g. "ICT ES scalping"'}
                  className="mb-3 w-full rounded-sm border border-[#d8d4c8] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#1c2233]"
                />
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {activeFilters.length === 0 && !query ? (
                    <span className="text-[12px] text-[#948d78]">No filters set — this will match all new videos.</span>
                  ) : (
                    <>
                      {query && <TagChip label={`q: ${query}`} />}
                      {activeFilters.map(({ v }) => <TagChip key={v} label={v} />)}
                    </>
                  )}
                </div>
                {saveState === "error" && (
                  <p className="mb-3 text-[12px] text-[#a13d3d]">Couldn't save — check the API is running and try again.</p>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowSaveModal(false)} className="px-3 py-1.5 text-[13px] text-[#5b5646]">Cancel</button>
                  <button
                    onClick={handleSaveSearch}
                    disabled={saveState === "saving"}
                    className="flex items-center gap-1.5 rounded-sm bg-[#1c2233] px-3 py-1.5 text-[13px] text-[#f2efe6] disabled:opacity-60"
                  >
                    {saveState === "saving" && <Loader2 size={13} className="animate-spin" />}
                    Save search
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-1 font-mono text-[11px] tracking-wide text-[#5b5646]">SAVED</div>
                <p className="mb-4 text-[13px] text-[#4a4636]">
                  "{savedName || "Untitled search"}" will check for new matches every few hours and send you a digest.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => { setShowSaveModal(false); setSaveState("idle"); setSavedName(""); }}
                    className="rounded-sm bg-[#1c2233] px-3 py-1.5 text-[13px] text-[#f2efe6]"
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
