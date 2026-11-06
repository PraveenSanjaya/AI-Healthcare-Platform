# Changelog

## 1.0.0 - 2026-11-06

First release.

### Added

- Library of 24 vetted prompt templates in six categories, with search, filters and favourites.
- Template runner with a live prompt view, streaming drafts, regenerate and refine, and word and
  character counters.
- PHI safeguards: pattern detector for emails, phones, Sri Lankan NIC numbers, dates of birth,
  addresses, postal codes, identifiers and cued names; live highlighting; "Redact all"; server-side
  enforcement that blocks the request before any model call; administrator override with a reason.
- Human review gate: patient-facing drafts cannot be copied or exported until reviewed.
- History for staff (own) and managers and admins (all); export to Markdown, Word and PDF.
- Analytics for managers and admins: per-day, per-template and per-user counts, PHI blocks and
  overrides, review rate, output length, token use and an estimated cost.
- Audit log for admins: append-only, filterable, paged, with an audited CSV export, covering logins,
  failed logins, generations, PHI events, exports, user, settings and template changes.
- Administration: users and roles, clinic settings, template editor with versioning and archiving.
- Roles (STAFF, MANAGER, ADMIN) enforced in the proxy and the service layer.
- Providers: deterministic mock (default, no key needed) and Anthropic streaming.

### Hardening

- Atomic per-user hourly rate limit (advisory lock) with a database concurrency test.
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, HSTS in production), request size limits, uniform error responses.
- Error boundaries, not-found page, loading states, toasts, responsive layout (375px), dark mode.
- Accessibility checks (axe-core, WCAG 2.1 AA) in light and dark mode; skip link; live regions.
- PHI detector: a title after a patient cue is one name finding, not two.
- CI on GitHub Actions: lint, typecheck, format, unit tests with a coverage gate, build, and
  Playwright on Chromium and Firefox against PostgreSQL.

### Known limitations

See "Known limits" in `docs/SAFETY.md`. The PHI detector is a heuristic safeguard, not a guarantee.
