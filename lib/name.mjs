// After a dig: the AI names the REAL niche each vein represents and vets
// language — reading the actual thumbnail images, since foreign-language
// videos often hide behind English titles (Hindi text in the thumbnail).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAI } from './ai.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const THUMBS = path.join(ROOT, 'data', 'thumbs');

async function downloadThumbs(hits) {
  fs.mkdirSync(THUMBS, { recursive: true });
  await Promise.all(hits.map(async h => {
    if (!h.thumbnail) return;
    const file = path.join(THUMBS, `${h.videoId}.jpg`);
    try {
      if (!fs.existsSync(file)) {
        const res = await fetch(h.thumbnail);
        if (!res.ok) return;
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      }
      h._thumbFile = path.relative(ROOT, file);
    } catch { /* no thumb; text-only judgment */ }
  }));
}

export function vetPrompt(named) {
  const brief = named.map((v, i) =>
    `${i}. search was "${v.query}" — found:\n` +
    v.hits.map((h, hi) =>
      `   [${hi}] "${h.title}" (channel: ${h.channelTitle}, ${h.views} views, ${h.subs} subs)` +
      (h._thumbFile ? ` thumbnail image: ${h._thumbFile}` : '')
    ).join('\n')
  ).join('\n');

  return `Below are groups of overperforming YouTube videos. Two jobs:

1. LANGUAGE VET (do this first): a video counts as non-English if its title, channel name, OR the text visible in its thumbnail image is primarily in another language (Hindi, romanized Hindi like "Value Badhane Ka Aasan Tarika", Spanish, etc.). LOOK at each listed thumbnail image (attached, or read the image file at the listed path) and check the text in the picture — foreign-language videos often use English titles as bait while the thumbnail is in another language. Flag every non-English video's index. Be strict: when a thumbnail is mostly foreign-language text, flag it no matter how English the title sounds.

2. NAME each group's real niche from its ENGLISH videos only — what do they actually have in common (topic, format, style, audience)? Not the search term. Be specific about format (animated, mini-doc, case file, video essay).

${brief}

Reply with ONLY a JSON array, one object per numbered group, same order:
[{"name":"3-6 word niche name","desc":"one sentence: what this niche actually is and who watches it","nonEnglish":[indices of non-English videos, empty array if all English]}]`;
}

export async function runVet(prompt, images = []) {
  try {
    const out = await runAI(prompt, { images, cwd: ROOT, timeoutMs: 180000 });
    const m = /\[[\s\S]*\]/.exec(out);
    return JSON.parse(m[0]);
  } catch { return null; }
}

export async function nameNiches(veins) {
  const named = veins.filter(v => v.hits?.length);
  if (!named.length) return veins;
  const allHits = named.flatMap(v => v.hits);
  await downloadThumbs(allHits);
  const images = allHits.map(h => h._thumbFile).filter(Boolean);
  const names = await runVet(vetPrompt(named), images);
  if (names) {
    named.forEach((v, i) => {
      if (names[i]?.name) { v.nicheName = names[i].name; v.nicheDesc = names[i].desc || ''; }
      const drop = new Set(names[i]?.nonEnglish || []);
      if (drop.size) v.hits = v.hits.filter((_, hi) => !drop.has(hi));
    });
  }
  try { fs.rmSync(THUMBS, { recursive: true, force: true }); } catch {}
  return veins;
}
