// Dig logic: find young, small channels whose long-form videos massively
// overperform their subscriber count, then group hits into veins.
import { YouTube, parseDurationSeconds } from './youtube.mjs';

const DAY = 86400000;

// Open-sweep patrol grounds: faceless-friendly territories, rotated per sweep.
export const SWEEP_TERRITORIES = [
  'documentary story', 'unsolved history', 'company collapse explained', 'scam exposed',
  'war history documentary', 'true crime case', 'money mistakes', 'geopolitics explained',
  'engineering disaster', 'lost civilization', 'financial fraud story', 'dark psychology',
  'sports scandal story', 'mafia history', 'space mystery', 'medical mystery case',
  'internet mystery', 'cold case documentary', 'billionaire downfall', 'cult documentary',
  'heist story', 'aviation disaster', 'survival story', 'ancient history mystery',
];

export const DEFAULTS = {
  windowDays: 90,        // how recent the outlier videos must be
  minSubs: 0,
  maxSubs: 20000,        // small channels only
  maxChannelAgeDays: 400,
  minRatio: 5,           // views must be >= 5x subscribers
  minViews: 20000,
  minDurationSec: 180,   // Shorts/near-Shorts contamination cut
  luckMinRepeats: 2,     // channel-luck check: overperforming videos required (toggleable)
};

function cleanFilters(f = {}) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = Number(f[k]);
    if (Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export async function runDig({ apiKey, mode, seeds = [], luckFilter = true, filters = {}, sweepSize = 6, onProgress = () => {} }) {
  const yt = new YouTube(apiKey);
  const cfg = { ...DEFAULTS, ...cleanFilters(filters) };
  const queries = mode === 'seeded'
    ? seeds.map(s => s.trim()).filter(Boolean).slice(0, 8)
    : pickSweep(sweepSize);
  if (!queries.length) throw new Error('No search terms.');

  const publishedAfter = new Date(Date.now() - cfg.windowDays * DAY).toISOString();
  const veins = [];

  for (const [i, q] of queries.entries()) {
    onProgress({ step: `Digging "${q}"`, done: i, total: queries.length });
    try {
      let vein = await digQuery(yt, q, publishedAfter, cfg, luckFilter);
      if (!vein.hits.length) {
        // nothing qualified: automatically widen the net once and retry
        const relaxed = {
          ...cfg,
          maxSubs: Math.max(cfg.maxSubs * 5, 100000),
          minRatio: Math.max(2, cfg.minRatio / 2),
          minViews: Math.max(5000, Math.round(cfg.minViews / 4)),
          maxChannelAgeDays: Math.min(1500, cfg.maxChannelAgeDays * 2),
          windowDays: Math.min(365, cfg.windowDays * 2),
        };
        onProgress({ step: `Widening the net for "${q}"`, done: i, total: queries.length });
        const wider = new Date(Date.now() - relaxed.windowDays * DAY).toISOString();
        const retry = await digQuery(yt, q, wider, relaxed, luckFilter);
        if (retry.hits.length) { retry.relaxed = true; vein = retry; }
      }
      veins.push(vein);
    } catch (e) {
      veins.push({ query: q, error: String(e.message || e), hits: [] });
      if (e.status === 403) break; // quota exhausted: stop burning calls
    }
  }
  onProgress({ step: 'Weighing ore', done: queries.length, total: queries.length });

  const scored = veins
    .map(v => ({ ...v, grade: gradeVein(v) }))
    .sort((a, b) => b.grade - a.grade);

  return { queries, veins: scored, unitsSpent: yt.unitsSpent, config: cfg, luckFilter };
}

// English-only gate: trust YouTube's language field when set, otherwise
// reject titles/descriptions with a meaningful share of non-Latin letters.
function isEnglish(video, channel) {
  const lang = video.snippet.defaultAudioLanguage || video.snippet.defaultLanguage;
  if (lang && !/^en/i.test(lang)) return false;
  // Judge title, description, and channel name SEPARATELY — a long English
  // description must not dilute a foreign-language title.
  const parts = [video.snippet.title, video.snippet.description?.slice(0, 300), channel?.snippet.title];
  for (const part of parts) {
    const letters = (part || '').match(/\p{L}/gu) || [];
    if (letters.length < 4) continue;
    const nonLatin = letters.filter(ch => !/\p{Script=Latin}/u.test(ch)).length;
    if (nonLatin / letters.length >= 0.12) return false;
  }
  return true;
}
export { isEnglish };
export function titleIsEnglish(title) {
  const letters = (title || '').match(/\p{L}/gu) || [];
  if (letters.length < 4) return true;
  return letters.filter(ch => !/\p{Script=Latin}/u.test(ch)).length / letters.length < 0.12;
}

async function digQuery(yt, query, publishedAfter, cfg, luckFilter) {
  const search = await yt.search(query, { publishedAfter });
  const videoIds = search.items.map(it => it.id.videoId).filter(Boolean);
  const channelIds = [...new Set(search.items.map(it => it.snippet.channelId))];

  const [vids, chans] = await Promise.all([yt.videos(videoIds), yt.channels(channelIds)]);
  const chanById = new Map(chans.items.map(c => [c.id, c]));

  const now = Date.now();
  const candidates = [];
  for (const v of vids.items) {
    const ch = chanById.get(v.snippet.channelId);
    if (!ch) continue;
    const subs = +ch.statistics.subscriberCount || 0;
    const views = +v.statistics.viewCount || 0;
    const chAgeDays = (now - Date.parse(ch.snippet.publishedAt)) / DAY;
    const durationSec = parseDurationSeconds(v.contentDetails.duration);
    const ratio = subs >= 100 ? views / subs : (views >= cfg.minViews ? 99 : 0);

    if (!isEnglish(v, ch)) continue; // non-English content: skip

    const pass =
      views >= cfg.minViews &&
      ratio >= cfg.minRatio &&
      subs >= cfg.minSubs &&
      subs <= cfg.maxSubs &&
      chAgeDays <= cfg.maxChannelAgeDays &&
      durationSec >= cfg.minDurationSec; // Shorts contamination filter

    if (!pass) continue;
    candidates.push({
      videoId: v.id, title: v.snippet.title, channelId: ch.id,
      channelTitle: ch.snippet.title, publishedAt: v.snippet.publishedAt,
      views, subs, ratio: Math.round(ratio * 10) / 10,
      durationSec, channelAgeDays: Math.round(chAgeDays),
      channelVideoCount: +ch.statistics.videoCount || 0,
      uploadsPlaylist: ch.contentDetails?.relatedPlaylists?.uploads,
      thumbnail: v.snippet.thumbnails?.medium?.url,
    });
  }

  // Channel-luck check: does the channel overperform repeatedly, or was it one hit?
  const byChannel = groupBy(candidates, c => c.channelId);
  for (const group of byChannel.values()) {
    const first = group[0];
    let repeats = group.filter(c => c.ratio >= 3).length;
    if (repeats < cfg.luckMinRepeats && first.uploadsPlaylist && first.channelVideoCount > group.length) {
      try {
        const pl = await yt.playlistItems(first.uploadsPlaylist);
        const ids = pl.items.map(it => it.contentDetails.videoId).filter(id => !group.some(g => g.videoId === id));
        const extra = await yt.videos(ids);
        repeats += extra.items.filter(v => {
          const views = +v.statistics.viewCount || 0;
          const sec = parseDurationSeconds(v.contentDetails.duration);
          return sec >= cfg.minDurationSec && first.subs >= 100 && views / first.subs >= 3;
        }).length;
      } catch { /* quota-tight: leave repeats as observed */ }
    }
    for (const c of group) c.repeatOverperformers = repeats;
  }

  let hits = candidates;
  if (luckFilter) hits = hits.filter(c => c.repeatOverperformers >= cfg.luckMinRepeats);
  hits.sort((a, b) => b.ratio * Math.log10(b.views) - a.ratio * Math.log10(a.views));

  // Copycat census from data already in hand: how many channels in this
  // territory are brand new, and are the newest ones actually getting views?
  const allChans = chans.items.map(c => ({
    ageDays: (now - Date.parse(c.snippet.publishedAt)) / DAY,
    views: +c.statistics.viewCount || 0,
    videos: +c.statistics.videoCount || 0,
  }));
  const newcomers = allChans.filter(c => c.ageDays <= 90);
  const newcomerMedianViews = median(newcomers.map(c => c.videos ? c.views / c.videos : 0));
  const census = {
    channelsSeen: allChans.length,
    newcomers90d: newcomers.length,
    newcomerMedianViewsPerVideo: Math.round(newcomerMedianViews),
    crowding: newcomers.length / Math.max(1, allChans.length),
  };

  return { query, hits: hits.slice(0, 12), census, singleHitCount: candidates.length - hits.length };
}

export function gradeVein(v) {
  if (!v.hits?.length) return 0;
  const signal = v.hits.reduce((s, h) => s + h.ratio * Math.log10(Math.max(10, h.views)), 0);
  const distinctChannels = new Set(v.hits.map(h => h.channelId)).size;
  // Crowding penalty: many newcomers whose videos flop = arriving late.
  const late = v.census.crowding > 0.4 && v.census.newcomerMedianViewsPerVideo < 5000;
  return Math.round(signal * Math.sqrt(distinctChannels) * (late ? 0.35 : 1));
}

function pickSweep(n) {
  const pool = [...SWEEP_TERRITORIES];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) { const k = fn(x); m.set(k, [...(m.get(k) || []), x]); }
  return m;
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
