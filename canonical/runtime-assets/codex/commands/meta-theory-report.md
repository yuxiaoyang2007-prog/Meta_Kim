---
name: meta-theory-report
description: Reopen a Meta_Kim governed run report
args: [runId|latest]
---

Open the user-readable report for a governed Meta_Kim run.

Use the rendered package-root runner first:

```bash
node "__META_KIM_PACKAGE_ROOT__/scripts/run-meta-theory-governed-execution.mjs" --read "${ARGUMENTS:-latest}"
```

If the command has not been rendered and the current project is the Meta_Kim
source checkout, use:

```bash
npm run meta:theory:report -- "${ARGUMENTS:-latest}"
```

Relay the returned status, runId, and markdown report path. Do not treat the
report path itself as verification evidence.
