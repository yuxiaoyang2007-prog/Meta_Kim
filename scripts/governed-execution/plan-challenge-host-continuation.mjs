import { validateArtifactFile } from "../validate-run-artifact.mjs";
import { planChallengeAuthorizationBinding } from "./plan-challenge-policy.mjs";

const CONTINUABLE_PHASES = new Set([
  "awaiting_user_answer",
  "awaiting_understanding_confirmation",
  "awaiting_execution_authorization",
]);

const QUESTION_RESPONSE_STATUSES = new Set(["answered", "skipped"]);
const QUESTION_CONTROLS = new Set([
  "accept_recommendation",
  "skip",
  "summarize_stop",
  "continue",
]);

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(
    (item) => typeof item === "string" && item.trim().length > 0,
  );
}

export async function loadPlanChallengeContinuationCandidate({
  artifactPath,
  previousRunId,
  taskFingerprint,
}) {
  const artifact = await validateArtifactFile(artifactPath);
  if (artifact.runId !== previousRunId) {
    throw new Error("Plan challenge continuation run id does not match the prior artifact.");
  }
  if (artifact.taskFingerprint !== taskFingerprint) {
    throw new Error("Plan challenge continuation belongs to a different task.");
  }
  const planChallengeState = artifact.preDecisionOptionFrame?.planChallengeState;
  const unresolvedQuestions = artifact.preDecisionOptionFrame?.unresolvedQuestions;
  if (!planChallengeState || !Array.isArray(unresolvedQuestions)) {
    throw new Error("Prior artifact does not contain a valid plan challenge state.");
  }
  if (!CONTINUABLE_PHASES.has(planChallengeState.phase)) {
    throw new Error(`Plan challenge continuation cannot resume terminal phase: ${planChallengeState.phase}.`);
  }
  return {
    previousRunId,
    planChallengeState,
    unresolvedQuestions,
  };
}

export function bindVerifiedHostPlanChallengeDecision({
  verifiedDecision,
  preview,
  continuationCandidate = null,
}) {
  const rejected = (reason) => ({ accepted: false, reason });
  if (
    verifiedDecision?.verified !== true ||
    typeof verifiedDecision?.adapterId !== "string" ||
    !verifiedDecision.adapterId.trim() ||
    verifiedDecision.currentRunOnly !== true ||
    !nonEmptyStrings(verifiedDecision.evidenceRefs)
  ) {
    return rejected("host_decision_evidence_incomplete");
  }
  if (
    continuationCandidate &&
    verifiedDecision.continuationRunId !== continuationCandidate.previousRunId
  ) {
    return rejected("continuation_run_not_verified");
  }
  if (
    !continuationCandidate &&
    verifiedDecision.continuationRunId != null
  ) {
    return rejected("unexpected_continuation_run");
  }

  const phase = preview.planChallengeState.phase;
  const decision = verifiedDecision.decision ?? null;
  const trustedPriorState = continuationCandidate
    ? { ...continuationCandidate, trusted: true }
    : null;
  const base = {
    accepted: true,
    reason: "verified_host_decision",
    priorChallengeState: trustedPriorState,
    responses: [],
    control: null,
    sharedUnderstandingConfirmed: false,
    executionAuthorization: null,
  };
  if (decision == null) return base;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    return rejected("host_decision_must_be_one_object");
  }

  if (decision.type === "control") {
    if (!QUESTION_CONTROLS.has(decision.action)) {
      return rejected("unsupported_plan_challenge_control");
    }
    if (phase !== "awaiting_user_answer" && decision.action !== "summarize_stop") {
      return rejected("control_not_available_in_current_phase");
    }
    return {
      ...base,
      control: {
        trusted: true,
        binding: "plan-challenge-control",
        evidenceRefs: [...verifiedDecision.evidenceRefs],
        action: decision.action,
      },
    };
  }

  if (phase === "awaiting_user_answer" && decision.type === "question_response") {
    const currentQuestion = preview.planChallengeState.currentQuestion;
    if (!currentQuestion || !QUESTION_RESPONSE_STATUSES.has(decision.status)) {
      return rejected("question_response_not_valid_for_current_question");
    }
    const userAnswer = decision.userAnswer == null ? null : String(decision.userAnswer).trim();
    if (decision.status === "answered" && !userAnswer) {
      return rejected("answered_question_requires_text");
    }
    const priorSequences = preview.planChallengeState.decisionEvidence
      .filter((item) => item.kind === "question_response" && Number.isInteger(item.sequence))
      .map((item) => item.sequence);
    const sequence = (priorSequences.length > 0 ? Math.max(...priorSequences) : 0) + 1;
    return {
      ...base,
      responses: [
        {
          questionId: currentQuestion.questionId,
          status: decision.status,
          userAnswer,
          sequence,
          historical: false,
          trusted: true,
          binding: `plan-challenge-response:${currentQuestion.questionId}`,
          selectionBinding: `plan-challenge-selection:${currentQuestion.questionId}`,
          evidenceRefs: [...verifiedDecision.evidenceRefs],
        },
      ],
    };
  }

  if (
    phase === "awaiting_understanding_confirmation" &&
    decision.type === "shared_understanding_confirmation" &&
    decision.confirmed === true
  ) {
    return {
      ...base,
      sharedUnderstandingConfirmed: {
        trusted: true,
        binding: "plan-challenge-understanding-confirmation",
        evidenceRefs: [...verifiedDecision.evidenceRefs],
      },
    };
  }

  if (
    phase === "awaiting_execution_authorization" &&
    decision.type === "execution_authorization" &&
    ["authorized", "denied"].includes(decision.state) &&
    Array.isArray(decision.scopeActions)
  ) {
    const sideEffectActions = preview.planChallengeState.sideEffectActions;
    return {
      ...base,
      executionAuthorization: {
        trusted: true,
        binding: planChallengeAuthorizationBinding(sideEffectActions),
        evidenceRefs: [...verifiedDecision.evidenceRefs],
        state: decision.state,
        source: `host_adapter:${verifiedDecision.adapterId.trim()}`,
        scopeActions: [...decision.scopeActions],
      },
    };
  }

  return rejected("decision_not_valid_for_current_phase");
}
