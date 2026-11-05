# Progress

Resume point for an interrupted session: say "continue from docs/PROGRESS.md".

**Current:** Phase 7 (`feature/phase-7-analytics-audit`).

## Done

| Phase | PR | Merged |
| ----- | -- | ------ |
| 1-4 (scaffold, auth, templates, safety layer) | #1-#8 | yes |
| 5 AI runner | #9 | yes |
| 5 Playwright tests | #10 | yes |
| 6 History, export, settings, template editor | #11 | yes |

## Phase 7 open items

- [ ] Audit gaps: user create/role/activate/deactivate, login success/failure (settings and exports already audited)
- [ ] Append-only audit repository + test, metadata sanitiser (no PHI or raw text)
- [ ] `/admin/audit` viewer with filters and CSV export (audited)
- [ ] `/analytics` (Recharts, server aggregates, cost estimate)
- [ ] Unit and E2E tests, full checks, PR, merge

## Later

- Phase 8: hardening, CI, docs, v1.0.0 release.

## Run rules

- 13.1 check before the first commit and every push. If only the active `gh` account is wrong and PraveenSanjaya is logged in, run `gh auth switch -u PraveenSanjaya` and confirm (DECISIONS #38).
- Dev DB: `npx prisma dev start clinicassist`; on "Connection terminated unexpectedly" stop/start it. Run `npm run db:clean-e2e` after e2e runs.
