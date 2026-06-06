# Meta_Kim First Run

This example is the shortest way to see what Meta_Kim is for.

It does not ask you to trust a slogan. It asks you to run one governed execution and inspect the artifacts that come out.

## What This Proves

Meta_Kim is a governance layer for AI coding work. A useful first run should prove that it can:

- clarify intent before execution
- search capabilities before selecting an owner
- produce bounded worker tasks
- review and verify the result
- keep blocked evidence honest instead of turning every smoke check into a pass

## Run It

From the repository root:

```bash
npm install
npm run meta:theory:run
npm run meta:theory:report -- --run-id latest
npm run meta:delivery:bundle
```

If you only want a maintenance smoke check, run:

```bash
npm run meta:release:smoke
git diff --check
```

## Inspect The Evidence

The important outputs are generated under `.meta-kim/state/default/`:

| Artifact | Why it matters |
| --- | --- |
| `governed-executions/latest.json` | Pointer to the latest governed run. |
| `governed-executions/<run-id>.json` | Machine-readable governed run artifact. |
| `governed-executions/<run-id>.zh-CN.md` | Human-readable run report when available. |
| `product-delivery-bundle/latest.json` | Bundle manifest for panel, report, rubric, case pack, runtime matrix, and related evidence. |
| `product-delivery-bundle/latest.zh-CN.md` | Reviewer-facing bundle summary. |
| `run-trend-panel/latest.json` | Cross-run trend evidence for decisions, blockers, owners, and review scores. |
| `github-gap-report/latest.zh-CN.md` | Local-vs-GitHub gap report and release-boundary notes. |

## What To Say About It

Use this wording when explaining the project to someone else:

> Meta_Kim turns AI coding from a single chat session into a governed execution system. It clarifies the task, finds the right capability, routes work to bounded owners, reviews the result, verifies evidence, and writes back lessons for the next run.

Avoid overclaiming:

- Do not say every runtime is release-grade complete while Cursor native live remains blocked.
- Do not treat projection smoke, fixture pass, or generated reports as equivalent to live runtime proof.
- Do not describe Meta_Kim as a course or teacher tool. It is an AI-readable governance and evidence review layer.

## Best Next Demo

Record a short terminal demo with this sequence:

1. Show the original request.
2. Run `npm run meta:theory:run`.
3. Open the latest report.
4. Point at the owner route, worker tasks, review evidence, and blocked runtime boundary.
5. End on the delivery bundle.

The demo should be short enough for a social post and concrete enough for a technical reviewer to replay.
