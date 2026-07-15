# LODE

Find YouTube niches before they're crowded. LODE scans for young, small channels whose videos massively overperform their subscriber count (a 5,000-sub channel pulling 500K views), filters out flukes, names the real niche behind each cluster of hits, and writes a deep-dive GO / WATCH / SKIP report on demand.

It runs on your machine. Your scans, watchlist, and reports stay local. The AI parts run through **your own Claude or ChatGPT subscription** (via the Claude Code or OpenAI Codex CLI), so there's no API bill.

## Install (one line)

```
curl -fsSL https://raw.githubusercontent.com/leocreated/lode/main/install.sh | bash
```

That downloads LODE to `~/lode` and runs setup. Run the same line again any time to update. Prefer manual? See below.

## Setup (one time, ~5 minutes)

You need three things:

1. **Node.js** — from [nodejs.org](https://nodejs.org) (LTS version).
2. **An AI assistant CLI** (pick the one matching the subscription you already pay for):
   - Claude: `npm install -g @anthropic-ai/claude-code`, then run `claude` once and log in (Pro or Max).
   - ChatGPT: `npm install -g @openai/codex`, then run `codex` once and log in (Plus or Pro).
3. **A free YouTube API key** — the setup script walks you through it (about 3 minutes on Google Cloud, no credit card).

Then, in this folder:

```
./setup.sh
```

It checks everything, asks for your YouTube key, and installs. If `./setup.sh` says permission denied, run `bash setup.sh`.

## Run

```
npm start
```

Open http://localhost:4780.

## Using it

- **Scan** — type topics or keywords (Enter after each) and hit Scan topics, or hit Surprise sweep to patrol rotating territories. Filters live in the left rail: sub range, view floor, views-to-subs ratio, channel age, recency, video length.
- **Niches** — results land here, grouped by day. Claude names each niche from the actual winning videos, reads the thumbnails to throw out foreign-language bait, and grades it. If a scan finds nothing, LODE automatically widens the filters and retries.
- **Luck filter** — on by default: a channel must overperform more than once to count, which kills one-hit wonders.
- **Watch** (★ on any card) — tracks a video's momentum over time on the Watchlist page.
- **Deep dive** (⋯ menu on any card) — Claude writes a full report: saturation timing, why the video held attention, how much work per video, monetization depth, and a GO / WATCH / SKIP verdict. Lands on the Reports page.
- **Collections** — folders for videos you want to keep together.

## Costs

- YouTube gives every key 10,000 free units per day. A normal scan uses ~200-600 units, so roughly 20-40 scans a day. Resets at midnight Pacific.
- Niche naming and deep dives use your Claude or ChatGPT subscription's normal usage, nothing extra. (Both installed? LODE prefers Claude; set `AI_BACKEND=codex` in `.env` to force ChatGPT.)

## Notes for testers

- Everything saves to the `data/` folder. Delete it and you start fresh.
- If the page ever looks stale after an update, hard refresh (Cmd+Shift+R).
- Beta. Things will change fast; rerun the install line to stay current.
