/**
 * deliverable-type-profile.mjs
 *
 * Abstraction: DeliverableTypeProfile
 * Purpose: First-class object for "what kind of deliverable is this task producing".
 *
 * Implements user decisions:
 *   Q1 - unknown types are NOT auto-allowed; resolveProfile returns isUnknown
 *   Q4 - inferDeliverableTypeFromWorkType returns confidence + candidates
 *
 * Ironclad rules served:
 *   - No hardcoding: all profile data comes from config/contracts/deliverable-type-profiles.json
 *   - Best-practice case: Pydantic v2 Field(discriminator='type')
 *
 * Pure functions; no side effects beyond filesystem read in loadDeliverableTypeProfiles.
 */

import { readFileSync } from 'node:fs';

export function loadDeliverableTypeProfiles(configPath) {
  const errors = [];
  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (err) {
    errors.push({ kind: 'read_error', message: err.message, path: configPath });
    return { profiles: new Map(), config: null, errors: Object.freeze(errors) };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    errors.push({ kind: 'parse_error', message: err.message, path: configPath });
    return { profiles: new Map(), config: null, errors: Object.freeze(errors) };
  }

  if (!Array.isArray(parsed?.profiles)) {
    errors.push({ kind: 'schema_error', message: 'profiles array missing', path: configPath });
    return { profiles: new Map(), config: parsed, errors: Object.freeze(errors) };
  }

  const profiles = new Map();
  for (const p of parsed.profiles) {
    if (!p?.type || typeof p.type !== 'string') {
      errors.push({ kind: 'schema_error', message: 'profile missing type field', profile: p });
      continue;
    }
    if (profiles.has(p.type)) {
      errors.push({ kind: 'duplicate_type', message: `duplicate type ${p.type}`, type: p.type });
      continue;
    }
    profiles.set(p.type, Object.freeze({ ...p, rules: Object.freeze(p.rules ?? []) }));
  }

  return {
    profiles,
    config: Object.freeze(parsed),
    errors: Object.freeze(errors)
  };
}

export function resolveProfile(profiles, deliverableType, options = {}) {
  if (!deliverableType || typeof deliverableType !== 'string') {
    return {
      profile: null,
      isUnknown: true,
      fallbackReason: 'missing_deliverable_type',
      requiresIntentClarification: true
    };
  }
  const profile = profiles.get(deliverableType);
  if (!profile) {
    return {
      profile: null,
      isUnknown: true,
      fallbackReason: 'unknown_type_requires_user_intent',
      requiresIntentClarification: true,
      knownTypes: Array.from(profiles.keys())
    };
  }
  return {
    profile,
    isUnknown: false,
    fallbackReason: null,
    requiresIntentClarification: false
  };
}

export function inferDeliverableTypeFromWorkType(workType, hints = {}, profiles, thresholdsConfig = null) {
  if (!profiles || profiles.size === 0) {
    return { inferred: null, confidence: 'low', candidates: [], reason: 'no_profiles_loaded' };
  }

  const haystackPieces = [];
  if (typeof workType === 'string') haystackPieces.push(workType);
  if (Array.isArray(hints.workTypeKeywords)) haystackPieces.push(...hints.workTypeKeywords);
  if (typeof hints.title === 'string') haystackPieces.push(hints.title);
  if (typeof hints.description === 'string') haystackPieces.push(hints.description);
  if (Array.isArray(hints.fileExtensions)) haystackPieces.push(...hints.fileExtensions);
  if (Array.isArray(hints.pathPatterns)) haystackPieces.push(...hints.pathPatterns);
  const haystack = haystackPieces.join(' ').toLowerCase();

  const scores = [];
  for (const [type, profile] of profiles.entries()) {
    let score = 0;
    const keywords = profile.inferenceHints?.workTypeKeywords ?? {};
    for (const lang of Object.keys(keywords)) {
      for (const kw of keywords[lang] ?? []) {
        if (typeof kw === 'string' && kw && haystack.includes(kw.toLowerCase())) score += 2;
      }
    }
    for (const ext of profile.inferenceHints?.fileExtensions ?? []) {
      if (haystack.includes(ext.toLowerCase())) score += 1;
    }
    for (const pat of profile.inferenceHints?.pathPatterns ?? []) {
      if (haystack.includes(pat.toLowerCase())) score += 1;
    }
    if (score > 0) scores.push({ type, score });
  }

  scores.sort((a, b) => b.score - a.score);
  if (scores.length === 0) {
    return { inferred: null, confidence: 'low', candidates: [], reason: 'no_signal' };
  }

  const top = scores[0];
  const second = scores[1] ?? { score: 0 };
  const margin = top.score - second.score;

  // H3 fix (docs/v2.2.0-prism-review.md): normalize score+margin into a [0,1] ratio
  // and read confidence thresholds from contract (`inferenceStrategy.confidenceThresholds`)
  // instead of hardcoded integer breakpoints. Backwards compatible: when thresholdsConfig
  // is null, uses the same default thresholds shipped in v2.2.0.
  const absoluteFactor = Math.min(1, top.score / 5);
  const marginFactor = Math.min(1, margin / 3);
  const ratio = Math.min(1, absoluteFactor * 0.6 + marginFactor * 0.4);

  const thresholds = thresholdsConfig?.confidenceThresholds || { high: 0.85, medium: 0.6, low: 0.0 };

  let confidence;
  if (ratio >= thresholds.high) confidence = 'high';
  else if (ratio >= thresholds.medium) confidence = 'medium';
  else confidence = 'low';

  const requiresConfirmation = confidence !== 'high';

  return {
    inferred: confidence === 'low' ? null : top.type,
    confidence,
    ratio,
    thresholds,
    candidates: scores.slice(0, 3),
    reason: confidence === 'high' ? 'strong_signal' : 'ambiguous_signal',
    requiresConfirmation
  };
}
