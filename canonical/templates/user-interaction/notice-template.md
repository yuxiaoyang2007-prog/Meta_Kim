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

Render every public label and stage purpose from the runtime's already-selected output language first. If the runtime has not selected one, fall back to the user's latest input language. Keep only canonical protocol stage labels such as `Critical` and `Fetch` in English. Do not hardcode any single human language as the default public notice shell.

## Label Source

1. Runtime/tool selected output language.
2. Explicit user output-language choice.
3. Latest user input language.
4. Neutral machine-readable labels only when no human language can be resolved.

## When to Use

- Stage transitions (Critical → Fetch → Thinking → ...)
- Progress updates during long-running operations
- Informational status that does not require branching logic
- User asks whether meta-theory governance is active or what stage it is in
