// LODE front-of-house: 4 pages, filter deck, hash router.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
const ago = iso => {
  const d = (Date.now() - Date.parse(iso)) / 86400000;
  if (d < 1) return 'today';
  if (d < 30) return Math.round(d) + 'd ago';
  if (d < 365) return Math.round(d / 30) + ' mo ago';
  return (d / 365).toFixed(1) + ' yr ago';
};

const FILTER_DEFAULTS = {
  minSubs: 0, maxSubs: 20000, minViews: 20000, minRatio: 5,
  maxChannelAgeDays: 400, windowDays: 90, minDurationSec: 180,
};

let state = { digs: [], claims: [], assays: [] };
let seeds = [];
let currentDigIndex = 0;
let nicheFilter = null;
let tipTimer = null;

const SCAN_TIPS = [
  'Tip: the pink badge is the outlier multiple — a 50× video means 50 times more views than the channel has subscribers.',
  'Tip: turn OFF the luck filter to see one-hit wonders — single viral videos on otherwise quiet channels.',
  'Tip: watch a video (☆) and hit Refresh on the Watchlist tomorrow — the momentum line shows if it is still climbing.',
  'Tip: a red CROWDED, LATE flag means newcomers are flooding in and flopping. You are late to that party.',
  'Tip: Deep dive costs nothing — it runs on your Claude subscription and checks saturation, retention, and money angles.',
  'Tip: tighten Max subscribers on the Scan page to find channels that are still tiny but already popping.',
  'Tip: every video card shows ×repeat — how many times that channel overperformed. 3×+ means a format, not luck.',
  'Tip: scans only return videos in English. Foreign-language lookalikes get vetted out automatically.',
  'Tip: use several topics in one scan (Enter after each) — they compete, and the best niche rises to the top.',
  'Tip: GO / WATCH / SKIP verdicts live on the Reports page, stamped on every deep dive you run.',
];

function startTips() {
  const sub = $('#scan-tip');
  let i = Math.floor(Math.random() * SCAN_TIPS.length);
  const show = () => {
    gsap.to(sub, { opacity: 0, duration: .3, onComplete: () => {
      sub.textContent = SCAN_TIPS[i % SCAN_TIPS.length]; i++;
      gsap.to(sub, { opacity: 1, duration: .4 });
    }});
  };
  sub.textContent = SCAN_TIPS[i % SCAN_TIPS.length]; i++;
  tipTimer = setInterval(show, 5000);
}
function stopTips() { clearInterval(tipTimer); tipTimer = null; }

async function api(path, opts) {
  const res = await fetch(path, opts ? { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined } : undefined);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

/* ---------- router ---------- */
const PAGES = ['scan', 'niches', 'watchlist', 'reports', 'collections'];
function route() {
  const page = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'scan';
  for (const p of PAGES) $('#page-' + p).hidden = p !== page;
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  document.body.dataset.page = page;
  const target = $('#page-' + page);
  gsap.fromTo(target, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: .45, ease: 'power3.out' });
}
addEventListener('hashchange', route);

/* ---------- filters ---------- */
function initFilters() {
  const saved = JSON.parse(localStorage.getItem('lodeFilters') || '{}');
  for (const f of $$('.filter')) {
    const key = f.dataset.key;
    const range = f.querySelector('input[type=range]');
    const num = f.querySelector('input[type=number]');
    range.min = f.dataset.min; range.max = f.dataset.max; range.step = f.dataset.step;
    const val = saved[key] ?? FILTER_DEFAULTS[key];
    range.value = val; num.value = val;
    const sync = (v, fromRange) => {
      const n = Math.max(0, Number(v) || 0);
      if (fromRange) num.value = n; else range.value = Math.min(Math.max(n, +range.min), +range.max);
      const all = collectFilters();
      localStorage.setItem('lodeFilters', JSON.stringify(all));
      f.classList.toggle('touched', n !== FILTER_DEFAULTS[key]);
      renderFilterSummary();
    };
    range.addEventListener('input', () => sync(range.value, true));
    num.addEventListener('input', () => sync(num.value, false));
    f.classList.toggle('touched', val !== FILTER_DEFAULTS[key]);
  }
}
function summarizeFilters(f) {
  const parts = [
    `subs ${fmt(f.minSubs)}–${fmt(f.maxSubs)}`,
    `views ≥${fmt(f.minViews)}`,
    `ratio ≥${f.minRatio}×`,
    `channel ≤${f.maxChannelAgeDays}d`,
    `last ${f.windowDays}d`,
    `≥${Math.round(f.minDurationSec / 60)}min`,
  ];
  return parts.join(' · ');
}
function renderFilterSummary() {
  const box = $('#filter-summary');
  if (!box) return;
  const f = collectFilters();
  const custom = Object.keys(FILTER_DEFAULTS).some(k => f[k] !== FILTER_DEFAULTS[k]);
  box.innerHTML = `<span class="fs-label">scanning with:</span> ${summarizeFilters(f)}` +
    (custom ? ' <span class="fs-custom">· custom</span>' : '');
}
function collectFilters() {
  const out = {};
  for (const f of $$('.filter')) out[f.dataset.key] = Number(f.querySelector('input[type=number]').value) || 0;
  return out;
}
$('#btn-reset-filters').onclick = () => {
  localStorage.removeItem('lodeFilters');
  for (const f of $$('.filter')) {
    const v = FILTER_DEFAULTS[f.dataset.key];
    f.querySelector('input[type=range]').value = v;
    f.querySelector('input[type=number]').value = v;
    f.classList.remove('touched');
  }
  renderFilterSummary();
};

/* ---------- boot ---------- */
async function boot() {
  initFilters();
  renderFilterSummary();
  route();
  state = await api('/api/state');
  renderAll();
  gsap.from('.masthead', { y: -24, opacity: 0, duration: .9, ease: 'power3.out' });
}

function renderAll() { renderLedger(); renderVeins(); renderClaims(); renderAssays(); renderCollections(); }

function renderLedger() {
  $('#stat-digs').textContent = state.digs.length;
  $('#stat-claims').textContent = state.claims.length;
  $('#stat-paydirt').textContent = state.assays.filter(a => a.verdict === 'GO').length;
}

/* ---------- seeds ---------- */
$('#seed-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    seeds.push(e.target.value.trim());
    e.target.value = '';
    renderChips();
  }
});
function renderChips() {
  const box = $('#chips'); box.innerHTML = '';
  seeds.forEach((s, i) => {
    const c = el('span', 'chip', s);
    c.onclick = () => { seeds.splice(i, 1); renderChips(); };
    box.appendChild(c);
    gsap.from(c, { scale: .6, opacity: 0, duration: .3, ease: 'back.out(2)' });
  });
}

/* ---------- scan ---------- */
$('#btn-seeded').onclick = () => dig('seeded');
$('#btn-sweep').onclick = () => dig('sweep');

async function dig(mode) {
  if (mode === 'seeded' && !seeds.length) {
    gsap.fromTo('#seed-input', { x: -6 }, { x: 0, duration: .4, ease: 'elastic.out(1, .3)' });
    $('#seed-input').focus();
    return;
  }
  setDigging(true);
  location.hash = '#niches'; // results land here; show it immediately with live progress
  try {
    const { jobId } = await api('/api/dig', { method: 'POST', body: { mode, seeds, luckFilter: $('#luck').checked, filters: collectFilters() } });
    const result = await poll(jobId, p => {
      if (p.progress) {
        $('#progress-text').textContent = `${p.progress.step} — ${p.progress.done}/${p.progress.total}`;
        const pct = p.progress.total ? Math.max(6, Math.round(100 * p.progress.done / p.progress.total)) : 6;
        $('#progress-fill').style.width = pct + '%';
      }
    });
    state.digs.unshift(result);
    currentDigIndex = 0;
    renderAll();
    gsap.from('.vein', { y: 24, opacity: 0, duration: .6, stagger: .07, ease: 'power3.out' });
  } catch (e) {
    $('#progress-text').textContent = 'error: ' + e.message;
    await new Promise(r => setTimeout(r, 4500));
  }
  setDigging(false);
}

function setDigging(on) {
  $('#scan-live').hidden = !on;
  if (on) startTips(); else stopTips();
  $('#nav-dot').hidden = !on;
  $('#btn-seeded').disabled = on;
  $('#btn-sweep').disabled = on;
  if (on) {
    $('#progress-text').textContent = 'Scanning…';
    $('#progress-fill').style.width = '4%';
    $('#veins').innerHTML = '';
    $('#veins-empty').style.display = 'none';
    $('#scan-picker').innerHTML = '';
  }
}

async function poll(jobId, onTick) {
  for (;;) {
    const job = await api('/api/job/' + jobId);
    onTick(job);
    if (job.status === 'done') return job.result;
    if (job.status === 'error') throw new Error(job.error);
    await new Promise(r => setTimeout(r, 1500));
  }
}

/* ---------- niches ---------- */
function renderVeins() {
  const wrap = $('#veins'); wrap.innerHTML = '';
  $('#scan-picker').innerHTML = '';
  $('#niche-strip').innerHTML = '';
  $('#veins-empty').style.display = state.digs.length ? 'none' : '';
  $('#dig-meta').textContent = '';
  if (!state.digs.length) return;

  // group all scans by the DAY they ran; each day = one merged view
  const days = [];
  for (const d of state.digs) {
    const day = new Date(d.at).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    let g = days.find(x => x.day === day);
    if (!g) { g = { day, digs: [] }; days.push(g); }
    g.digs.push(d);
  }

  for (const g of days) {
    const section = el('div', 'day-section');
    const units = g.digs.reduce((s, d) => s + (d.unitsSpent || 0), 0);
    section.appendChild(el('div', 'day-head', `${g.day} <span class="day-meta">${g.digs.length} scan${g.digs.length > 1 ? 's' : ''} · ${units} quota units</span>`));

    // merge every scan's niches for the day; dedupe niches by label, videos by id
    const nichesMap = new Map();
    for (const d of g.digs) for (const vein of d.veins) {
      const key = (vein.nicheName || vein.query).toLowerCase();
      const cur = nichesMap.get(key);
      if (!cur || (vein.grade || 0) > (cur.grade || 0)) nichesMap.set(key, vein);
    }
    const niches = [...nichesMap.values()].sort((x, y) => (y.grade || 0) - (x.grade || 0));

    const chips = el('div', 'niche-strip');
    const dead = niches.filter(v => !v.hits?.length);
    niches.filter(v => v.hits?.length).forEach((vein, idx) => {
      const late = vein.census && vein.census.crowding > .4 && vein.census.newcomerMedianViewsPerVideo < 5000;
      const has = true;
      const chipEl = el('div', 'niche-chip accent-' + (idx % 2 ? 'violet' : 'teal') + (late ? ' late' : ''));
      chipEl.title = (vein.nicheDesc || '') + (vein.relaxed ? ' (auto-widened search)' : '');
      chipEl.innerHTML = `<span class="np-name">${vein.nicheName || vein.query}</span>
        <span class="np-grade">${has ? fmt(vein.grade) : vein.error ? 'err' : '0'}</span>
        ${vein.relaxed ? '<span class="np-relaxed">widened</span>' : ''}
        ${late ? '<span class="np-warn">late</span>' : ''}`;
      if (has) {
        const dd = el('button', 'chip-btn', 'dive');
        dd.title = 'Deep dive this niche';
        dd.onclick = e => { e.stopPropagation(); runAssayUI(vein, dd); };
        chipEl.appendChild(dd);
        chipEl.onclick = () => { nicheFilter = nicheFilter === vein.query ? null : vein.query; renderVeins(); };
        if (nicheFilter === vein.query) chipEl.classList.add('active');
      }
      chips.appendChild(chipEl);
    });
    const rail = el('aside', 'niche-rail');
    rail.appendChild(el('div', 'rail-title', 'NICHES FOUND'));
    rail.appendChild(chips);
    if (dead.length) rail.appendChild(el('div', 'dead-line',
      'searched with no results: ' + dead.map(v => v.query).join(', ')));
    const body = el('div', 'day-body');
    body.appendChild(rail);
    section.appendChild(body);

    const seen = new Set();
    const cards = niches
      .flatMap((v, vi) => (v.hits || []).map(h => ({ h, v, vi })))
      .filter(x => !seen.has(x.h.videoId) && seen.add(x.h.videoId))
      .filter(x => !nicheFilter || x.v.query === nicheFilter)
      .sort((a, b) => b.h.ratio * Math.log10(Math.max(10, b.h.views)) - a.h.ratio * Math.log10(Math.max(10, a.h.views)));

    const grid = el('div', 'veins');
    for (const { h, v } of cards) {
      const staked = state.claims.some(c => c.videoId === h.videoId);
      const card = el('div', 'vcard');
      card.innerHTML = `
        <a class="thumb" href="https://youtube.com/watch?v=${h.videoId}" target="_blank">
          ${h.thumbnail ? `<img src="${h.thumbnail}" alt="" loading="lazy">` : '<div class="thumb-blank"></div>'}
          <span class="ratio-badge">${h.ratio}×</span>
          ${staked ? '<span class="watch-flag">★</span>' : ''}
        </a>
        <a class="hit-title" href="https://youtube.com/watch?v=${h.videoId}" target="_blank">${h.title}</a>
        <div class="hit-meta">${fmt(h.views)} views · ${ago(h.publishedAt)}</div>
        <div class="hit-meta dim" title="Breakouts = videos on this channel with at least 3x more views than subscribers. More than one means a repeatable format, not one lucky video.">${h.channelTitle} · ${fmt(h.subs)} subs · channel ${h.channelAgeDays}d old · ${h.repeatOverperformers} breakout${h.repeatOverperformers === 1 ? '' : 's'}</div>`;
      card.appendChild(moreMenu(h, v, staked));
      grid.appendChild(card);
    }
    if (!cards.length) grid.appendChild(el('div', 'empty', 'Nothing qualified, even after auto-widening the search.'));
    section.querySelector('.day-body').appendChild(grid);
    wrap.appendChild(section);
  }
}

/* ---------- deep dive ---------- */
async function runAssayUI(vein, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'analyzing…';
  const tick = setInterval(() => {
    btn.textContent = btn.textContent.endsWith('……') ? 'analyzing…' : btn.textContent + '…';
  }, 1200);
  try {
    const { jobId } = await api('/api/assay', { method: 'POST', body: { vein } });
    const assay = await poll(jobId, () => {});
    state.assays.unshift(assay);
    renderAssays(); renderLedger();
    openReport(assay);
  } catch (e) {
    alert('Deep dive failed: ' + e.message);
  }
  clearInterval(tick);
  btn.textContent = original;
  btn.disabled = false;
}

function renderAssays() {
  const wrap = $('#assays'); wrap.innerHTML = '';
  $('#assays-empty').style.display = state.assays.length ? 'none' : '';
  for (const a of state.assays) {
    const row = el('div', 'assay-row', `
      <span class="assay-verdict ${a.verdict}">${a.verdict}</span>
      <span class="assay-q">${a.query}</span>
      <span class="assay-date">${new Date(a.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>`);
    row.onclick = () => openReport(a);
    wrap.appendChild(row);
  }
}

function openReport(assay) {
  $('#report-query').textContent = assay.query;
  $('#report-body').innerHTML = mdToHtml(assay.report);
  const stamp = $('#stamp');
  stamp.className = 'stamp ' + assay.verdict;
  stamp.textContent = assay.verdict;
  $('#modal').hidden = false;
  gsap.fromTo('#assay-report', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: .5, ease: 'power3.out' });
  gsap.fromTo(stamp, { scale: 3, opacity: 0, rotation: 20 },
    { scale: 1, opacity: .9, rotation: 8, duration: .45, ease: 'power4.in', delay: .4,
      onComplete: () => gsap.fromTo('#assay-report', { x: -4 }, { x: 0, duration: .5, ease: 'elastic.out(1,.3)' }) });
}
$('#modal-close').onclick = () => { $('#modal').hidden = true; };
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) $('#modal').hidden = true; });

/* ---------- watchlist ---------- */
$('#btn-refresh').onclick = async e => {
  e.target.disabled = true; e.target.textContent = 'Refreshing…';
  try {
    const { claims } = await api('/api/claims/refresh', { method: 'POST', body: {} });
    state.claims = claims;
    renderClaims();
  } catch (err) { alert(err.message); }
  e.target.disabled = false; e.target.textContent = 'Refresh';
};

function renderClaims() {
  const wrap = $('#claims'); wrap.innerHTML = '';
  $('#claims-empty').style.display = state.claims.length ? 'none' : '';
  renderLedger();
  for (const c of state.claims) {
    const vpd = c.viewsPerDay;
    const hot = vpd !== undefined && vpd > 1000;
    const row = el('div', 'claim');
    row.appendChild(el('div', 'claim-title', `
      <a href="https://youtube.com/watch?v=${c.videoId}" target="_blank" style="color:inherit;text-decoration:none">${c.title}</a>
      <small>${c.channelTitle} · watching since ${new Date(c.claimedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${c.query}</small>`));
    const spark = el('canvas', 'spark'); spark.width = 260; spark.height = 68;
    drawSpark(spark, c.snapshots);
    row.appendChild(spark);
    row.appendChild(el('div', 'claim-mo ' + (vpd === undefined ? '' : hot ? 'mo-hot' : 'mo-cold'),
      vpd === undefined ? '<b>—</b>refresh for momentum' : `<b>${vpd >= 0 ? '+' : ''}${fmt(vpd)}</b>views / day`));
    const un = el('button', 'unstake', 'remove');
    un.onclick = async () => {
      await api('/api/claim', { method: 'POST', body: { hit: c } });
      state = await api('/api/state'); renderAll();
    };
    row.appendChild(un);
    wrap.appendChild(row);
  }
}

function drawSpark(canvas, snaps) {
  const ctx = canvas.getContext('2d');
  const pts = snaps.map(s => s.views);
  if (pts.length < 2) { ctx.fillStyle = '#7e97a8'; ctx.font = '11px Oskari G2'; ctx.fillText('first check logged', 6, 40); return; }
  const min = Math.min(...pts), max = Math.max(...pts), span = Math.max(1, max - min);
  const W = canvas.width, H = canvas.height, pad = 8;
  ctx.strokeStyle = '#b91372'; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((v, i) => {
    const x = pad + (W - 2 * pad) * i / (pts.length - 1);
    const y = H - pad - (H - 2 * pad) * (v - min) / span;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  const lastX = W - pad, lastY = H - pad - (H - 2 * pad) * (pts.at(-1) - min) / span;
  ctx.fillStyle = '#41ead4'; ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, 7); ctx.fill();
}

/* ---------- card menu + collections ---------- */
function closeMenus() { $$('.menu-pop').forEach(m => m.remove()); }
document.addEventListener('click', closeMenus);

function moreMenu(h, v, staked) {
  const btn = el('button', 'more-btn', '⋯');
  btn.onclick = e => {
    e.stopPropagation();
    const existing = btn.parentElement.querySelector('.menu-pop');
    closeMenus();
    if (existing) return;
    const menu = el('div', 'menu-pop');
    const watch = el('button', 'menu-item', staked ? '★ Stop watching' : '☆ Watch');
    watch.onclick = async () => {
      await api('/api/claim', { method: 'POST', body: { hit: h, query: v.query } });
      state = await api('/api/state'); renderAll();
    };
    const dive = el('button', 'menu-item', 'Deep dive this niche');
    dive.onclick = () => { closeMenus(); runAssayUI(v, dive); };
    menu.appendChild(watch); menu.appendChild(dive);
    menu.appendChild(el('div', 'menu-sep', 'add to collection'));
    for (const c of state.collections || []) {
      const inCol = c.videos.some(x => x.videoId === h.videoId);
      const item = el('button', 'menu-item', (inCol ? '✓ ' : '▸ ') + c.name);
      item.onclick = async () => {
        await api('/api/collections', { method: 'POST', body: inCol
          ? { action: 'remove', name: c.name, videoId: h.videoId }
          : { action: 'add', name: c.name, hit: h, query: v.query } });
        state = await api('/api/state'); renderAll();
      };
      menu.appendChild(item);
    }
    const newCol = el('button', 'menu-item new', '+ New collection…');
    newCol.onclick = async () => {
      const name = prompt('Collection name:');
      if (!name?.trim()) return;
      await api('/api/collections', { method: 'POST', body: { action: 'create', name: name.trim() } });
      await api('/api/collections', { method: 'POST', body: { action: 'add', name: name.trim(), hit: h, query: v.query } });
      state = await api('/api/state'); renderAll();
    };
    menu.appendChild(newCol);
    menu.onclick = e => e.stopPropagation();
    btn.parentElement.appendChild(menu);
  };
  return btn;
}

$('#btn-new-collection').onclick = async () => {
  const name = prompt('Collection name:');
  if (!name?.trim()) return;
  await api('/api/collections', { method: 'POST', body: { action: 'create', name: name.trim() } });
  state = await api('/api/state'); renderAll();
};

function renderCollections() {
  const wrap = $('#collections'); if (!wrap) return;
  wrap.innerHTML = '';
  const cols = state.collections || [];
  $('#collections-empty').style.display = cols.length ? 'none' : '';
  for (const c of cols) {
    const sec = el('div', 'collection');
    const head = el('div', 'collection-head', `<h3>${c.name}</h3><span class="col-count">${c.videos.length} video${c.videos.length === 1 ? '' : 's'}</span>`);
    const del = el('button', 'btn tiny', 'delete');
    del.onclick = async () => {
      if (!confirm(`Delete collection "${c.name}"?`)) return;
      await api('/api/collections', { method: 'POST', body: { action: 'delete', name: c.name } });
      state = await api('/api/state'); renderAll();
    };
    head.appendChild(del);
    sec.appendChild(head);
    const grid = el('div', 'veins');
    for (const h of c.videos) {
      const card = el('div', 'vcard');
      card.innerHTML = `
        <a class="thumb" href="https://youtube.com/watch?v=${h.videoId}" target="_blank">
          ${h.thumbnail ? `<img src="${h.thumbnail}" alt="" loading="lazy">` : '<div class="thumb-blank"></div>'}
          <span class="ratio-badge">${h.ratio}×</span>
        </a>
        <a class="hit-title" href="https://youtube.com/watch?v=${h.videoId}" target="_blank">${h.title}</a>
        <div class="hit-meta">${fmt(h.views)} views · ${ago(h.publishedAt)}</div>
        <div class="hit-meta dim">${h.channelTitle} · ${fmt(h.subs)} subs</div>`;
      const rm = el('button', 'stake', 'remove');
      rm.onclick = async () => {
        await api('/api/collections', { method: 'POST', body: { action: 'remove', name: c.name, videoId: h.videoId } });
        state = await api('/api/state'); renderAll();
      };
      card.appendChild(rm);
      grid.appendChild(card);
    }
    if (!c.videos.length) grid.appendChild(el('div', 'empty', 'Empty. Use the ⋯ menu on any video card to file one here.'));
    sec.appendChild(grid);
    wrap.appendChild(sec);
  }
}

/* ---------- tiny markdown ---------- */
function mdToHtml(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hup])/, '<p>').concat('</p>');
}

boot();
