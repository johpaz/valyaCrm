Code Review Findings
Date: 2026-10-06
Branch: feature/identify-rep-by-phone
Session type: Feature
End-session report: **NONE — see warning below**
Feature brief: valya_front/docs/briefs/identify-rep-by-phone-brief.md
Execution plan: docs/plans/identify-rep-by-phone-execution-plan.md

## Review summary

The change is small, well-scoped and does what the brief asked: three files, one
new endpoint, one additive field selection, one documentation line. All six
acceptance criteria are met and were verified against a running backend. No
blocking issues.

Five warnings are worth the developer's attention, two of which were found by
probing the running endpoint rather than by reading the code: responses are
labelled as plain text rather than JSON, and every call writes a salesperson's
phone number into the application log. Neither breaks the feature, but both
affect the ticket that consumes this endpoint next.

**Process warning:** no end-session report exists for this branch, which is this
skill's primary input. This review was conducted from the git diff, the feature
brief, the execution plan and the repo audit instead. The cross-reference step
in Step 5 could not be performed.

## Criteria reviewed

- Naming conventions (Spanish identifiers, route naming, `/api/v1/crm` mounting)
- Security (hardcoded credentials, sensitive data, environment variables)
- Scope (changes match the execution plan; no unexpected changes)
- Acceptance criteria (all six from the feature brief)
- Existing patterns (against `docs/audit/valyaCrm-audit.md` "Existing patterns"
  and its documented step-by-step for adding an endpoint)
- Dependencies (any added, and whether justified)
- Error handling
- Console logs and debug statements left in code
- Test coverage
- Impact on the live WhatsApp path (the shared service method)

## Findings

### Blocking issues

None.

### Warnings

**W1 — Responses are labelled as plain text, not JSON**

- Plain English: the endpoint sends back correctly-formed data, but tells the
  receiving app it is sending plain text rather than structured data. Most tools
  cope, but some refuse to read it automatically, and the frontend would then
  receive a meaningless block of text instead of usable values.
- Technical detail: handlers return `new Response(JSON.stringify(...), { status })`
  with no `headers`. Verified against the running server: a successful call
  returns `content-type: text/plain;charset=utf-8`. Elysia sets
  `application/json` automatically when a handler returns a plain object, but not
  when it returns a hand-built `Response`.
- Location: `src/routes/crmRoutes.ts`, all four return paths of the new handler.
- Why it matters: the very next build-plan item is the frontend API client that
  consumes this endpoint. Some HTTP clients key their parsing off this label.
  Cheap to fix now, confusing to debug later.
- Note: the pre-existing `POST /vendedores` handler has the same flaw, so this is
  consistent with the codebase rather than a new deviation.
- Beyond PM scope: no.

**W2 — Phone numbers are written to the application log on every call**

- Plain English: every time someone looks up a rep, that rep's phone number is
  written into the server's log file in readable form — whether the lookup
  succeeds or fails. Phone numbers are personal data, and logs are usually kept
  for a long time and seen by more people than the database is.
- Technical detail: `buscarVendedorPorTelefono` logs the raw phone number at
  `info` level on entry and again on a miss. This logging is pre-existing, but
  until now the method was only reachable via the WhatsApp webhook. This change
  exposes it on the public HTTP surface, so log volume and exposure both rise.
  Related, on the same code path and outside this diff:
  `src/services/vendorExperienceService.ts` line 102 has a bare
  `console.log(phoneNumber)`.
- Location: `src/services/crmService.ts`, `buscarVendedorPorTelefono`.
- Why it matters: this endpoint was deliberately built as a POST with a body
  rather than a GET with the number in the URL, specifically to keep phone
  numbers out of request logs. That intent is undercut if the application logs
  the number anyway.
- Beyond PM scope: no — it is a decision about what to log, but a developer
  should pick the redaction approach.

**W3 — The endpoint allows unauthenticated lookup of any rep by phone number**

- Plain English: anyone who can reach the server can type in phone numbers and
  find out whether each one belongs to a sales rep — and if it does, get that
  person's name, role and internal id. There is no login, no limit on how many
  attempts can be made, and no record of who asked.
- Technical detail: no authentication (by design, per build-plan decision #1), no
  rate limiting, and CORS is wide open per the audit's security observations. The
  endpoint is an enumeration oracle over the salesperson collection.
- Location: `src/routes/crmRoutes.ts`, new handler.
- Why it matters: decision #1 accepted phone-only identity on the grounds that no
  confidential data is used in the beta. That reasoning covered rep *identity*; it
  may not have anticipated that identity becomes externally probeable. This is the
  first endpoint to expose it. Worth an explicit decision rather than an implicit
  one.
- Beyond PM scope: partly — the risk acceptance is a PM/product call; any
  mitigation (rate limiting, allow-listing) is a developer call.

**W4 — The 500 handler returns the internal error message to the caller**

- Plain English: if something goes wrong inside the server, the raw internal
  error text is sent back to whoever made the request. That text can reveal
  details about how the system is built.
- Technical detail: `JSON.stringify({ error: (error as Error).message })` on the
  500 path. Mongoose and MongoDB driver errors can include field names, collection
  names and connection details.
- Location: `src/routes/crmRoutes.ts`, catch block of the new handler.
- Why it matters: low likelihood, but it is information disclosure on an endpoint
  with no authentication in front of it.
- Note: matches the existing `POST /vendedores` pattern exactly, so this is a
  codebase-wide habit rather than a new deviation.
- Beyond PM scope: no.

**W5 — No automated tests for any acceptance criterion**

- Plain English: nothing checks automatically that this endpoint still works. If
  someone changes the shared lookup later, there is no alarm — a person has to
  notice.
- Technical detail: zero test files exist in the repo. The brief acknowledges this
  and tags every criterion as manual. All six were verified by hand against a
  running server, which is honest but not repeatable.
- Location: repo-wide.
- Why it matters: the shared method `buscarVendedorPorTelefono` is on the live
  WhatsApp path. This change to it is additive and both callers were inspected,
  but there is no safety net if a future change is less careful.
- Beyond PM scope: no — build-plan open question 8 already parks this decision
  with the PM.

### Observations

**O1 — Documented "exact match" is not strictly exact**

- Plain English: the documentation says a phone number must match exactly. In
  practice, a number with extra spaces around it is still found. That is more
  forgiving than advertised, which is fine — but the documentation and the
  behaviour should agree.
- Technical detail: `vendedorModel` declares `telefono` with `trim: true`, and
  Mongoose applies schema setters when casting query filters, so the lookup value
  is trimmed before the comparison. Verified: a request for `" +573001234567"`
  returns 200. The handler trims only to test for emptiness and passes the
  untrimmed value through, so the tolerance is incidental rather than deliberate.
- Location: `src/routes/crmRoutes.ts` / `src/models/vendedorModel.ts`.
- Beyond PM scope: no.

**O2 — `rol` is not guaranteed to be present in the response**

- Plain English: if a rep's record was created outside the normal path and has no
  role recorded, the response would simply leave the role out rather than saying
  so. The frontend might not expect a missing value.
- Technical detail: `rol` has a schema default of `'vendedor'`, so records created
  through Mongoose always have it. A document inserted directly into MongoDB would
  not, and `JSON.stringify` drops `undefined` keys — so the response would omit
  `rol`, which acceptance criterion 1 requires.
- Location: `src/routes/crmRoutes.ts`, success response.
- Beyond PM scope: no.

**O3 — No request-body validation schema**

- Technical detail: the handler validates `telefono` by hand rather than using
  Elysia's built-in body schema (`t.Object`). Consistent with the rest of the
  codebase, which uses `body: any` throughout, so not a deviation — but the
  framework offers this for free.
- Location: `src/routes/crmRoutes.ts`.
- Beyond PM scope: no.

**O4 — `CLAUDE.md` "Last updated" date not bumped**

- Technical detail: the file still reads `Last updated: 2026-06-12` although the
  API list gained an entry dated 2026-10-02.
- Location: `CLAUDE.md` line 3.
- Beyond PM scope: no.

### Criteria with no findings

- **Naming conventions** — `identificar`, `vendedorId`, `nombre`, `rol` are all
  Spanish and consistent with surrounding code; the route sits under
  `/api/v1/crm` as the brief required.
- **Security — credentials and secrets** — no hardcoded credentials, no secrets,
  no `.env` content, no environment variables misused. The outgoing diff was
  scanned and is clean.
- **Scope** — exactly the three files named in the execution plan changed, and
  nothing else. No unrelated edits.
- **Existing patterns** — the change follows the audit's documented step-by-step
  for adding an endpoint: thin route, logic left in the service, registered on the
  existing Elysia instance, auto-mounted, documented in `CLAUDE.md`.
- **Dependencies** — none added.
- **Console logs and debug statements** — none introduced by this change.
- **Impact on the live WhatsApp path** — the service change is additive
  (`'nombre email'` → `'nombre email rol'`). Both callers
  (`conversationService.getSeller`, `vendorExperienceService.isAuthorizedVendor`)
  pass the result straight through without inspecting fields. Confirmed at runtime
  that existing fields still return.

## Acceptance criteria assessment

1. **Active rep in canonical format returns 200 with `vendedorId`, name and role**
   — Code addresses it. No test coverage. Verified manually: 200 with all three
   fields. Matches end-session report: N/A (no report).
2. **Unknown phone returns 404 with a clear message, not 500 or empty 200** —
   Code addresses it. No test coverage. Verified manually: 404
   `{"error":"Vendedor no encontrado"}`.
3. **Missing or empty phone returns a client error (400), no crash** — Code
   addresses it. No test coverage. Verified manually across four shapes: absent
   key, empty string, whitespace-only, and a non-string value — all 400.
4. **Inactive rep returns 404** — Code addresses it, inherited from the existing
   `activo: true` filter rather than written fresh. No test coverage. Verified
   manually against a purpose-made inactive record.
5. **Response gives the frontend what it needs for rep-scoped calls** — Met.
   Returns `vendedorId`, `nombre`, `rol`; the `userId` the dashboard needs is the
   phone number the caller already holds. See O2 for the `rol` edge case.
6. **Spanish naming, mounted under `/api/v1/crm`** — Met.
   `POST /api/v1/crm/vendedores/identificar`.

## Discrepancies with end-session report

**Could not be assessed — no end-session report exists for this branch.** This is
itself the most significant process finding: this skill is designed to
cross-check the build session's own account of what it did against what the code
shows, and that check did not happen. Recommend running `/end-session` before
merge so the record exists for the merge-documentation step.

## Recommendation

🟡 **AMBER — Proceed with caution**

No blocking issues. The feature is correct, in scope, follows the repo's
documented patterns, and meets all six acceptance criteria.

**In plain English, what the developer should look at:**

1. The endpoint tells callers it is sending plain text when it is really sending
   structured data. Worth fixing before the frontend starts consuming it.
2. Every lookup writes a rep's phone number into the server log in readable form.
   The endpoint was deliberately designed to keep phone numbers out of logs, so
   this undercuts its own intent.
3. Anyone who can reach the server can test phone numbers and harvest rep names
   and roles. That follows from the no-login beta decision, but it is the first
   endpoint to make rep identity externally probeable and deserves a conscious
   decision.
4. If something breaks internally, the raw error text is sent back to the caller.
5. Nothing tests any of this automatically.

**Beyond PM scope — needs developer input:**
- The redaction approach for logging phone numbers (W2)
- Any mitigation for unauthenticated enumeration (W3)
- Whether to correct the response labelling here or repo-wide (W1), since the
  existing `POST /vendedores` has the same flaw

**Suggested action:** open the PR and carry warnings W1–W5 into the "Notes for
reviewer" section. Run `/end-session` first so the merge record has a build
account to reference.
