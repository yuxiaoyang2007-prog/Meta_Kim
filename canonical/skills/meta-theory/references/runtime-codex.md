# Codex Runtime Adapter

In Codex, `/meta-theory` is authorization to use available subagent/delegation tools. Only claim delegation when a real tool was called successfully.

## Honest Subagent Contract

If `spawn_agent` / `Agent` equivalent is unavailable:

- do not pretend agents ran
- record the blocked reason
- continue only for read-only degraded analysis or ask before degraded executable work

## Choice Surfaces

Use native `request_user_input` only when exposed, and only with a valid 1-3 question payload that offers meaningful options. Otherwise use a short chat decision card. Do not call a chat fallback a popup.

If `request_user_input` returns API 400 or another host validation error, do not retry blindly. Fall back once to a localized markdown decision card, record `choiceSurfaceFallback=api_error`, and wait for the user's answer in chat.

Visible Decision cards need at least two meaningful options and a recommended default. Notices can stay concise.

Fetch/content evidence must precede Thinking/pre-decision option framing. At the transition from Thinking to Execution, present one Decision only when the answer changes scope, owner, risk, or acceptance. After Thinking completes, BEFORE any Execution, ask the user only if the route branches. DO NOT ask confirmation during Critical/Fetch/Thinking/Review just to satisfy a ritual.

Critical clarification is separate from execution confirmation: ask early only when the request is too unclear or risky to Fetch; ask later before executing a dispatch plan only when the plan has meaningful branches.

Decision cards include: AI understanding, AI additions, Capability route, Candidate paths.

Possible question dimensions:

1. Scope Confirmation - ask only when included work changes delivery.
   - Option A: Touch only requested files; expected result is a narrow fix; benefit is low risk; disadvantage is less cleanup.
   - Option B: Include nearby contract text; expected result is clearer rules; advantage is less ambiguity; risk is larger review.
   - Option C: Apply runtime mirror sync; expected result is consistent installs; benefit is less drift; trade-off is longer validation.
   - Option D: Modify only canonical source; expected result is smaller diff; advantage is safer review; disadvantage is delayed mirrors.
2. Evidence Confirmation - ask only when verification depth changes release confidence.
   - Option A: Run targeted tests; expected result is fast feedback; benefit is speed; risk is missed integration failure.
   - Option B: Run full verification; expected result is stronger confidence; advantage is release-grade evidence; cost is time.
   - Option C: Require screenshot/log artifact; expected result is auditable proof; benefit is reviewer confidence; disadvantage is extra setup.
   - Option D: Record accepted risk; expected result is honest closure; advantage is no false pass; risk is unresolved work.
3. Route Confirmation - ask only when owner or architecture changes.
   - Option A: Reuse existing owner; expected result is minimal governance change; benefit is stability; risk is imperfect fit.
   - Option B: Upgrade owner contract; expected result is clearer responsibility; advantage is durable fit; cost is larger review.
   - Option C: Create owner via Type B; expected result is exact capability; benefit is clean boundary; disadvantage is governance overhead.
   - Option D: Block with capabilityGapPacket; expected result is no fake owner; advantage is honesty; trade-off is no immediate execution.

There is no question quota. Each visible question must change an execution branch. Do not add filler options to satisfy a count. Options must be understandable to non-technical users. Wait for user response before proceeding to Execution.

## Codex Multi-Option Choice Surface Rule

For every confirmation or decision surface in Codex, use `default_mode_request_user_input` and `request_user_input` when available; otherwise render a clean choice card. Do not show a `Preflight` block unless the user explicitly asks for debug, audit, protocol, or governance trace output. Always show at least two viable options, include an explicit output-language choice when language is unresolved, use the latest input language, and render Option A placeholders as resolved user-facing language instead of hardcoding any single human language. Claude Code native question tool remains unchanged.

Choice Surface Gate states: `not_allowed`, `critical_clarification_allowed`, `execution_confirmation_allowed`, `completed`. FORBIDDEN: premature choice surface for test a popup / interactive box / popup_test_request. Critical -> Fetch -> Thinking must happen before execution confirmation. If Fetch cannot proceed safely, ask Critical clarification and must not present execution options. `contentEvidencePacket` precedes `preDecisionOptionFrame`. No candidate paths means no execution confirmation; no Fetch evidence means Thinking is not complete; no Thinking result means no pre-Execution confirmation.

Before detailed orchestration, close unresolved questions, list candidate solution paths, set `solutionChoiceState`, and only then finalize dispatch into `workerTaskPackets`.

Respect user choices (after questioning). Base the analysis on the user's actual selections, not on what the model "thinks is better". If there is significant risk, return to Thinking with Option A as the user's original choice and Option B as the suggested adjustment. Do not unilaterally override their selection.

## Query Bypass

`queryBypass: true` means pure read-only query. It does not allow mutation, install, write, delete, or state-changing shell commands.
