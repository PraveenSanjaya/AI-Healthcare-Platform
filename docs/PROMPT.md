# ClinicAssist — Build Specification

Partial specification. Sections for later phases are appended as they are provided.

## Section 3 — Roles (RBAC)

- Admin: everything; manage users, clinic settings, templates, audit logs, stats.
- Manager: use all templates, view team history, analytics, edit clinic profile.
- Staff: use templates enabled for their role, view own history.

Enforce roles on the server (route handlers, server actions, proxy), not just by hiding UI. Tests must prove Staff gets 403 on admin endpoints.

## Section 9 — Phase 2 (Auth & RBAC)

Auth.js credentials login, seeded admin user (credentials from .env: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), role-guard helpers, middleware/proxy, user management page (Admin: list users, create user, change role, activate/deactivate; cannot deactivate or demote yourself).

Exit criteria: tests for login and 403 on wrong role.

## Section 13 — Git workflow (summary)

- **13.1** Before the first commit and before every push, show: `git config user.name`, `git config user.email`, `git remote -v`, `gh auth status`. Must be PraveenSanjaya, the noreply email, remote PraveenSanjaya/AI-Healthcare-Platform. Stop and ask if anything differs.
- **13.2** One logical change per commit; stage specific files, never `git add .` for a whole phase. ~10-15 meaningful commits per phase; no empty or filler commits. Each commit must build and pass existing tests.
- **13.3** Format: `<type>(<feature>): <imperative description, max 72 chars>`. Types: feat fix test docs refactor style chore build ci perf. Feature scopes include: setup docker db auth rbac users clinic-profile templates seed library favorites phi-detector system-prompt renderer llm-provider runner streaming refine review history export template-editor versioning analytics audit-log rate-limit a11y security e2e docs.
- **13.4** One branch per phase, push regularly, PR via `gh pr create`, merged with a merge commit (never squash). Never force-push, rebase pushed branches, or amend pushed commits.
- **13.5** After each phase report: `git log --oneline` for the phase, total commit count (`git rev-list --count HEAD`), and push confirmation.
