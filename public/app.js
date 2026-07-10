// LODE front-of-house.
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);

let state = { digs: [], claims: [], assays: [] };
let seeds = [];

async function api(path, opts) {
  const res = await fetch(path, opts ? { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined } : undefined);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

/* ---------- boot ---------- */
async function boot() {
  state = await api('/api/state');
  renderAll();
  gsap.from('.masthead', { y: -24, opacity: 0, duration: .9, ease: 'power3.out' });
  gsap.from('main > section', { y: 30, opacity: 0, duration: .8, stagger: .12, ease: 'power3.out', delay: .2 });
}

function renderAll() {
  renderLedger(); renderVeins(); renderClaims(); renderAssays();
}

function renderLedger() {
  $('#stat-digs').textContent = state.digs.length;
  $('#stat-claims').textContent = state.claims.length;
  $('#stat-paydirt').textContent = state.assays.filter(a => a.verdict === 'PAYDIRT').length;
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

/* ---------- dig ---------- */
$('#btn-seeded').onclick = () => dig('seeded');
$('#btn-sweep').onclick = () => dig('sweep');

async function dig(mode) {
  if (mode === 'seeded' && !seeds.length) {
    gsap.fromTo('#seed-input', { x: -6 }, { x: 0, duration: .4, ease: 'elastic.out(1, .3)' });
    $('#seed-input').focus();
    return;
  }
  setDigging(true);
  try {
    const { jobId } = await api('/api/dig', { method: 'POST', body: { mode, seeds, luckFilter: $('#luck').checked } });
    const result = await poll(jobId, p => {
      if (p.progress) $('#progress-text').textContent = `${p.progress.step} — ${p.progress.done}/${p.progress.total}`;
    });
    state.digs.unshift(result);
    renderAll();
    gsap.from('.vein', { y: 24, opacity: 0, duration: .6, stagger: .07, ease: 'power3.out' });
  } catch (e) {
    $('#progress-text').textContent = '⚠ ' + e.message;
    await new Promise(r => setTimeout(r, 3500));
  }
  setDigging(false);
}

function setDigging(on) {
  $('#dig-progress').hidden = !on;
  $('#btn-seeded').disabled = on;
  $('#btn-sweep').disabled = on;
  if (on) $('#progress-text').textContent = 'Breaking ground…';
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

/* ---------- veins ---------- */
function renderVeins() {
  const dig = state.digs[0];
  const wrap = $('#veins'); wrap.innerHTML = '';
  $('#veins-empty').style.display = dig ? 'none' : '';
  $('#dig-meta').textContent = dig
    ? `${dig.mode} dig · ${new Date(dig.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${dig.unitsSpent} quota units${dig.luckFilter ? ' · luck filter on' : ' · single-hit wonders shown'}`
    : '';
  if (!dig) return;

  for (const vein of dig.veins) {
    const late = vein.census && vein.census.crowding > .4 && vein.census.newcomerMedianViewsPerVideo < 5000;
    const card = el('div', 'vein' + (late ? ' late' : ''));
    card.appendChild(el('div', 'vein-top', `
      <div class="vein-name">${vein.query}</div>
      <div class="vein-grade"><b>${vein.error ? '—' : fmt(vein.grade)}</b><span>GRADE</span></div>`));

    if (vein.error) {
      card.appendChild(el('div', 'census warn', '⚠ ' + vein.error));
    } else {
      card.appendChild(el('div', 'census', `
        ${vein.census.channelsSeen} channels surveyed · ${vein.census.newcomers90d} newcomers in 90d ·
        newcomer median ${fmt(vein.census.newcomerMedianViewsPerVideo)} views/video
        ${late ? '<span class="warn"> · CROWDED, LATE</span>' : ''}
        ${vein.singleHitCount ? `<br>${vein.singleHitCount} single-hit wonder${vein.singleHitCount > 1 ? 's' : ''} hidden by luck filter` : ''}`));

      for (const h of vein.hits.slice(0, 5)) {
        const staked = state.claims.some(c => c.videoId === h.videoId);
        const row = el('div', 'hit', `
          <div><a href="https://youtube.com/watch?v=${h.videoId}" target="_blank">${h.title}</a>
            <div class="ch">${h.channelTitle} · ${fmt(h.subs)} subs · ${h.channelAgeDays}d old · ${h.repeatOverperformers}× repeat</div></div>
          <div class="nums">${fmt(h.views)}<small>${h.ratio}× subs</small></div>`);
        const stake = el('button', 'stake' + (staked ? ' staked' : ''), staked ? '⚑ claimed' : '⚐ stake claim');
        stake.onclick = async () => {
          await api('/api/claim', { method: 'POST', body: { hit: h, query: vein.query } });
          state = await api('/api/state'); renderAll();
        };
        row.appendChild(stake);
        card.appendChild(row);
      }
      if (!vein.hits.length) card.appendChild(el('div', 'census', 'No outliers survived the filters here.'));

      const actions = el('div', 'vein-actions');
      const assayBtn = el('button', 'btn small gold', '⚖ Run assay');
      assayBtn.onclick = () => runAssayUI(vein, assayBtn);
      actions.appendChild(assayBtn);
      card.appendChild(actions);
    }
    wrap.appendChild(card);
  }
}

/* ---------- assay ---------- */
async function runAssayUI(vein, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '⚖ assaying…';
  const tick = setInterval(() => {
    btn.textContent = btn.textContent.endsWith('……') ? '⚖ assaying…' : btn.textContent + '…';
  }, 1200);
  try {
    const { jobId } = await api('/api/assay', { method: 'POST', body: { vein } });
    const assay = await poll(jobId, () => {});
    state.assays.unshift(assay);
    renderAssays(); renderLedger();
    openReport(assay);
  } catch (e) {
    alert('Assay failed: ' + e.message);
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

/* ---------- claims ---------- */
$('#btn-refresh').onclick = async e => {
  e.target.disabled = true; e.target.textContent = 'Surveying…';
  try {
    const { claims } = await api('/api/claims/refresh', { method: 'POST', body: {} });
    state.claims = claims;
    renderClaims();
  } catch (err) { alert(err.message); }
  e.target.disabled = false; e.target.textContent = 'Re-survey';
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
      <small>${c.channelTitle} · staked ${new Date(c.claimedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${c.query}</small>`));
    const spark = el('canvas', 'spark'); spark.width = 260; spark.height = 68;
    drawSpark(spark, c.snapshots);
    row.appendChild(spark);
    row.appendChild(el('div', 'claim-mo ' + (vpd === undefined ? '' : hot ? 'mo-hot' : 'mo-cold'),
      vpd === undefined ? '<b>—</b>re-survey for momentum' : `<b>${vpd >= 0 ? '+' : ''}${fmt(vpd)}</b>views / day`));
    const un = el('button', 'unstake', 'abandon');
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
  if (pts.length < 2) { ctx.fillStyle = '#a89a7e'; ctx.font = '11px Oskari G2'; ctx.fillText('one survey so far', 6, 40); return; }
  const min = Math.min(...pts), max = Math.max(...pts), span = Math.max(1, max - min);
  const W = canvas.width, H = canvas.height, pad = 8;
  ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach((v, i) => {
    const x = pad + (W - 2 * pad) * i / (pts.length - 1);
    const y = H - pad - (H - 2 * pad) * (v - min) / span;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  const lastX = W - pad, lastY = H - pad - (H - 2 * pad) * (pts.at(-1) - min) / span;
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, 7); ctx.fill();
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
