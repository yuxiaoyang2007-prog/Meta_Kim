---
name: meta-theory-verify
description: Run the appropriate Meta_Kim verification path
args: [smoke|release|global]
---

Run Meta_Kim verification from the rendered Meta_Kim package root. Choose the
lightest route that matches the change risk:

- `smoke`: prompt, docs, changelog, or narrow governance wording.
- `global`: global hooks, runtime homes, command sync, or install/update wiring.
- `release`: install/update, hooks, runtime matrix, provider registry,
  dependency compatibility, or explicitly release-grade work.

Default to `smoke` when no argument is provided.

```bash
npm --prefix "__META_KIM_PACKAGE_ROOT__" run meta:release:smoke
git -C "__META_KIM_PACKAGE_ROOT__" diff --check
```

For `global`, also run:

```bash
npm --prefix "__META_KIM_PACKAGE_ROOT__" run meta:check:global:release -- --targets claude,codex,cursor
```

For `release`, run:

```bash
npm --prefix "__META_KIM_PACKAGE_ROOT__" run meta:verify:all
```

Return exact command results. Keep smoke, global-hook, graph, and release-grade
evidence as separate proof layers.
