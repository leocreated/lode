// Thin YouTube Data API v3 client with quota accounting.
const BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTube {
  constructor(key) {
    if (!key || key.includes('paste-your-key')) throw new Error('YOUTUBE_API_KEY missing in .env');
    this.key = key;
    this.unitsSpent = 0; // search=100, list=1
  }

  async #get(endpoint, params, units) {
    const url = new URL(`${BASE}/${endpoint}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
    url.searchParams.set('key', this.key);
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`YouTube ${endpoint} ${res.status}: ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    this.unitsSpent += units;
    return res.json();
  }

  // 100 units per call
  search(q, { publishedAfter, maxResults = 25, order = 'viewCount', regionCode = 'US', relevanceLanguage = 'en' } = {}) {
    return this.#get('search', {
      part: 'snippet', type: 'video', videoDuration: 'medium', // >4min: pre-filters most Shorts
      q, publishedAfter, maxResults, order, regionCode, relevanceLanguage,
    }, 100);
  }

  videos(ids) {
    if (!ids.length) return Promise.resolve({ items: [] });
    return this.#get('videos', { part: 'statistics,contentDetails,snippet', id: ids.slice(0, 50).join(',') }, 1);
  }

  channels(ids) {
    if (!ids.length) return Promise.resolve({ items: [] });
    return this.#get('channels', { part: 'statistics,snippet,contentDetails', id: ids.slice(0, 50).join(',') }, 1);
  }

  playlistItems(playlistId, maxResults = 15) {
    return this.#get('playlistItems', { part: 'contentDetails', playlistId, maxResults }, 1);
  }
}

export function parseDurationSeconds(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}
