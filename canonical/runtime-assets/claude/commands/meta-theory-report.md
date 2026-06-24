---
description: Reopen a Meta_Kim governed run report
argument-hint: [runId|latest]
---

Open the user-readable report for a governed Meta_Kim run.

Run this from the installed Meta_Kim package root when the command has been
rendered by global sync:

```bash
node "__META_KIM_PACKAGE_ROOT__/scripts/run-meta-theory-governed-execution.mjs" --read "${ARGUMENTS:-latest}"
```

If the package-root placeholder is still present and the current project is the
Meta_Kim source checkout, use the source fallback:

```bash
npm run meta:theory:report -- "${ARGUMENTS:-latest}"
```

Report the returned status, runId, and markdown report path. Do not claim the
run is verified unless the report itself contains fresh verification evidence.
