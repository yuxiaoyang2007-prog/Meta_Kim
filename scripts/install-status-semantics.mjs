export const INSTALL_STEP_CLASSIFICATION = Object.freeze({
  CRITICAL: "critical",
  OPTIONAL: "optional",
});

export const INSTALL_STEP_OUTCOME = Object.freeze({
  SKIPPED: "skipped",
});

export function installStep(id, outcome, classification = INSTALL_STEP_CLASSIFICATION.CRITICAL) {
  if (!id || typeof id !== "string") {
    throw new TypeError("install step id must be a non-empty string");
  }
  if (!Object.values(INSTALL_STEP_CLASSIFICATION).includes(classification)) {
    throw new TypeError(`unsupported install step classification: ${classification}`);
  }
  if (outcome === INSTALL_STEP_OUTCOME.SKIPPED) {
    return { id, ok: true, outcome: INSTALL_STEP_OUTCOME.SKIPPED, classification };
  }
  return {
    id,
    ok: outcome === true,
    outcome: outcome === true ? "passed" : "failed",
    classification,
  };
}

export function summarizeInstallStatus(steps = []) {
  const failedSteps = steps.filter((step) => step?.ok === false);
  const criticalFailures = failedSteps.filter(
    (step) => step.classification === INSTALL_STEP_CLASSIFICATION.CRITICAL,
  );
  const optionalFailures = failedSteps.filter(
    (step) => step.classification === INSTALL_STEP_CLASSIFICATION.OPTIONAL,
  );

  if (criticalFailures.length > 0) {
    return {
      status: "failed",
      exitCode: 1,
      failedSteps,
      criticalFailures,
      optionalFailures,
    };
  }
  if (optionalFailures.length > 0) {
    return {
      status: "partial",
      exitCode: 0,
      failedSteps,
      criticalFailures,
      optionalFailures,
    };
  }
  return {
    status: "complete",
    exitCode: 0,
    failedSteps: [],
    criticalFailures: [],
    optionalFailures: [],
  };
}
