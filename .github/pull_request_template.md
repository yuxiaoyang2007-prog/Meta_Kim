## Change Readiness

Use this template for runtime, hook, setup, sync, provider, governance, deletion, and release-bound changes.

### Host State Impact Matrix

| Existing host state | State this change adds | State this change must preserve | Rollback path |
|---|---|---|---|
|  |  |  |  |

### Hook / Prompt Protocol Flow

| Source payload | Runtime adapter field | Model-visible field | UI-visible field | Assertion |
|---|---|---|---|---|
|  |  |  |  |  |

### Deletion / Refactor Residue Sweep

- [ ] Searched old identifiers with `rg`.
- [ ] Checked i18n strings and localized docs.
- [ ] Checked runtime mirrors and generated adapters.
- [ ] Checked compatibility exports, persisted state, and migration paths.
- [ ] Checked tests, fixture names, and assertion text.

### Evidence Budget

- [ ] Local assertion or unit/integration test:
- [ ] Host-side or installed-user self-test:
- [ ] User-visible result or release-note evidence:
- [ ] Evidence template includes `operationSteps`, `toolSideOutput`, `hostVisibleResult`, `failureBoundary`, and `reviewStatus`.

### Install / Update Status Semantics

- [ ] User-visible install/update output uses only `success`, `skipped`, `manual`, or `failed` semantics.
- [ ] Each changed message tells the user whether to continue, manually act, retry, or stop for a real failure.

### Execution Mode Classification

- [ ] Each execution node is classified as `real_execution`, `read_only_sidecar`, or `approval_gate`.
- [ ] Parallel groups include at least one real execution worker when they claim execution progress.
- [ ] Read-only sidecars and approval gates are excluded from completion statistics that mean real execution.
