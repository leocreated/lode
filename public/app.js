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

async function api(path, opts) {
  const res = await fetch(path, opts ? { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined } : undefined);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

/* ---------- router ---------- */
const PAGES = ['scan', 'niches', 'watchlist', 'reports'];
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

function renderAll() { renderLedger(); renderVeins(); renderClaims(); renderAssays(); }

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
    $('#progress-text').textContent = '⚠ ' + e.message;
    await new Promise(r => setTimeout(r, 4500));
  }
  setDigging(false);
}

function setDigging(on) {
  $('#scan-live').hidden = !on;
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
  const picker = $('#scan-picker'); picker.innerHTML = '';
  state.digs.slice(0, 8).forEach((d, i) => {
    const best = (d.veins || []).find(v => v.nicheName);
    const label = `Scan ${state.digs.length - i}` +
      (best ? ` · ${best.nicheName}` : d.mode === 'sweep' ? ' · sweep' : '') +
      ' · ' + new Date(d.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const b = el('button', 'scan-tab' + (i === currentDigIndex ? ' active' : ''), label);
    b.onclick = () => { currentDigIndex = i; nicheFilter = null; renderVeins(); };
    picker.appendChild(b);
  });

  const dig = state.digs[currentDigIndex];
  const wrap = $('#veins'); wrap.innerHTML = '';
  const strip = $('#niche-strip'); strip.innerHTML = '';
  $('#veins-empty').style.display = dig ? 'none' : '';
  $('#dig-meta').textContent = dig
    ? `${dig.config ? summarizeFilters(dig.config) + ' · ' : ''}${dig.unitsSpent} quota units${dig.luckFilter ? ' · luck filter on' : ' · one-hit wonders shown'}`
    : '';
  if (!dig) return;

  // niche strip: one pill per niche found, with grade + deep dive
  const veinsWithHits = dig.veins.filter(v => v.hits?.length);
  dig.veins.forEach((vein, idx) => {
    const late = vein.census && vein.census.crowding > .4 && vein.census.newcomerMedianViewsPerVideo < 5000;
    const has = vein.hits?.length;
    const pill = el('div', 'niche-pill accent-' + (idx % 2 ? 'violet' : 'teal') + (has ? '' : ' dead') + (late ? ' late' : ''));
    pill.innerHTML = `
      <div class="np-main">
        <span class="np-name">${vein.nicheName || vein.query}</span>
        <span class="np-grade">${has ? fmt(vein.grade) + ' grade' : vein.error ? 'error' : '0 hits'}</span>
        ${late ? '<span class="np-warn">crowded · late</span>' : ''}
      </div>
      ${vein.nicheDesc ? `<div class="np-desc">${vein.nicheDesc}</div>` : ''}`;
    if (has) {
      const row = el('div', 'np-actions');
      const dd = el('button', 'btn tiny gold', '🔎 Deep dive');
      dd.onclick = e => { e.stopPropagation(); runAssayUI(vein, dd); };
      const flt = el('button', 'btn tiny', nicheFilter === vein.query ? 'show all' : 'only this');
      flt.onclick = e => { e.stopPropagation(); nicheFilter = nicheFilter === vein.query ? null : vein.query; renderVeins(); };
      row.appendChild(dd); row.appendChild(flt);
      pill.appendChild(row);
    }
    strip.appendChild(pill);
  });

  // flat video grid: every hit is its own card, niche tagged on it
  const cards = veinsWithHits
    .flatMap((v, vi) => v.hits.map(h => ({ h, v, vi })))
    .filter(x => !nicheFilter || x.v.query === nicheFilter)
    .sort((a, b) => b.h.ratio * Math.log10(Math.max(10, b.h.views)) - a.h.ratio * Math.log10(Math.max(10, a.h.views)));

  for (const { h, v, vi } of cards) {
    const staked = state.claims.some(c => c.videoId === h.videoId);
    const card = el('div', 'vcard');
    card.innerHTML = `
      <a class="thumb" href="https://youtube.com/watch?v=${h.videoId}" target="_blank">
        ${h.thumbnail ? `<img src="${h.thumbnail}" alt="" loading="lazy">` : '<div class="thumb-blank"></div>'}
        <span class="ratio-badge">${h.ratio}×</span>
      </a>
      <a class="hit-title" href="https://youtube.com/watch?v=${h.videoId}" target="_blank">${h.title}</a>
      <div class="hit-meta"><b>${h.ratio}×</b> · ${fmt(h.views)} views · ${ago(h.publishedAt)}</div>
      <div class="hit-meta dim">${h.channelTitle} · ${fmt(h.subs)} subs · channel ${h.channelAgeDays}d old · ${h.repeatOverperformers}× repeat</div>
      <span class="niche-tag accent-${vi % 2 ? 'violet' : 'teal'}">${v.nicheName || v.query}</span>`;
    const stake = el('button', 'stake' + (staked ? ' staked' : ''), staked ? '★ watching' : '☆ watch');
    stake.onclick = async () => {
      await api('/api/claim', { method: 'POST', body: { hit: h, query: v.query } });
      state = await api('/api/state'); renderAll();
    };
    card.appendChild(stake);
    wrap.appendChild(card);
  }
  if (!cards.length && veinsWithHits.length === 0)
    wrap.appendChild(el('div', 'empty', 'Nothing beat the filters in this scan. Loosen them on the Scan page.'));
}

/* ---------- deep dive ---------- */
async function runAssayUI(vein, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '🔎 analyzing…';
  const tick = setInterval(() => {
    btn.textContent = btn.textContent.endsWith('……') ? '🔎 analyzing…' : btn.textContent + '…';
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
