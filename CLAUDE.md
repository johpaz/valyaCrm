# valyaCrm — Valya Backend Agent

Last updated: 2026-06-12

## Context
If a parent CLAUDE.md exists one level up (local multi-repo setups), it 
gives the full system overview. This file is canonical for everything 
about this repo.

## What this is
The backend agent for Valya. Handles incoming WhatsApp messages (including 
voice), runs AI agent logic via LangChain/LangGraph, manages CRM data, and 
integrates with Google Calendar and email. Processes WhatsApp voice messages 
by transcribing them via OpenAI Whisper, then passes them to the 
Gemini-powered agent for processing.

## Tech stack
- Runtime: Bun (not Node.js — use `bun` commands, not `npm` or `node`)
- Language: TypeScript
- AI framework: LangChain + LangGraph
- Web framework: Elysia
- Database: MongoDB running locally
- AI model: Google Gemini (via GEMINI_API_KEY)
- Audio transcription: OpenAI Whisper (via OPENAI_API_KEY)
- All code is written in Spanish — maintain this convention

## Project structure
src/
- config/       — Environment and configuration
- langchain/    — LangChain agent logic
- langgraph/    — LangGraph workflow definitions
- models/       — Data models (in Spanish)
- routes/       — API endpoints — the integration surface for the frontend
  - calendarRoutes.ts
  - crmRoutes.ts        — Contacts, opportunities, activities, salespeople
  - healthRoutes.ts     — Server health check
  - reportDash.ts       — Dashboard data for the frontend
  - reportRoutes.ts     — Reporting endpoints
  - webhookRoutes.ts    — Incoming WhatsApp messages
- services/     — Business logic
- types/        — TypeScript type definitions
- utils/        — Utilities including logger

## Key commands
- `bun install` — install dependencies
- `bun run dev` — run in development mode
- `bun run start` — run in production mode
- `bun test` — run tests
- `bun run lint` — run ESLint

## Runtime verification
The server runs at http://localhost:3000 (port comes from 
`process.env.PORT`, defaulting to 3000). Verify it is up:

    curl -s http://localhost:3000/api/v1/health/

(The health route lives in src/routes/healthRoutes.ts: the Elysia 
instance has prefix `/health` and the route path is `/`, and every 
route module is mounted inside `app.group('/api/v1', ...)` in 
src/index.ts — so the full path is `/api/v1/health/`. It returns 
`status: 'UP'` plus per-service status, or HTTP 503 if a service is 
unhealthy. Corrected 2026-09-18: this previously documented `/health`, 
which omits the `/api/v1` group and returns 404.)

Verify MongoDB is running locally:

    mongosh --eval 'db.runCommand({ ping: 1 })'

(or `pgrep mongod`). If either is down, tell the user — do not start 
services without approval.

## API conventions
- Base framework: Elysia (similar to Express/Hono)
- Every route module is mounted inside `app.group('/api/v1', ...)` in 
  src/index.ts, so every real path begins with `/api/v1`
- Each route module then adds its own prefix (e.g. /crm, /reportDash)
- Existing endpoints use Spanish naming (vendedores, contactos, 
  oportunidades, actividades)
- Maintain this naming convention for all new endpoints

## Current API endpoints
This section is the single source of truth for the API surface — the 
frontend repo intentionally keeps no copy. The merge-documentation skill 
appends new endpoints here.

- POST /api/v1/crm/vendedores — create salesperson
- GET /api/v1/crm/contactos/buscar — search contacts by name
- GET /api/v1/crm/actividades/buscar — search activities
- GET /api/v1/crm/oportunidades/buscar — search opportunities
- GET /api/v1/reportDash/report — fetch sales dashboard data for a 
  salesperson

(Paths corrected 2026-09-18 to include the `/api/v1` group prefix, 
verified against src/index.ts and the route modules. They previously 
omitted it, which is why the audit flagged them as wrong.)

## Integration notes
The frontend (valya_front) needs to connect to these routes. New endpoints 
will likely be needed — for example, listing all contacts, all opportunities, 
and updating pipeline status. Follow existing patterns in crmRoutes.ts when 
adding new routes.

## Per-repo docs
This repo carries its own docs/ folders at the repo root: docs/audit/, 
docs/plans/, docs/reports/, docs/releases/, docs/archive/. The shared 
planning documents (build plan in docs/build-plan/, feature briefs in 
docs/briefs/) live in the valya_front repository.

## Working rules
- All code, comments, and identifiers are in Spanish, matching existing 
  conventions — never translate or rename existing Spanish identifiers. 
  Claude responses are in English.
- Use `bun` commands only — never `npm` or `node`.
- Test changes locally with `bun run dev` before committing.
- When a task requires changes to more than one file, list all affected 
  files and wait for approval before proceeding.

## Git workflow
- Always create a branch before making changes; never work directly on 
  the default branch. Note: this repo's default branch is `master`.
- Branch conventions (short, lowercase, hyphenated):
  - `feature/description` — new functionality 
    (e.g. feature/connect-contacts-endpoint)
  - `fix/description` — bug fixes (e.g. fix/crm-route-error)
  - `explore/description` — investigation/reading code without changes
  - `docs/description` — documentation-only changes (files under docs/ 
    and CLAUDE.md, e.g. docs/add-claude-md)
- Commits:
  - Never commit directly to the default branch
  - One commit per logical change
  - Describe what and why in plain English
  - Always show the proposed commit message and wait for approval 
    before committing
  - Never push without explicit approval
  - Exception: the end-session, code-review, and merge-documentation 
    skills make documentation-only commits/pushes autonomously after 
    passing their docs-only self-check
- If something goes wrong with git: stop immediately, do not fix git 
  errors by making more changes, explain in plain English, and wait 
  for instruction.

## Security
- Never read, display, or output the contents of any `.env` file
- Use `.env.example` to understand the configuration structure
- Always reference environment variables by name, never by value 
  (e.g. `process.env.GEMINI_API_KEY`)
- Never include API keys, tokens, or passwords in any code or suggestion
- Never modify `.env` or `.env.example` without explicit user approval

## Deployment
This repo contains Vercel deployment configuration (vercel.json). Do not 
modify deployment configuration unless explicitly asked.

## Documentation rules

### What to document
- New API endpoints added or modified, including their purpose 
  and expected inputs/outputs
- Changes to the database models or schema
- Dependencies added to the project
- Environment variables added to .env.example
- Bugs discovered and how they were fixed
- Anything the backend developer clarifies about how the agent works

### When to document
- After completing any task, before ending the session
- When discovering something about the codebase that wasn't 
  previously known
- When a decision is made that future sessions should know about

### How to document
- Keep entries concise — one or two lines maximum
- Always show the user the proposed documentation update and wait 
  for approval before writing it
- Never remove or overwrite existing documentation without 
  explicit approval from the user
- Add a date to any new entries in this format: YYYY-MM-DD
- New API endpoints should be added to the "Current API endpoints" 
  section in this format:
  `- METHOD /path/endpoint — description (added YYYY-MM-DD)`
- If unsure whether something is worth documenting, ask the user
