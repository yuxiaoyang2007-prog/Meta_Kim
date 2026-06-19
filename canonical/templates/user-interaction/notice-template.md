# Notice Template (No Popup)

Use this template for informational updates that do not require user choice.

## Format

```markdown
{localizedActiveLabel}: {Current Stage} ({stageIndex}/{stageTotal}, {percent}%)

{localizedCompletedLabel}: {completed stages or localized none}
{localizedCurrentLabel}: {plain-language work happening now}
{localizedNextLabel}: {next stage or localized none}
{localizedBlockedLabel}: {blocker or localized none}
```

This is the user-visible rendering of the `runStatusEnvelope` stored under `.meta-kim/state/{profile}/active-run.json` and `.meta-kim/state/{profile}/runs/{runId}/status.json`. It must stay short and must not expose internal protocol fields such as `Preflight`, `nativeChoiceSurface`, `conversation_fallback`, packet ids, or protocol traces unless the user explicitly asks for debug/audit/protocol details.

For Codex App and Claude Code, render this template as ordinary assistant chat text. HookPrompt / `additionalContext`, hook `systemMessage` warnings, JSON artifacts, and markdown reports do not satisfy this notice by themselves, because users may never see them in the conversation. A captured CLI stdout notice counts only when the CLI command is explicitly invoked and its stdout is shown to the user.

Render every public label and stage purpose from the selected Claude/Codex/Cursor/OpenClaw output language first. If the tool has not selected one, fall back to the user's latest input language. Keep canonical protocol stage labels such as `Critical`, `Fetch`, `Thinking`, and `Review` in English when useful, but pair them with a plain-language purpose, for example `Fetch：收集证据和能力来源`. Do not hardcode any single human language as the default public notice shell.

## Label Source

1. Runtime/tool selected output language.
2. Explicit user output-language choice.
3. Latest user input language.
4. Neutral machine-readable labels only when no human language can be resolved.

## When to Use

- Stage transitions (Critical → Fetch → Thinking → ...)
- Run start, route selected before Execution, blocker/degraded state when present, and closure
- Progress updates during long-running operations
- Informational status that does not require branching logic
- User asks whether meta-theory governance is active or what stage it is in

## Prompt Acceptance

This template binds `user-interaction-and-i18n`, `governance-orchestration`, `runtime-native-surfaces`, `memory-graph-and-observability`, and `verification-eval-and-release`. It is for status visibility only and never substitutes for user choice, execution evidence, or verification.

## Pass

- The notice is localized from runtime/tool language, explicit user language, or latest user input language.
- It shows current stage, completed work, current work, next step, and blockers in plain language.
- It hides internal protocol fields unless the user explicitly asks for debug or audit detail.
- It does not ask a question or imply a branch selection.

## Fail

- The notice exposes `Preflight`, `nativeChoiceSurface`, `conversation_fallback`, packet ids, or protocol traces as normal user-facing text.
- It claims user-visible functionality exists when only an internal artifact or maintainer command exists.
- It is used when the user must make a route-changing decision.

## Block

Block notice-only output when the next action requires user choice, external approval, missing evidence repair, or a safety decision. Use the decision template instead.

## Return to stage

Return to Critical for unclear user intent, Fetch for missing evidence, Thinking for missing next route, and Verification for unsupported completion claims.

## Verification

Check localization source, stage labels, absence of internal debug fields, blocker wording, and whether no user choice was required. Run `npm run meta:prompt:validate` after editing this template.

## Preserve

Preserve native status surfaces, chat fallback, i18n, concise user updates, and the separation between status notices, decision cards, and verification evidence.
