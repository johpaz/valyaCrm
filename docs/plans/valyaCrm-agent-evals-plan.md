# Evals Plan: the Valya agent (valyaCrm)

Date: 2026-07-31
Status: DRAFT — pending Maya's review
Based on: docs/audit/valyaCrm-audit.md (2026-06-23) + direct re-reading of the
live agent code (`src/langchain/agentService.ts`, `src/langgraph/workflow.ts`,
`src/services/toolsManager.ts`) on 2026-07-31.

---

## 1. What this is

An **eval** (evaluation) is a repeatable test for an AI feature. Instead of
testing code logic ("does 2+2 return 4"), an eval feeds the AI realistic
inputs — here, WhatsApp messages a sales rep would actually send — and grades
the answers against what a good answer looks like. Because AI output varies
run to run, evals are scored as percentages ("the agent picked the right tool
in 92% of cases"), not pass/fail on a single try.

Today valyaCrm has **zero tests of any kind** (audit finding). This plan
deliberately starts with the agent, not the plain API code, because the agent
is the product: it's what reps talk to, and it's the part whose behaviour
nobody can currently measure. Every future prompt tweak or model upgrade is a
blind change until evals exist.

## 2. What exactly we are evaluating

The **live agent path only** — the one real users hit:

```
WhatsApp message → agentService.handleMessage(phone, text)
  → runCRMWorkflow (one Gemini 2.5 Flash prompt)
  → Gemini either answers conversationally, OR emits a "TOOL: / ARGS:" block
  → if a tool block: the named tool (1 of 22) runs against MongoDB
  → the reply text goes back to the rep
```

Explicitly **out of scope** for now:
- The unused `langgraph/nodes` graph agent, embeddings, and knowledge graph
  (dead code per the audit — evaluating it would measure nothing real).
- The REST API routes (they need ordinary unit/integration tests, a separate
  and cheaper effort — noted in §10 as a follow-up, not acted on here).
- Voice-note transcription quality (Phase 3, see §7 — it's a separate
  component with its own inputs and failure modes).

### The 22 tools, grouped

| Area | Tools |
|---|---|
| Companies (empresas) | crear, buscar_por_nombre, actualizar, listar |
| Contacts (contactos) | crear, buscar_por_nombre, buscar_por_id, actualizar, listar |
| Opportunities (oportunidades) | crear, buscar_por_nombre, buscar_por_empresa, actualizar, listar |
| Activities (actividades) | crear, buscar_por_descripcion |
| Products (productos) | crear, buscar_por_nombre, actualizar |
| Won sales (ventas ganadas) | crear, listar |
| Calendar | consultar_calendario |

## 3. The six things we grade

Each eval case is graded on whichever of these apply:

**A. Tool choice** — did the agent pick the correct tool out of 22, or
correctly pick *no* tool (greetings, questions, chit-chat)? This is the
single most important number. Graded automatically by exact match.

**B. Argument extraction** — did it pull the right values out of the
message? ("Crea la empresa Acme, sector tecnología" → `nombre: "Acme"`,
`sector: "tecnología"`.) Graded automatically, field by field.

**C. Format compliance** — did the tool block come out in the exact
`TOOL: ...\nARGS: {...}` shape the code's parser expects? This matters more
than it sounds: the parser is strict (single-line JSON, exact line breaks),
so a *correct decision in a wrong format* silently becomes a chat-only reply
and the CRM action never happens. A related cosmetic failure: if the model
wraps the block in markdown code fences, the action still runs but stray
backtick characters leak into the reply the rep sees. Graded automatically.

**D. Reply quality** — is the reply in natural Spanish, friendly, accurate
about what actually happened, with no leaked `TOOL:` syntax shown to the rep?
Graded by an LLM judge (a second AI call that scores the reply against a
rubric) — the standard technique for grading free-form text.

**E. Safety of writes** — after the run, is the database in the state we
expect and *only* that state? Right record created, attached to the right
vendedor, no duplicates, nothing written when nothing should be. Graded
automatically by inspecting the test database after each case.

**F. Context handling** — multi-turn cases: "busca la empresa Acme" then
"ahora créale un contacto: Juan Pérez". Does turn 2 use what turn 1
established? Graded on the turn-2 tool choice and args.

## 4. How evals run (the harness)

The harness is a script (run with `bun`, matching the repo) that:

1. Connects to a **dedicated test database** — never the real one. Seeds it
   with a small fixed cast: 2 vendedores, ~5 empresas, contacts,
   opportunities in various stages, a few products and activities. Every run
   starts from this same known state.
2. Calls **`runCRMWorkflow` directly** (or `agentService.handleMessage`),
   passing the message text and a seeded vendedor. WhatsApp is never
   involved — no real messages can be sent, because the WhatsApp send code
   only lives in the webhook path we're bypassing.
3. **Disables external side effects**: Google Calendar and Resend email
   must be stubbed (fake in-test replacements) so no real events or emails
   are created. ⚠️ To verify during build: exactly which tools trigger
   calendar/email calls (the audit says activity-logging creates calendar
   events and some actions send a summary email).
4. Captures three artefacts per case: the raw Gemini output (to grade C),
   the tool + args actually executed (A, B), and the final reply text (D).
   Then inspects the test DB (E).
5. **Runs every case 3 times.** Gemini at temperature 0.3 is not
   deterministic; a case "passes" at 3/3, is "flaky" at 1–2/3, "fails" at
   0/3. Flaky is a real result — it's what reps experience as "sometimes it
   works".
6. Writes a scorecard (per-dimension percentages + every failing transcript)
   to `docs/reports/` per the docs taxonomy, so runs are comparable over
   time.

Note: the code fast-paths exact greetings ("hola", "gracias") without
calling Gemini at all. A couple of cases should cover that path, but
near-greetings ("holaa", "buenas!") do hit Gemini and belong in the no-tool
set.

## 5. The golden dataset (the test messages)

Realistic Spanish WhatsApp messages, written the way reps actually type:
short, informal, abbreviations, missing accents, typos.

Composition at full build-out (~120–140 cases):

| Slice | Cases | Purpose |
|---|---|---|
| Per-tool "happy path" | 22 tools × 3–4 phrasings ≈ 75 | Core tool choice + args |
| No-tool messages | ~15 | Greetings, thanks, questions, off-topic — agent must NOT touch the CRM |
| Ambiguous messages | ~10 | "agéndame algo con Acme" — acceptable answers include asking for clarification |
| Multi-turn sequences | ~10 (2–3 turns each) | Context handling |
| Adversarial/edge | ~10 | Names with quotes/emoji/line breaks (stress the JSON parsing), very long messages, two requests in one message (the agent can only run ONE tool per message — expected behaviour needs defining, see §9) |
| Unregistered number | 2 | Polite refusal path |

Two sourcing options for the messages themselves:
- **Authored**: Maya + johpaz write them (johpaz for realism of rep
  language; Maya for coverage of product intent). Slower, clean.
- **Mined**: the `conversaciones` collection in the live database contains
  real rep messages — the best possible source of realistic phrasing.
  ⚠️ Needs a decision: is it OK to copy real messages (real names, phone
  numbers, company names) into a test fixture that lives in the git repo?
  Recommendation: mine for *phrasing patterns* but rewrite with fictional
  names before committing anything.

## 6. Grading and thresholds

Automatic grades (A, B, C, E) are computed by the harness. Reply quality (D)
uses an LLM judge with a written rubric; judge outputs are spot-checked by a
human the first few runs to confirm the judge itself is trustworthy.

Proposed initial thresholds — **deliberately provisional** until the first
baseline run tells us where we actually stand:

| Dimension | Target | Hard floor |
|---|---|---|
| A. Tool choice | ≥ 90% | ≥ 80% |
| B. Args (all required fields correct) | ≥ 85% | ≥ 75% |
| C. Format compliance | ≥ 95% | ≥ 90% |
| D. Reply quality (judge ≥ 4/5) | ≥ 85% | — |
| E. No unintended DB writes | 100% | 100% (any failure is a stop-the-line bug) |

The first run establishes the **baseline**; after that the rule is simple:
no prompt/model change ships if it moves any dimension below its floor or
meaningfully below the previous baseline.

## 7. Phases

**Phase 0 — Harness plumbing** (est. 1–2 dev sessions)
Eval runner script, test-DB seeding, calendar/email stubs, scorecard output.
No eval cases yet beyond 2–3 to prove the pipe works. This is the only phase
that is mostly code.

**Phase 1 — Smoke set** (est. 1 session)
~30 cases: the 8–10 most-used tools, the no-tool slice, 2 unregistered-number
cases. Produces the first baseline scorecard. **Decision gate: review the
baseline together before investing in Phase 2.**

**Phase 2 — Full coverage** (est. 2 sessions)
All 22 tools, args grading, ambiguous + adversarial slices, multi-turn,
DB-state assertions (E). Produces the full scorecard this plan's thresholds
apply to.

**Phase 3 — Quality & voice** (est. 1–2 sessions)
LLM-judge reply grading (D); a small voice-note set (recorded Spanish audio
clips → transcription → agent) to measure the end-to-end path reps on voice
actually experience.

**Ongoing — Regression habit**
Re-run Phase 1's smoke set on every agent prompt change or Gemini model
bump; full set before anything user-visible ships. (CI automation is parked
with the other GitHub Actions work — manual runs until then.)

## 8. Cost and effort

- **API cost is negligible.** ~140 cases × 3 repetitions ≈ 420 Gemini 2.5
  Flash calls per full run, plus judge calls in Phase 3 — well under $1 per
  full run at current Flash pricing.
- **The real cost is people-time**: harness build (johpaz or a Claude Code
  build session, ~2 sessions) and dataset authoring (shared, spread across
  phases). Total rough estimate: 5–7 working sessions end to end.

## 9. Known code realities the evals will immediately expose

Flagged here so nobody is surprised by an ugly first baseline — these are
observations from reading the code, not fixes (out of scope for this plan):

1. **The tool parser is brittle.** It requires the JSON args on a single
   line with exact line breaks, and markdown fences (which models love)
   leak backticks into replies. Expect dimension C to be the early
   headline number.
2. **Malformed JSON crashes the turn.** If Gemini's ARGS aren't valid JSON,
   the code throws and the rep gets a generic "tuve un problema procesando
   tu solicitud" fallback instead of the action.
3. **One tool per message, maximum.** "Crea la empresa Acme y agéndame una
   llamada" can only ever half-happen. The dataset includes such cases; the
   *expected* behaviour (do the first? ask? refuse?) is a product decision —
   see §10.
4. **The approval flow is a stub.** If the agent ever enters "awaiting
   approval" state, saying "sí" returns a canned confirmation and executes
   nothing (confirmed by a code comment). One eval case should pin this
   down.
5. **History formatting is fragile.** The workflow assumes a specific
   conversation-history shape; multi-turn cases will test this directly.

A bad first score on these is the eval system *working* — it turns known
suspicions into measured, prioritisable numbers.

## 10. Decisions needed from Maya (and johpaz)

Nothing below blocks reviewing this plan; all of it blocks *starting* it.

1. **Who builds the harness** — johpaz, or a Claude Code build session in
   valyaCrm (branch `feature/agent-evals` per conventions)?
2. **Where eval code lives** — proposal: a top-level `evals/` folder in
   valyaCrm (kept out of the app's `src/`), with fixtures alongside.
3. **Test database** — a separate local DB name is easiest; note the audit's
   warning that `config/database.ts` hardcodes the DB name, so the harness
   must override it (small, contained change — needs johpaz's awareness).
4. **Real-message mining** — allowed with fictional-name rewriting (my
   recommendation), or authored-only?
5. **Multi-request messages** — what *should* the agent do today given the
   one-tool limit? (My suggestion: do the first action and explicitly say
   what it didn't do. But that's a prompt change — separate work.)
6. **Thresholds** — accept §6's provisional numbers until the baseline run?
7. **Priority tools for Phase 1** — my guess at the top 8: crear/buscar
   empresa, crear/buscar contacto, crear/actualizar/listar oportunidades,
   crear_actividad. Confirm against how reps actually use Valya.

## 11. Open items outside this plan (flagged, not actioned)

- The audit doc itself (and now this plan) sit **uncommitted** on branch
  `explore/valyaCrm-audit` — the whole `docs/` folder is untracked. Both
  docs need a home on `master` (likely via a `docs/` branch) or they remain
  invisible to future sessions and CI.
- Ordinary unit/integration tests for routes and services (the audit's
  "no tests" finding) — a separate, cheaper effort than agent evals.
- The dead graph-agent code question (audit open question #4) — if it's ever
  revived, this plan's harness works for it too, but no eval effort should
  target it until that decision is made.
