// After a dig: have Claude look at the actual hits and name the REAL niche
// each vein represents (not the search query that found it). Fast, cheap call.
import { spawn } from 'node:child_process';

export function nameNiches(veins) {
  const named = veins.filter(v => v.hits?.length);
  if (!named.length) return Promise.resolve(veins);

  const brief = named.map((v, i) =>
    `${i}. search was "${v.query}" — found:\n` +
    v.hits.slice(0, 6).map(h => `   - "${h.title}" (channel: ${h.channelTitle}, ${h.views} views, ${h.subs} subs)`).join('\n')
  ).join('\n');

  const prompt = `Below are groups of overperforming YouTube videos. For each numbered group, look at what the videos ACTUALLY have in common (topic, format, style, audience) and name the real niche — not the search term. Be specific about format when it matters (animated, mini-doc, listicle, case study).

${brief}

Reply with ONLY a JSON array, one object per numbered group, same order:
[{"name":"3-6 word niche name","desc":"one sentence: what this niche actually is and who watches it"}]`;

  return new Promise(resolve => {
    const child = spawn('claude', ['-p', prompt, '--output-format', 'text'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(veins); }, 120000);
    child.stdout.on('data', d => out += d);
    child.on('error', () => { clearTimeout(timer); resolve(veins); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const m = /\[[\s\S]*\]/.exec(out);
        const names = JSON.parse(m[0]);
        named.forEach((v, i) => {
          if (names[i]?.name) { v.nicheName = names[i].name; v.nicheDesc = names[i].desc || ''; }
        });
      } catch { /* fallback: query stays the label */ }
      resolve(veins);
    });
  });
}
