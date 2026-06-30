# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P4 (Tech Debt / DX)

- **P4.1 — Clean up 26 RuntimeWarnings in test suite** — Various async mock coroutines never awaited (`proc.kill()`, `mock_stream_bytes`, etc.). Each is a real (if benign) async leak. Fix by either awaiting in implementation or silencing in tests.

---

## Recently Completed

### ✅ P3.2 — useCloudBackup hook tests (+17 tests)
`useCloudBackup` hook (uploadBackup, downloadBackup, mergeFavorites, backupStatus). Added 17 tests covering:
- Initial state: no timestamps, not loading, no error
- **uploadBackup**: success (sets lastUpload), server error (returns false), loading state during request, empty favorites
- **downloadBackup**: success (returns favorites/watchlist), server error (returns null), loading state
- **mergeFavorites**: success (returns merged array), server error, request payload verification, loading state
- Error state resets on subsequent successful upload
- Timestamps update on repeated uploads
- Network failure handling for upload and download
- Added MSW handlers: `POST /api/cloud/backup`, `GET /api/cloud/backup`, `POST /api/cloud/merge`
- Frontend tests: 17 new. TypeScript clean.

---

## Recently Completed

### ✅ P3.1 — EPG Search tab tests
SearchPage gained an "EPG" filter tab (guide.search API). Added 7 tests:
- **EPG tab shows** after search with results
- **EPG programme results render** when EPG tab selected
- **Channel names** appear on EPG programme cards
- **Empty state** when EPG search returns no results
- **API error resilience** — shows empty state without crashing
- **Live/movies/series sections hidden** when EPG tab is active
- **Subtitle display** on programme cards when available
- Updated mock to include `guide.search` in the API mock
- Frontend tests: 1184→1191 (+7). TypeScript clean. Backend 571 pass.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
