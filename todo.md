# UGC Ad Director — Project TODO

- [x] Database schema: briefs table with all fields (product info, audience, segments, generated content, timestamps)
- [x] Multi-step intake form: Step 1 (product name, description), Step 2 (target audience), Step 3 (ad goal, tone/vibe), Step 4 (segments count, script/concept), Step 5 (optional product image upload)
- [x] LLM-powered backend: tRPC procedure that ingests form data and generates complete Seedance 2.0 director's brief
- [x] Auto-generated Pinterest reference links: 4 casting links + per-scene setting/product interaction references
- [x] Detailed Seedance 2.0 prompt generation: 15s segments with 5-second block descriptions, camera/lighting/hand/expression, audio direction
- [x] Results page: exact Seedance 2.0 skill output format (product summary → Pinterest casting → per-segment prompts in code blocks → Step 4 review checklist)
- [x] One-click copy-to-clipboard for each segment prompt + Copy All button
- [x] Brief history: save to database, list past campaigns, revisit any brief
- [x] Owner notification on each new brief generation
- [x] Product image upload with LLM analysis to suggest ad angles, use-cases, demographics (pre-fill form)
- [x] Downloadable plain-text file of the complete director's brief
- [x] Brutalist aesthetic: black background, oversized white condensed sans-serif, vivid red dividers, industrial minimalist
- [x] Global theming and typography (index.css, Google Fonts)
- [x] Navigation: landing page → intake form → results → history
- [x] Auth fix: handle stale cookies from other Manus projects (appId mismatch check)
- [x] Vitest tests: 14 tests covering brief router procedures
