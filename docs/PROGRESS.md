# Progress

Resume point for an interrupted session: say "continue from docs/PROGRESS.md".

**Current:** Phase 8 (`feature/phase-8-hardening`), then the v1.0.0 release.

## Done

| Phase | PR | Merged |
| ----- | -- | ------ |
| 1-4 (scaffold, auth, templates, safety layer) | #1-#8 | yes |
| 5 AI runner | #9 | yes |
| 5 Playwright tests | #10 | yes |
| 6 History, export, settings, template editor | #11 | yes |
| 7 Analytics and audit log | #12 | yes |

## Phase 8 items

- [x] Atomic rate limit + concurrency test
- [x] PHI detector: "Patient Mr. Silva" is one name finding
- [x] Security headers, body size limits, uniform errors
- [x] Error boundaries, not-found, loading, toasts, dark mode, 375px layout
- [x] Accessibility (axe, light and dark) and main-flow e2e on Chromium and Firefox
- [x] CI workflow (`.github/workflows/ci.yml`)
- [x] Docs: README, ARCHITECTURE, SAFETY, USER_GUIDE, CHANGELOG, PLAN, DECISIONS
- [ ] Full checks, PR, green CI, merge
- [ ] Optional real-AI check (only with `ANTHROPIC_API_KEY` in `.env`)
- [ ] Tag v1.0.0 and GitHub release

## Run rules

- 13.1 check before the first commit and every push. If only the active `gh` account is wrong and PraveenSanjaya is logged in, run `gh auth switch -u PraveenSanjaya` and confirm (DECISIONS #38).
- Dev DB: `npx prisma dev start clinicassist`; on "Connection terminated unexpectedly" stop/start it. Run `npm run db:clean-e2e` after e2e runs.
