import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, save, id } from './lib/store.mjs';
import { runDig, SWEEP_TERRITORIES } from './lib/scan.mjs';
import { buildAssayPrompt, runAssay } from './lib/assay.mjs';
import { YouTube } from './lib/youtube.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// .env loader (no dependency)
for (const line of (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n') : [])) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const API_KEY = process.env.YOUTUBE_API_KEY;

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public'), { etag: false, lastModified: false, setHeaders: res => res.set('Cache-Control', 'no-store') }));

// In-memory job progress; results persist to disk.
const jobs = new Map();

app.get('/api/state', (req, res) => {
  res.json({
    digs: load('digs', []).slice(0, 25),
    claims: load('claims', []),
    assays: load('assays', []).slice(0, 50),
    territories: SWEEP_TERRITORIES,
  });
});

app.post('/api/dig', (req, res) => {
  const { mode = 'sweep', seeds = [], luckFilter = true, filters = {} } = req.body || {};
  const jobId = id('dig');
  const job = { id: jobId, status: 'running', progress: { step: 'Breaking ground', done: 0, total: 1 } };
  jobs.set(jobId, job);
  res.json({ jobId });

  runDig({ apiKey: API_KEY, mode, seeds, luckFilter, filters, onProgress: p => { job.progress = p; } })
    .then(result => {
      const dig = { id: jobId, at: new Date().toISOString(), mode, seeds, ...result };
      const digs = load('digs', []);
      digs.unshift(dig);
      save('digs', digs.slice(0, 40));
      job.status = 'done';
      job.result = dig;
    })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });
});

app.get('/api/job/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'unknown job' });
  res.json(job);
});

// Claims (watchlist) + momentum snapshots
app.post('/api/claim', (req, res) => {
  const { hit, query } = req.body || {};
  if (!hit?.videoId) return res.status(400).json({ error: 'bad claim' });
  const claims = load('claims', []);
  const existing = claims.find(c => c.videoId === hit.videoId);
  if (existing) {
    save('claims', claims.filter(c => c.videoId !== hit.videoId));
    return res.json({ removed: true });
  }
  claims.unshift({
    ...hit, query, claimedAt: new Date().toISOString(),
    snapshots: [{ at: new Date().toISOString(), views: hit.views, subs: hit.subs }],
  });
  save('claims', claims);
  res.json({ added: true });
});

app.post('/api/claims/refresh', async (req, res) => {
  try {
    const claims = load('claims', []);
    if (!claims.length) return res.json({ claims, refreshed: 0 });
    const yt = new YouTube(API_KEY);
    const vids = await yt.videos(claims.map(c => c.videoId));
    const chans = await yt.channels([...new Set(claims.map(c => c.channelId))]);
    const vById = new Map(vids.items.map(v => [v.id, v]));
    const cById = new Map(chans.items.map(c => [c.id, c]));
    const now = new Date().toISOString();
    for (const claim of claims) {
      const v = vById.get(claim.videoId);
      const c = cById.get(claim.channelId);
      if (!v) continue;
      claim.snapshots.push({ at: now, views: +v.statistics.viewCount || 0, subs: +(c?.statistics.subscriberCount) || claim.subs });
      if (claim.snapshots.length > 60) claim.snapshots = claim.snapshots.slice(-60);
      const s = claim.snapshots;
      if (s.length >= 2) {
        const a = s[s.length - 2], b = s[s.length - 1];
        const days = Math.max(0.02, (Date.parse(b.at) - Date.parse(a.at)) / 86400000);
        claim.viewsPerDay = Math.round((b.views - a.views) / days);
      }
    }
    save('claims', claims);
    res.json({ claims, refreshed: claims.length });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

// Assay: deep dive one vein via local Claude Code
app.post('/api/assay', (req, res) => {
  const { vein } = req.body || {};
  if (!vein?.query) return res.status(400).json({ error: 'no vein' });
  const jobId = id('assay');
  const job = { id: jobId, status: 'running', query: vein.query };
  jobs.set(jobId, job);
  res.json({ jobId });

  runAssay(buildAssayPrompt(vein))
    .then(({ report, verdict }) => {
      const assay = { id: jobId, at: new Date().toISOString(), query: vein.query, verdict, report };
      const assays = load('assays', []);
      assays.unshift(assay);
      save('assays', assays.slice(0, 100));
      job.status = 'done';
      job.result = assay;
    })
    .catch(e => { job.status = 'error'; job.error = String(e.message || e); });
});

const PORT = process.env.PORT || 4780;
app.listen(PORT, () => console.log(`LODE glowing at http://localhost:${PORT}`));
