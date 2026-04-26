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

## Seedance 2.0 Video Generation Integration
- [x] Add video_jobs table to database schema for tracking generation tasks
- [x] Create server-side WaveSpeed API client (submitVideoTask, getVideoTaskResult)
- [x] Add tRPC routes: video.generate, video.generateAll, video.checkStatus, video.listByBrief
- [x] Add "Generate Video" button per segment on the BriefResult page
- [x] Add "Generate All Videos" button to generate all segments at once
- [x] Build real-time status polling UI using tRPC refetchInterval (pending → created → processing → completed/failed)
- [x] Display video player inline when generation succeeds with download link
- [x] Store video URLs in database for persistence (verified via updateVideoJob test)
- [x] Use 9:16 aspect ratio for UGC video ads
- [x] Write vitest tests for video generation routes (10 tests including polling and error scenarios)
- [x] WaveSpeed API key validation tests (2 tests)

## Shotstack Video Stitching Integration
- [x] Request and validate Shotstack API key
- [x] Create Shotstack API client (submitRender, getRenderStatus)
- [x] Add stitch_jobs table to database schema for tracking render tasks
- [x] Add tRPC routes: stitch.create, stitch.checkStatus, stitch.getByBrief
- [x] Build JSON edit payload: sequential clips with fade transitions, 9:16 output
- [x] Add "Stitch Final Ad" button on BriefResult page (appears when all segments have videos)
- [x] Build real-time status polling UI for render progress
- [x] Display final stitched video with inline player and download button
- [x] Store final video URL in database for persistence
- [x] Write vitest tests for stitch routes (12 tests covering create, checkStatus, getByBrief, and buildStitchEdit)

## Bug Fixes (Round 2)
- [x] Fix WaveSpeed API duration: code sends duration=15 explicitly, DB default changed from 5 to 15, request logging added to verify
- [x] Fix segment count enforcement: LLM prompt now says "EXACTLY N segments" with explicit instructions to combine/split script content
- [x] Fix avatar/creator consistency: LLM prompt now requires a detailed Creator Persona description repeated verbatim in every segment prompt
- [x] Fix stitch button: stitch.create now deletes failed stitch jobs to allow retry; canStitch logic updated in BriefResult
- [x] Fix campaign summary duration: uses segmentCount × 15s correctly in the LLM prompt

## New Features (Round 2)
- [x] Per-segment feedback and regeneration: video.regenerate route uses LLM to revise prompt based on feedback, then resubmits to WaveSpeed
- [x] Feedback UI: textarea under each completed/failed video with "Regenerate with Feedback" button
- [x] Video naming conventions: BriefResult shows segment names from brief headers (e.g., "Segment 1 — Hook")
- [x] Enhanced history page: shows video generation progress (completed/total), stitch status badges, and final ad ready indicator
- [x] Database improvements: feedback column on video_jobs, video/stitch summary queries for history

## Bug Fixes & Test Coverage (Round 3)
- [x] Fix video.test.ts: update all duration values from 5 to 15 in mock fixtures and test inputs
- [x] Fix video.test.ts: add feedback field to all mock video job fixtures
- [x] Add video.regenerate test suite: 7 tests covering auth, LLM revision, WaveSpeed submission, feedback storage, duration defaults, and old job deletion
- [x] Add segment count enforcement post-processing: truncate extra LLM-generated segments to match requested count, re-append Step 4 review section if cut off
- [x] Frontend segment enforcement: BriefResult.tsx already slices parsed segments to brief.segmentCount
- [x] All 49 tests passing across 6 test files (18 video, 13 stitch, 13 brief, 2 WaveSpeed, 2 Shotstack, 1 auth)
