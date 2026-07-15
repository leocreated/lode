// Assay: deep analysis of one vein, run through the local AI CLI
// (Claude Code or Codex — the user's subscription; no API key). GO / WATCH / SKIP.
import { runAI } from './ai.mjs';

export function buildAssayPrompt(vein) {
  const hits = vein.hits.map(h =>
    `- "${h.title}" | ${h.views.toLocaleString()} views on ${h.subs.toLocaleString()} subs (${h.ratio}x) | channel "${h.channelTitle}" is ${h.channelAgeDays}d old, ${h.repeatOverperformers} repeat overperformers | https://youtube.com/watch?v=${h.videoId}`
  ).join('\n');

  return `You are an assayer judging whether a YouTube niche is worth one test video from the operator.
The operator: a solo creator with roughly 8 hours per video, capable editing skills, records their own voice.
They will NOT use mass-AI production (YouTube's inauthentic-content policy penalizes it); every video gets a human edit and voice.

NICHE ("${vein.query}") — outlier evidence from the last 90 days:
${hits}
Copycat census: ${vein.census.channelsSeen} channels seen, ${vein.census.newcomers90d} created in the last 90 days, newcomer median views/video ${vein.census.newcomerMedianViewsPerVideo}.

Do real web research (search the web, check YouTube) and report:
1. SATURATION TIMING — how many channels copied this niche recently and are the NEWEST entrants still getting views? Is the window open, closing, or shut?
2. RETENTION AUTOPSY — watch/skim the outlier videos' pages: WHY do they hold attention? Is the format replicable by a skilled editor, or carried by something the operator can't copy (personality, insider access, huge production)?
3. FIT — can one person produce this in ~8 hrs/video at pro-edit quality? Policy-safe with human voice+edit? Any adjacent-language market gap worth noting?
4. MONETIZATION DEPTH — beyond AdSense: affiliates, sponsors, product angles in this niche, with realistic examples.
5. THE ONE VIDEO — if the operator tests this niche, the single best video to make first (title + angle).

Be a skeptic: reject unless the evidence is strong. End your report with exactly one line:
VERDICT: GO (strong, make the test video) | WATCH (weak signal, keep an eye on it) | SKIP (not worth it)
Format: plain markdown, no preamble.`;
}

export async function runAssay(prompt, { timeoutMs = 15 * 60 * 1000 } = {}) {
  const out = await runAI(prompt, { webSearch: true, timeoutMs });
  const m = /VERDICT:\s*(GO|WATCH|SKIP)/i.exec(out);
  return { report: out, verdict: m ? m[1].toUpperCase() : 'WATCH' };
}
