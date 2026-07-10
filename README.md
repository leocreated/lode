# LODE

Niche-outlier prospector for faceless YouTube. Private tool.

## Run

```
npm install
npm start
```

Open http://localhost:4780. Needs `.env` with `YOUTUBE_API_KEY=...` (never committed).

## What it does

- **Dig** — seeded (your terms) or open sweep (rotating faceless-friendly territories). Finds young, small channels whose long-form videos massively overperform their sub count via the free YouTube Data API.
- **Fluke filters** — Shorts cut, copycat census (crowded + newcomers flopping = late), channel-luck toggle (require repeat overperformers).
- **Claims** — stake outliers to a watchlist; re-survey builds momentum curves (views/day sparklines).
- **Assay** — deep dive a vein through local Claude Code (subscription, no API key): saturation timing, retention autopsy, fit, monetization depth. Verdict stamped PAYDIRT / TRACE / BARREN.
