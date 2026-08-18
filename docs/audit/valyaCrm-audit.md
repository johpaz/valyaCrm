Audit: valyaCrm
Date: 2026-06-23
Branch: explore/valyaCrm-audit
Repository type: Backend

## Repository overview

valyaCrm is the **backend agent** for Valya — an AI sales assistant that field
sales reps talk to over WhatsApp (text and voice). The backend receives WhatsApp
messages via a webhook, transcribes any voice notes, runs them through a
Google Gemini AI agent, and reads/writes CRM data (companies, contacts,
opportunities, activities, products, won-sales) in a local MongoDB database. It
also integrates with Google Calendar and email.

The code is organised in clean layers: `routes` (the web-facing API) call
`services` (the business logic) which read/write `models` (the database shapes).
A separate `langgraph`/`langchain` area holds the AI agent. All code and
identifiers are in Spanish, by project convention.

One headline finding up front: the codebase contains **two parallel versions of
the AI agent** — a sophisticated multi-step "graph" version (planning → approval
→ execution → summary, plus an embeddings/knowledge-graph subsystem) and a
simpler single-prompt version. **Only the simpler version is actually wired into
the live system.** The sophisticated version is present but unused (dead code).
This is detailed throughout and matters a lot for planning future work.

## Tech stack

Runtime and framework:
- **Bun 1.2.23** — the JavaScript runtime (used instead of Node.js)
- **TypeScript 5.9.3** — the language (strict mode enabled in tsconfig)
- **Elysia 1.4.15** — the web framework (handles HTTP routes), with
  `@elysiajs/cors` 1.4.0 (cross-origin access) and `elysia-helmet` 3.0.0
  (security headers)

Database:
- **MongoDB 7.0.0** (native driver) and **Mongoose 8.19.3** (the modelling
  layer actually used by all models) — running locally

AI / language:
- **@langchain/langgraph 1.0.2**, **@langchain/core 1.0.4**, **langchain 1.0.4**,
  **@langchain/mongodb 1.0.0** — AI agent framework (only lightly used; see
  findings)
- **@google/generative-ai 0.24.1** and **@google/genai 1.29.0** — Google Gemini
  client. Models referenced in code: `gemini-2.5-flash` (conversation,
  transcription), `gemini-2.5-pro` (planning, unused), `gemini-1.5-flash`
  (image vision), `text-embedding-004` (embeddings, unused)

External integrations:
- **googleapis 166.0.0** + **google-auth-library 10.5.0** — Google Calendar
- **resend 4.7.0** — transactional email
- OpenAI Whisper — referenced for audio transcription (via direct `fetch`, no
  SDK dependency); **see finding: the live path uses Gemini, not Whisper**

Utilities:
- **pino 10.1.0** + **pino-pretty 13.1.2** — logging
- **date-fns 4.1.0**, **mathjs 15.1.0**, **form-data 4.0.4**
- **eslint 9.39.1** — linting

Deployment:
- **vercel.json** present — configured to build `src/index.ts` via
  `@vercel/node` and route all traffic to it

## Structure map

```
src/
├── index.ts            Entry point — boots Elysia, connects DB, mounts all
│                       routes under /api/v1, starts media-cleanup timer
├── config/
│   └── database.ts     Connects to MongoDB via Mongoose
├── routes/             The API surface (web-facing endpoints)
│   ├── crmRoutes.ts        /crm — create salesperson, search entities
│   ├── reportRoutes.ts     /reports — analytics endpoints (all stubs)
│   ├── reportDash.ts       /reportDash — dashboard data (working)
│   ├── calendarRoutes.ts   /calendar — Google Calendar OAuth flow
│   ├── healthRoutes.ts     /health — service health check
│   └── webhookRoutes.ts    /webhook — incoming WhatsApp messages
├── models/             MongoDB/Mongoose data shapes (Spanish)
│   ├── vendedorModel.ts, adminModel.ts, empresaModel.ts,
│   ├── contactoModel.ts, oportunidadModel.ts, actividadModel.ts,
│   ├── productoModel.ts, ventaGanadaModel.ts, conversacionModel.ts
├── services/           Business logic
│   ├── crmService.ts            Core CRM data operations (largest file)
│   ├── toolsManager.ts          Defines the AI agent's 22 "tools"
│   ├── whatsappService.ts       Sends WhatsApp messages
│   ├── mediaService.ts          Downloads media; has its own transcription
│   ├── transcriptionService.ts  Audio→text (used by live webhook path)
│   ├── calendarService.ts       Google Calendar create/list events
│   ├── conversationService.ts   Conversation history + seller cache
│   ├── reportServices.ts        Dashboard aggregation (used by reportDash)
│   ├── healthCheckService.ts    Checks DB + API keys configured
│   ├── sendMail.ts              Sends email via Resend
│   ├── embeddingService.ts      Vector embeddings (UNUSED in live path)
│   ├── knowledgeGraphService.ts In-memory knowledge graph (UNUSED in live path)
│   ├── vendorExperienceService.ts  Command parsing (NOT imported anywhere)
│   └── debugService.ts          Duplicate empresa search (NOT imported anywhere)
├── langchain/
│   └── agentService.ts     Live agent entry point — calls the simplified workflow
├── langgraph/
│   ├── workflow.ts         The ACTIVE agent: one Gemini prompt, parse one tool
│   └── nodes/              A fuller graph agent — NONE of these are imported
│       ├── planning.ts, approval.ts, execution.ts,
│       └── knowledgeRetrieval.ts, summary.ts
├── types/
│   └── index.ts            TypeScript interfaces + custom error classes
└── utils/
    └── logger.ts           Pino logger setup
```

Root config files:
- `package.json` — scripts: `dev` (bun --hot), `build`, `start`, `test`, `lint`
- `tsconfig.json` — strict TypeScript, target ES2020, NodeNext modules
- `vercel.json` — Vercel deployment config
- `.gitignore` — ignores node_modules, `.env`, logs, media, etc.
- `.env` / `.env.example` — environment configuration (`.env` is NOT tracked
  by git — verified)

## API endpoints (backend)

**Important:** in `index.ts` every route group is mounted inside a global
`/api/v1` group. So the real, full path of each endpoint includes that prefix.
This differs from what the repo CLAUDE.md "Current API endpoints" section lists
(it omits `/api/v1` and the sub-prefixes) — see Open Questions.

Health
- `GET /api/v1/health/` — returns `status: UP` plus per-service status (DB,
  Google, Gemini, OpenAI, Resend), or HTTP 503 if unhealthy. **Note:** the repo
  CLAUDE.md says the health path is `/health`, but because of the `/api/v1`
  group the actual path is `/api/v1/health/`. Flagged as an open question.

Root
- `GET /` — returns name/version JSON (defined directly on the app, NOT inside
  `/api/v1`)

CRM (`/api/v1/crm`)
- `POST /api/v1/crm/vendedores` — create a salesperson. Input: salesperson
  fields in the body. Output: created salesperson (201) or error (500).
- `GET /api/v1/crm/contactos/buscar?nombre=` — search contacts by name.
  **Incomplete:** the salesperson id is passed as an empty string (hardcoded
  `''`, with a code comment "Need vendedorId, but for now empty"). The
  underlying service casts that empty id to a MongoDB ObjectId, so this
  endpoint will error.
- `GET /api/v1/crm/actividades/buscar?nombre=` — search activities by
  description. Same hardcoded-empty-salesperson-id root cause; here it will not
  error but will return nothing useful (the empty id is used directly in the
  query filter).
- `GET /api/v1/crm/oportunidades/buscar?nombre=` — search opportunities by
  name. Same as activities: returns nothing useful rather than erroring.

Reports (`/api/v1/reports`) — all require a `userId` query param for a weak
auth check, and **all return `{ message: 'Not implemented yet' }`** because the
backing service methods are unfinished stubs:
- `GET /api/v1/reports/sales-over-time?startDate=&endDate=` — stub
- `GET /api/v1/reports/pipeline-by-stage` — stub
- `GET /api/v1/reports/sales-by-vendor?startDate=&endDate=` — stub (admin only)
- `GET /api/v1/reports/recent-activity?limit=` — stub
- `GET /api/v1/reports/entity-overview` — stub (admin only)

Dashboard (`/api/v1/reportDash`)
- `GET /api/v1/reportDash/report?vendedorId=&userId=` — **working.** Returns a
  single bundle for one salesperson: their profile, up to 10 pending/in-progress
  activities, opportunities grouped by stage (with counts), their companies,
  sales totals for the last 6 months, last 10 conversation messages, top 10
  products, and top 10 contacts. This is currently the richest real data
  endpoint and the most likely candidate to feed the frontend dashboard.

Calendar (`/api/v1/calendar`)
- `GET /api/v1/calendar/auth/:sellerId` — redirects the salesperson to Google's
  consent screen to authorise Calendar access.
- `GET /api/v1/calendar/oauth2callback?code=&state=` — Google redirects back
  here; exchanges the code for tokens and stores them **in memory** (see
  technical debt).

Webhook (`/api/v1/webhook`)
- `GET /api/v1/webhook/webhook` — WhatsApp verification handshake (checks the
  verify token). Note the doubled `/webhook/webhook` (prefix + path).
- `POST /api/v1/webhook/webhook` — receives incoming WhatsApp messages. Replies
  to WhatsApp immediately (200) and processes messages asynchronously: text is
  read directly; audio is downloaded and transcribed; the text is sent to the
  agent; the agent's reply is sent back over WhatsApp.

## Data and models (backend)

Database: MongoDB, connected via Mongoose in `config/database.ts`. **Note:** the
connection hardcodes the database name `crm_vendedor_b2b`, which overrides
whatever database name is in the `MONGODB_URI` (the `.env.example` shows
`whatsapp_agent_db`). Flagged in technical debt.

Models (all in Spanish, all with `fechaCreacion`/`fechaActualizacion`
timestamps via pre-save hooks):

- **Vendedor** (salesperson): nombre, email (unique), telefono (unique),
  cargo, **contrasena (password, stored as a plain string)**, rol
  (vendedor/admin), activo. The salesperson is matched to an incoming WhatsApp
  message by their `telefono`.
- **Admin**: nombre, email (unique), rol (admin), activo.
- **Empresa** (company): nombre, telefono, email, direccion, notas, vendedorId,
  sector, tamano, ubicacion, sitioWeb, descripcion, **embedding** (number
  array, for the unused vector search).
- **Contacto** (contact): nombre, empresaId (required), email, telefono, cargo,
  **vendedor** (required — note this field is named `vendedor`, not
  `vendedorId`, unlike the other models). Has a virtual `empresa` populate.
- **Oportunidad** (opportunity/deal): empresaId, productoId, vendedorId
  (required), contactoId, **estado** (one of: Prospecto, Calificado, Propuesta,
  Negociación, Cerrado Ganado, Cerrado Perdido, Seguimiento), nombre (required),
  valorEstimado, fechaCierre, valorCierre, comision, proximosPasos, actividades
  (array of refs), notas.
- **Actividad** (activity/task): oportunidadId (required), vendedorId
  (required), contactoId, tipo, nombre, descripcion, fecha, **estado** (one of:
  Pendiente, Backlog, En progreso, En revisión, Bloqueado, Finalizada — these
  read like Kanban columns), many date fields, notas, prioridad (Baja/Media/Alta).
- **Producto** (product): nombre (required), tipo, proveedor[], marca[],
  clasificacion, precio, descripcion, vendedorId (required).
- **VentaGanada** (won sale): oportunidadId (required), valor (required), fecha,
  mes, año, vendedorId (required). Creating one also flips its opportunity to
  "Cerrado Ganado".
- **Conversacion** (conversation message): userId (phone number), text, sender
  (user/model), timestamp, metadata. Indexed by userId + timestamp.

Note: there are **three different definitions of these entities** in the
codebase — the Mongoose models (above), the TypeScript interfaces in
`types/index.ts`, and a second set of interfaces inside
`knowledgeGraphService.ts`. They do not fully agree with each other (e.g. the
opportunity is `estado`/`nombre`/`valorEstimado` in the model but
`etapa`/`titulo`/`valor` in the knowledge-graph interface; the activity `estado`
enum differs between the model and `types/index.ts`). Flagged in technical debt.

How the AI agent reaches the data: `toolsManager.ts` wraps `crmService` methods
as 22 named "tools" the agent can call (e.g. `crear_empresa`,
`buscar_contacto_por_nombre`, `listar_oportunidades`, `consultar_calendario`).
The live agent prompts Gemini to emit a `TOOL:`/`ARGS:` block, then runs that one
tool.

## External integrations

- **WhatsApp Business API** (Meta Graph API v23.0) — receives messages via the
  webhook; sends replies, interactive buttons, images, and read receipts via
  `whatsappService.ts`. Auth via `WHATSAPP_ACCESS_TOKEN` /
  `WHATSAPP_PHONE_NUMBER_ID`.
- **Google Gemini** — the conversational agent, plus audio transcription and
  image description. Auth via `GEMINI_API_KEY`.
- **OpenAI Whisper** — referenced in `mediaService.ts` for transcription, but
  the **live webhook path uses `transcriptionService.ts`, which uses Gemini (or
  Google Cloud Speech-to-Text if configured), not Whisper.** See Open Questions.
- **Google Calendar** — OAuth per salesperson; creates calendar events when
  activities are logged, and lists today's events. Auth via `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`.
- **Resend** — sends email (e.g. an executive summary after CRM actions). Auth
  via `RESEND_API_KEY`. Sender address is hardcoded to
  `valya@tuprofedeia.com.co`.

Environment variables documented in `.env.example`: `GEMINI_API_KEY`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `OPENAI_API_KEY` (optional), `MONGODB_URI`,
`PORT`, `NODE_ENV`, `LOG_LEVEL`, `MEDIA_CLEANUP_HOURS`, `USE_LANGCHAIN`.

Environment variables **used in code but missing from `.env.example`** (verified):
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL` (all in
`calendarService.ts`), `RESEND_API_KEY` (in `sendMail.ts`),
`GOOGLE_APPLICATION_CREDENTIALS` (in `transcriptionService.ts`). Flagged in gaps.

## Existing patterns

Conventions to follow when adding functionality:
- All identifiers, comments, and data fields are in **Spanish**. Match this.
- Routes are thin: they parse the request, call a service method, and return.
  Business logic lives in services, never in routes.
- Each route file creates an Elysia instance with a `prefix` and is mounted
  inside the `/api/v1` group in `index.ts`.
- Services that hold no per-request state are exported as singletons
  (`export default new XService()`); `crmService` is a singleton class instance.
- Logging is done through the shared `pino` logger (`utils/logger.ts`), not
  `console.*` (four files still use `console`, inconsistently).
- Errors: custom error classes live in `types/index.ts` (`AppError`,
  `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`)
  with HTTP status codes attached.

### Step-by-step: how to add a new API endpoint

This is the pattern used by the existing CRM routes, documented so a future
session can follow it without re-reading the whole codebase:

1. **Add the data operation to a service.** In `src/services/crmService.ts`
   (the `CRMService` class), add an `async` method that does the MongoDB work
   via the Mongoose models and returns the result. Wrap it in try/catch and log
   with `logger`. Follow the Spanish naming of the surrounding methods (e.g.
   `obtenerContactosPorVendedor`).
2. **Add the route.** In the relevant file under `src/routes/` (e.g.
   `crmRoutes.ts`), register a handler on the existing Elysia instance:
   `crmRoutes.get('/path', async ({ query }) => { ... })` (or `.post`, with
   `{ body }`). Read inputs from `query`/`params`/`body`, call your new service
   method, and return the result (Elysia serialises objects to JSON). For
   non-200 responses, return `new Response(JSON.stringify(...), { status })`.
3. **Mounting is automatic** if you add the route to an existing route file,
   because that file is already mounted in `index.ts`. If you create a **new**
   route file, also import it in `src/index.ts` and add `.use(yourRoutes)`
   inside the `/api/v1` group.
4. **Keep the prefix in mind.** A route defined as `/contactos` inside a file
   with `prefix: '/crm'` becomes `/api/v1/crm/contactos`.
5. **Document it** in the repo `CLAUDE.md` "Current API endpoints" section in
   the format `- METHOD /path — description (added YYYY-MM-DD)`.

## Test coverage

**There are no tests.** Zero `.test.ts` / `.spec.ts` files exist anywhere in the
repo. The `package.json` has a `test` script (`bun test`) but nothing for it to
run. `tsconfig.json` excludes `**/*.test.ts`, anticipating tests that were never
written. This means there is no automated safety net for changes.

## Gaps and missing pieces

Endpoints the frontend will likely need but that **do not exist yet**:
- **List endpoints** for the main entities. The services can list companies,
  contacts, opportunities, activities, and won-sales by salesperson
  (`obtener...PorVendedor` methods exist in `crmService`), but **none of these
  are exposed as routes.** Only "search by name" is exposed for some entities.
- **Update/move endpoints.** The service can update an opportunity's stage
  (`actualizarOportunidad`) and edit contacts/companies/activities, but **no
  routes expose these.** A Kanban board that moves a deal between stages has no
  endpoint to call.
- **Create endpoints** for companies, contacts, opportunities, activities,
  products via the API. These exist only as agent "tools", not as REST routes.
  (Only `POST /crm/vendedores` exists.)

Things that exist but are **incomplete / stubbed**:
- The five `/api/v1/reports/*` analytics endpoints all return "Not implemented
  yet" — the backing methods in `crmService` are empty stubs.
- The three `/crm/.../buscar` search endpoints pass an empty salesperson id; the
  contacts one errors, the other two return nothing useful.

Things that are **built but unused (dead code)** — present in the repo but not
reachable from the running system:
- The entire `langgraph/nodes/` graph agent (planning, approval, execution,
  knowledge retrieval, summary). Verified: nothing imports `langgraph/nodes`.
- The `embeddingService` and `knowledgeGraphService` (vector search / knowledge
  graph) — only referenced by the unused `knowledgeRetrieval` node.
- `vendorExperienceService.ts` and `debugService.ts` — not imported anywhere.
- The human-in-the-loop **approval flow is non-functional**: the live workflow
  never sets `requiresApproval`, and even when the agent is in "awaiting
  approval" state it just returns a canned confirmation without executing the
  approved plan (there is a code comment acknowledging this).

Missing configuration documentation:
- Five environment variables used in code are absent from `.env.example`
  (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`,
  `RESEND_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`).

## Security observations

Observations only — not actioned, per the audit rules.

- **Passwords stored in plain text.** `vendedorModel` has a `contrasena`
  (password) field stored as a plain string; no hashing is visible anywhere.
- **Most endpoints have no authentication.** The `/crm`, `/reportDash`, and
  `/webhook` routes have no auth. The `/reports` routes have only a weak check:
  a `userId` passed in the query string is looked up in the database — there is
  no password or token verification, and the id travels in the URL.
- **CORS is wide open.** `cors()` is applied with default settings (allows any
  origin). `helmet()` is applied, which is good for response security headers.
- **`.env` is safe.** `.env` exists locally but is git-ignored and is **not**
  tracked in the repository (verified). No secrets appear to be committed.
- **Calendar tokens live in memory.** OAuth tokens are stored in a plain
  in-process object (a code comment notes this should be a database in
  production). They are lost on restart and will not work reliably on
  serverless/Vercel.

## Connection requirements

What the frontend (valya_front) will need from this backend to show real data
and act on it. This directly informs the build plan:

1. **List endpoints per salesperson**, to populate the CRM and Kanban views:
   - list opportunities (with stage, value, company, contact) — service method
     `obtenerOportunidadesPorVendedor` exists; needs a route.
   - list contacts — `obtenerContactosPorVendedor` exists; needs a route.
   - list companies — `obtenerEmpresasPorVendedor` exists; needs a route.
   - list activities/tasks (these carry Kanban-like `estado` values) —
     `obtenerActividadesPorVendedor` exists; needs a route.
   - list won sales — `obtenerVentasGanadasPorVendedor` exists; needs a route.
2. **Update endpoints**, so UI actions change backend data:
   - move/update an opportunity's stage — `actualizarOportunidad` exists; needs
     a route.
   - update an activity's `estado` (to drag tasks across Kanban columns) —
     `editarActividad` exists; needs a route.
   - edit contacts / companies — service methods exist; need routes.
3. **Analytics data** for the dashboard:
   - either finish the five `/reports/*` stubs, or have the frontend consume the
     already-working `/reportDash/report` bundle. A decision is needed on which.
4. **A consistent contract**: agreed field names (Spanish), an agreed auth
   approach, agreed full paths (the `/api/v1` prefix and per-route prefixes),
   and agreed shapes for list responses (e.g. whether pagination is included —
   currently there is none).
5. **A reliable way to identify the current salesperson** (today the dashboard
   needs both `vendedorId` and `userId` as query params; the frontend will need
   to know how to obtain these).

## Technical debt

- **Two parallel agent implementations**, only one used. The richer
  `langgraph/nodes` graph and the embeddings/knowledge-graph subsystem are dead
  code. This is confusing and inflates the codebase; a decision is needed on
  whether to adopt or remove it.
- **No tests at all** — no safety net for changes.
- **Three diverging definitions** of the core entities (Mongoose models,
  `types/index.ts`, knowledge-graph interfaces) that disagree on field names and
  enums.
- **Hardcoded database name** in `config/database.ts` (`crm_vendedor_b2b`)
  overrides the `MONGODB_URI` database — easy to trip over.
- **Inconsistent salesperson field naming**: `Contacto` uses `vendedor` while
  every other model uses `vendedorId`.
- **Two transcription implementations** (`mediaService` using Whisper vs
  `transcriptionService` using Gemini) with copy-pasted "simulated" fallbacks;
  only one is on the live path.
- **In-memory state that won't survive serverless**: calendar OAuth tokens, the
  embeddings store, and the seller cache are all in-process memory, which is at
  odds with the Vercel deployment config.
- **Mixed logging**: most code uses `pino`, four files use `console.*`.
- **Repeated try/catch/log boilerplate** across every service method.

## Open questions

These need input from you or the backend developer (johpaz):

1. **Health path:** the repo CLAUDE.md says the health check is at `/health`,
   but the code mounts it inside `/api/v1`, making the real path
   `/api/v1/health/`. Which is correct / intended?
2. **API path prefix:** the CLAUDE.md "Current API endpoints" list omits the
   `/api/v1` prefix and the per-route prefixes (e.g. it lists
   `GET /reportDash/report`, but the real path is `/api/v1/reportDash/report`).
   Should the documentation be updated to the real full paths?
3. **Transcription engine:** CLAUDE.md and the system overview say voice notes
   are transcribed with OpenAI Whisper, but the live path uses Gemini (via
   `transcriptionService`). Which is the intended engine going forward?
4. **The unused agent and knowledge-graph code:** is the `langgraph/nodes` graph
   + embeddings/knowledge-graph subsystem intended to become the real agent
   (work in progress), or is it abandoned and safe to ignore/remove?
5. **Reports vs dashboard:** should the frontend dashboard be built on the
   working `/reportDash/report` bundle, or do the `/reports/*` endpoints need to
   be finished first?
6. **Auth model:** what authentication approach should new frontend-facing
   endpoints use? There is currently effectively none.
7. **Password handling:** are plain-text passwords in `vendedorModel` a known
   issue, and is it in scope to address?
