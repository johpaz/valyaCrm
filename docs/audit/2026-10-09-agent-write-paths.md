Audit: WhatsApp agent write paths vs what the app expects
Date: 2026-10-09
Scope: how the WhatsApp agent writes CRM data, compared with the rules and
data shapes the frontend integration relies on.
Method: code reading on branch `feature/2.3-update-opportunity-stage`
(Mongoose 8.19.3), plus a read-only count of rep phone formats in
`crm_vendedor_b2b`. Matrix rows created from it: 1.7 (updated), 2.10, 6.1–6.8.

## Status confirmed by the backend developer (2026-10-09)
The agent does not save anything to the CRM through WhatsApp yet; it was
built as a hackathon showcase with no frontend connected. The rows in area 6
build that path so it respects the app's rules.

## How the live agent writes
- Live path: `src/langchain/agentService.ts:76` calls `crmWorkflow.invoke`,
  i.e. `runCRMWorkflow` in `src/langgraph/workflow.ts:44-170`. One tool call
  per message; Gemini's arguments are passed to the tool as written
  (`workflow.ts:127-138`). The prompt gives Gemini the rep's name only, never
  the rep's `_id` (`workflow.ts:80`).
- Unused: everything in `src/langgraph/nodes/` (`planning.ts`, `execution.ts`,
  `approval.ts`, `knowledgeRetrieval.ts`, `summary.ts`) is imported nowhere.
  It contains logic the live path lacks, e.g. filling in `vendedorId`
  (`execution.ts:50-53`) and requiring an opportunity for activities (`:89`).
  Open question for johpaz (project plan): which orchestrator is canonical.
- Conversation history is never saved (`saveMessage` has no callers), so
  Gemini never sees ids of earlier records; the `actualizar_*` tools can only
  work on ids it invents.
- Creates (`new Model().save()`) run schema validators; updates
  (`findByIdAndUpdate`) do not, and nothing in `src/` sets `runValidators`.

## Gaps
| # | Gap | Technical detail | Agent tool(s) | Matrix row |
|---|---|---|---|---|
| 1 | Most WhatsApp writes cannot succeed; companies the agent creates belong to no rep | No `_id` given to Gemini (`workflow.ts:76-112`). `vendedorId` required on Oportunidad, Actividad, Producto, VentaGanada, and `vendedor` on Contacto; optional on Empresa (`empresaModel.ts:9`), whose list filters on it (`crmService.ts:339`) | all `crear_*` | 6.1 |
| 2 | An opportunity stage that matches no board column can be saved | `actualizarOportunidad` `$set` without validators (`crmService.ts:324`); the 2.3 route validates only on the HTTP side; the dashboard groups by raw `estado` (`reportServices.ts:42-44`) | `actualizar_oportunidad` | 6.2 |
| 3 | An agent update can change any field: owner, activity list, dates | `campos_modificados` straight into `$set` (`crmService.ts:273, 285, 312, 324`); no field whitelist | `actualizar_*` | 6.3 |
| 4 | Updates are not limited to the sender's own records | Updates by id with no `vendedorId` filter; `buscar_oportunidades_por_empresa` has no rep filter (`crmService.ts:417-419`) | `actualizar_*` | 6.1 |
| 5 | Reps stored as `+57…` may not be recognised on WhatsApp | Webhook passes `message.from` unchanged (`webhookRoutes.ts:19,70`) to an exact match (`crmService.ts:29`). All 15 stored reps use `+`; WhatsApp's platform normally sends the number without `+`, and Mexico as `521…`. Confirm with one "Mensaje recibido de …" log line | identification | 1.7 |
| 6 | Changes to a rep reach WhatsApp only after a server restart | `sellerCache` is never cleared (`conversationService.ts:21-33`) | identification | 1.7 (folded in) |
| 7 | "Won" deals don't add up | `crearVentaGanada` sets `Cerrado Ganado` but not `fechaCierre`/`valorCierre`, and allows a second sale for the same opportunity (`crmService.ts:505-514`). Moving to `Cerrado Ganado` via `actualizar_oportunidad` or the 2.3 PATCH records no `VentaGanada`; sales per month come only from `VentaGanada` (`reportServices.ts:53-54`) | `crear_venta_ganada`, `actualizar_oportunidad`, 2.3 PATCH | 2.10 |
| 8 | Activities from WhatsApp land on the wrong date | App sorts by `fechaProgramada` (`crmService.ts:401`, `reportServices.ts:37`); the agent writes `fecha` (+`hora`, not in the schema, dropped) (`crmService.ts:240-247`); `fechaProgramada` defaults to now | `crear_actividad` | 6.4 |
| 9 | An activity can point to a missing opportunity or another rep's | No existence or owner check; `$push` silently does nothing if missing (`crmService.ts:207-216`) | `crear_actividad` | 6.4 |
| 10 | Invented status or priority wording makes the create fail | Enums enforced on save (`actividadModel.ts:12-16, 26-30`; `oportunidadModel.ts:9-13`); tool descriptions don't list allowed values (`toolsManager.ts:89,134`) | `crear_actividad`, `crear_oportunidad` | 6.4, 6.2 |
| 11 | The agent cannot change an activity's status | No `actualizar_actividad` tool; `editarActividad` (`crmService.ts:428`) is used by no tool | none | 6.6 |
| 12 | "Last updated" goes stale on contacts, companies, activities | Only Oportunidad has the `findOneAndUpdate` hook (2.3); others refresh only on save | `actualizar_contacto`, `actualizar_empresa` | 6.7 (contacts, companies); 3.2 (activities) |
| 13 | "Add a note" replaces all notes | `$set` on `notas`; Empresa `notas` is a String, Oportunidad/Actividad string arrays (`empresaModel.ts:8`) | `actualizar_oportunidad`, `actualizar_empresa` | 6.3 |
| 14 | Duplicate companies and contacts | No lookup before create (`crmService.ts:166-189`) | `crear_empresa`, `crear_contacto` | 6.5 |
| 15 | Contact and company phones are free text | No normalisation (`contactoModel.ts:7`, `empresaModel.ts:5`); display only, not used for matching | `crear_*`, `actualizar_*` | none: kept as is (PM, 2026-10-09); revisit if ever used for matching (noted in 6.5) |
| 16 | Spanish-style amounts and dates can be misread | Mongoose casts `"5.000"` to 5 and `"10/11/2026"` to 11 Oct (unverified whether Gemini emits these) | `crear_oportunidad`, `actualizar_oportunidad` | 6.3 (folded in) |

No delete or rep-creation tools exist for the agent, so no dangling
references from agent deletes and no rep phones written outside 1.3's rule.
