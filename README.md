# Rolevana

**Find. Tailor. Apply.**

Rolevana is a remote frontend job-hunting and application automation platform. This repository currently contains Phase 1: the production-oriented foundation, master-resume-led candidate onboarding, provider/adapter boundaries, mock data, and a safe dashboard. Real discovery, resume generation, and application submission are intentionally not implemented yet.

## Safety baseline

- `DRY_RUN=true` is the default. Phase 1 has no real submission transport.
- `FREE_AI_ONLY=true`, `FREE_INFRA_MODE=true`, and `MAX_AI_COST_USD=0` are validated defaults.
- Unknown-cost or non-zero-cost models are rejected before invocation. Exhausted free providers queue work instead of falling back to paid inference.
- The production API fails closed until Supabase authentication and production repositories/object storage are configured.
- Vendor providers never receive hard-coded credentials and fail clearly when unconfigured.
- PDF/DOCX uploads are MIME- and size-validated. Local files live in ignored, user-scoped `.data/<user-id>/resumes` storage.
- Candidate facts and the immutable master resume are designed as the only source of truth.
- Original resume bytes are preserved unchanged and deduplicated by SHA-256 content hash.

## Master resume workflow

Uploading a PDF or DOCX now starts a local ingestion pipeline:

1. Validate and permanently preserve the original file.
2. Calculate a stable content hash and reuse a prior parse for unchanged content.
3. Extract selectable text locally with `pdf-parse` or `mammoth`, including embedded PDF/DOCX hyperlink targets when the source exposes them.
4. Deterministically extract supported personal data, links, skills, employment, projects, and education. PDF annotation URLs are associated only when a personal-link type or project-name match is clear; unassociated URLs are not fabricated or guessed.
5. Attach resume provenance, evidence, and confidence to extracted values.
6. Prefill only empty profile fields; existing populated fields are not silently overwritten.
7. Present current and extracted values on `/profile/resume-review` for accept, reject, or edit decisions.
8. Mark the profile and resume verified only after the candidate confirms the import.

Scanned or unreadable documents remain safely stored. If local extraction produces no text, the status becomes `WAITING_FOR_FREE_AI`; no paid OCR or AI service is called. Master resumes never participate in generated-file retention cleanup.

Extracted raw text is persisted internally in ignored local metadata for reproducible parsing and parser-version cache invalidation. Normal resume API responses deliberately redact `rawText`; logs contain only IDs and counts, never resume contents.

The application schema records a `MASTER_RESUME`, `TAILORED_RESUME`, or `NEEDS_REVIEW` strategy and the exact master/tailored resume relation used. Deterministic strategy selection avoids unnecessary variants when the master resume already covers a role. Tailored-resume claims must reference verified source claim IDs before they can pass validation.

## Free-mode architecture

`FreeAIProviderRouter` is the intended path to hosted inference. Each candidate carries pricing-verification metadata. `openrouter/free` is the sole built-in free alias; every other OpenRouter, NVIDIA, or Agent Router model needs a trusted zero-cost allowlist or verified provider metadata showing exactly zero input and output pricing. Unknown pricing is treated as potentially billable.

The router tries only verified-free candidates. Rate limits, quota exhaustion, or unavailable free models produce `WAITING_FOR_FREE_AI` and queue the task instead of upgrading or spending money. Stable normalized-description hashes and an AI result-cache contract prevent unchanged job descriptions from being analyzed repeatedly. Configurable batches reduce request volume.

Local development uses deterministic mock AI, filesystem resume storage, an in-process queue abstraction, local scheduling compatibility, and no paid browser service. Redis is optional.

## Architecture

```text
apps/web                 Next.js App Router UI and server endpoints
packages/config          validated environment and feature flags
packages/database        Prisma/PostgreSQL schema, migrations, seed
packages/domain          candidate and resume validation schemas
packages/ai              AIProvider interface and vendor boundaries
packages/job-sources     JobSourceAdapter and deterministic mock jobs
packages/applications    ApplicationAdapter and dry-run mock adapter
packages/ui              reusable accessible UI primitives
```

The app is a pnpm workspace. Packages expose TypeScript source directly and Next.js transpiles browser-facing workspace packages. Prisma was selected for an explicit relational schema, migrations, generated types, and familiar PostgreSQL operations. Supabase is used as the authentication foundation; when its public variables are absent, development uses a clearly scoped local identity.

## Local setup

Requirements: Node.js 22+ (24 tested), pnpm 10+, and PostgreSQL only when running database commands.

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm dev
```

Open `http://localhost:3000`. Profile and resume metadata can be exercised without external services in development and are written beneath `apps/web/.data`.

To initialize PostgreSQL:

```bash
pnpm db:migrate
pnpm db:seed
```

Quality gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Environment

Copy `.env.example`. The default free and dry-run values are enough to run the UI. `DATABASE_URL` is required for migrations and seed data. Supabase URL/anonymous key enable real session lookup. AI, Gmail, Redis, service-role, and encryption values are reserved for later phases and must remain server-side.

## Database domains

The schema covers users, profiles, structured skills/experience/projects/education, preferences, immutable master resume content and parsing state, structured tailored resumes with regenerable PDFs, sources, jobs and matching, cached AI analyses, applications and attempts, exact submitted-resume relations, answers/events, review items, settings, OAuth connections, worker/source runs, and AI usage. It includes source ID, canonical URL, fingerprint, and one-application-per-user/job protections.

Generated tailored PDFs have an indexed expiration timestamp and default 60-day retention. Structured tailoring data and application history remain available for regeneration. Master resumes have no automatic expiry.

## Current services and cost posture

| Component | Current Phase 1 behavior | Payment required |
|---|---|---|
| AI | Deterministic local mock; hosted models disabled until verified free | No |
| Database | Local PostgreSQL or Supabase Free compatible | No |
| Authentication | Supabase Free compatible; local development identity fallback | No |
| File storage | Local ignored storage; Supabase Free compatible boundary | No |
| Queue/scheduling | In-process/local abstractions | No |
| Browser automation | Not implemented; future local Playwright | No |
| Email | Not implemented; future Gmail OAuth API | No |
| Hosting | Provider-neutral local Next.js application | No |

Free services can impose changing quotas, rate limits, inactivity, and capacity constraints. Rolevana reports configuration status rather than claiming independently verified billing totals. If free capacity is exhausted, work waits; it never upgrades or purchases credits.

## Phase 1 limitations

- Deterministic resume parsing prioritizes precision and sends uncertain/missing fields to review. More complex layout interpretation can later use only verified-free AI.
- Local development persistence is single-user and filesystem-backed. Production repositories are deliberately unavailable until configured.
- OpenRouter, NVIDIA, and Agent Router have contracts and configuration boundaries but no outbound transport until AI matching work.
- Autopilot, live ATS discovery, browser automation, Gmail sending, and real submissions do not exist yet.
- Dashboard metrics are representative mock data, clearly separated from actual submission state.
- Dashboard cost data currently reflects configured policy; live storage measurement and provider billing reconciliation require later read-only integrations.

At significant scale, database/storage capacity, always-on workers, backups, high-volume local browser compute, and observability may exceed free tiers. These remain optional future upgrades requiring an explicit decision.

## Recommended Phase 2

Implement ATS adapters for Greenhouse, Lever, and Ashby; normalized ingestion; remote/region and frontend eligibility; cross-source fingerprints; hourly worker scheduling; source-run observability; and real jobs/detail views. Keep applications disabled and retain `DRY_RUN=true`.
