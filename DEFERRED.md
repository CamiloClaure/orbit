# Deferred

Explicitly out of scope for v0.1, per PLAN.md's "no new scope" rule. Logged here
instead of built.

## From PLAN.md (decided up front)
SSO, PDF/Excel export (CSV only), mobile app, i18n (product is Spanish-only),
tenant self-signup, per-tenant infra automation (see `RUNBOOK.md` for the manual
runbook instead), email sending (log to console if ever needed), Redis, message
queues, GraphQL, microservices.

## Found during the build, deferred rather than fixed
- **No rate limiting / lockout on `POST /auth/login`.** Brute-force guessing is
  unbounded. Add `@fastify/rate-limit` (already-adjacent to the stack, no new
  ecosystem) scoped to the login route before any internet-facing deployment.
- **Dev secrets are committed as defaults**: `orbit_app` DB role password
  (`apps/api/src/db/migrations/0001_rls_and_app_role.sql`) and
  `SEED_USER_PASSWORD` default (`changeme123`). Fine for local dev; must be
  rotated (env-injected, not committed) before any real deployment.
- **No CSRF token.** Currently mitigated by `SameSite=Lax` + requiring
  `Content-Type: application/json` (a plain HTML form can't trigger a
  cross-site JSON POST), but there's no defense-in-depth if that assumption
  ever changes (e.g. accepting form-encoded bodies, subdomain cookie sharing).
- **Dashboard's "ausentes hoy"** is computed client-side from all approved
  leave requests (small dataset, fine at this scale) rather than a dedicated
  backend endpoint — revisit if a tenant's request volume grows.
- **Employee-picker fields** (`AssignLeaveButton`, `RecognitionButton` in
  `components/actions.tsx`) take a raw employee code instead of an
  autocomplete widget — add one if this becomes more than a demo flow.
- **No production build/deploy pipeline** — `vite.config.ts`'s dev proxy
  makes `/api` same-origin locally; a real deployment needs an actual reverse
  proxy or CORS configuration, neither of which exists yet.
