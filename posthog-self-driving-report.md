# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured with Session Replay, Error Tracking, and Support enabled, plus inbox responders for setup health, error issues, and support tickets. The focused scout troop is enabled and its first runs should be picked up within about 30 minutes; findings will appear in the [Self-driving inbox](https://eu.posthog.com/project/275937/inbox).

## AI data processing

Approved. The organization-level approval gate was completed before this setup began.

## GitHub

Connected before this run through the PostHog GitHub App. GitHub Issues was not selected as an additional Self-driving source.

## Products enabled

| Product | Result | Client check |
|---|---|---|
| Session Replay | Already enabled | The browser PostHog initialization has no disabling override. |
| Error Tracking | Already enabled | Exception capture is explicitly enabled in both browser and server initialization. |
| Support (Conversations) | Enabled in this setup | An inbound channel is still required before tickets arrive. |

## Signal sources

| Signal source | Action |
|---|---|
| `signals_scout` / `cross_source_issue` | Left on by server default; no opt-out row exists. |
| `health_checks` / `health_issue` | Enabled (source config `01a0a98f-44b5-7938-9e14-970191de5a8e`). |
| `error_tracking` / `issue_created` | Enabled (source config `01a0a98f-43ea-74c7-8aae-8cf46fcec839`). |
| `error_tracking` / `issue_reopened` | Enabled (source config `01a0a98f-440b-7dd2-9228-e0f0f7d2862d`). |
| `error_tracking` / `issue_spiking` | Enabled (source config `01a0a98f-4411-7feb-838b-4e503b5643ce`). |
| `conversations` / `ticket` | Enabled (source config `01a0a98f-448f-79d9-b540-2dfeda9d77ed`). |
| `session_replay` / `session_analysis_cluster` | Deliberately skipped; this retired source is replaced by Replay Vision scanners. |
| `replay_vision` | Deliberately not configured as a source; scanners self-authorize through `emits_signals`. |

## Connected tools

No connected-tool source was selected. GitHub Issues, Linear, Jira, Sentry, and Zendesk were all skipped as not used for Self-driving during this setup.

## Scout troop

**Active scouts (3):**

- `signals-scout-general` — cross-product correlations and otherwise-uncovered surfaces.
- `signals-scout-product-analytics` — core product flows and derived-rate regressions.
- `signals-scout-health-checks` — actionable PostHog configuration-health findings.

**Disabled scouts (24):** AI observability, anomaly detection, APM, Conversations, CSP violations, customer analytics, data pipelines, data warehouse, error tracking, experiments, feature flags, inbox validation, insight alerts, logs, MCP tool calls, observability gaps, Replay Vision, revenue analytics, session replay, skills store, surveys, tasks, web analytics, and web vitals. They are disabled because the project scan did not establish active use of their specialized surface, or because Error Tracking and Session Replay are already covered by their native source and Replay Vision route respectively. They can be enabled later from the inbox if those surfaces become active.

| Run-budget item | Value |
|---|---|
| Maximum runs per day | 100 |
| Runs used today | 0 |
| Runs remaining today | 100 |
| Announcement | Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more. |

## Custom scouts

No custom scout was created. One candidate was proposed and declined: request intake and resolution health, which would watch for request intake stopping, work accumulating faster than completion, or unusual completion changes. It was a valid domain-specific gap because the built-in product-analytics scout watches saved flow-rate changes only when entrants hold steady.

Other surfaces were ruled out because they were not yet watchable: notification-channel instrumentation records successful creation and tests, but no failure counterpart. If a future custom scout becomes noisy, set its config's `emit` field to `false` in PostHog to switch it to dry-run.

## Replay Vision scanners

No Replay Vision scanners were created. Session Replay is enabled and no existing scanners were found, but the required shared scanner-brief skills (`replay-vision-scanners-core`, `replay-vision-scanner-broken-experiences`, and `replay-vision-scanner-user-frustration`) were not installed in this workspace and were unavailable from the single skill menu supplied to this run. Their locked brief scaffolds are required to create the two signal-emitting monitors without inventing prompts or query scopes.

A Replay Vision scanner is an LLM that watches individual session recordings on a schedule and pushes confirmed visual defects to the inbox. It is the only part of this setup that spends Replay Vision quota; its findings arrive at half weight and require corroboration before becoming a report.

## Files changed

| File | Change |
|---|---|
| `posthog-self-driving-report.md` | Created this setup report. |

No application source files were modified.

## Follow-ups

- [ ] Connect an inbound Support channel (email, inbox, or Slack) in PostHog so the enabled Conversations responder can receive tickets.
- [ ] Install or make available the three required Replay Vision scanner-brief skills, then create the two locked-scaffold monitors with `emits_signals: true` for the request-management completion flow and frustration sessions.

## What happens next

Fresh scout configurations are picked up by the coordinator within roughly 30 minutes and use the shared daily scout-run budget. Findings cluster into reports in the [Self-driving inbox](https://eu.posthog.com/project/275937/inbox), where immediately actionable findings can begin coding tasks.
