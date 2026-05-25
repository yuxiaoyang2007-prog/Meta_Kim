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

export function inferDeliverableTypeFromWorkType(workType, hints = {}, profiles) {
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
  let confidence;
  if (top.score >= 4 && margin >= 2) confidence = 'high';
  else if (top.score >= 2 && margin >= 1) confidence = 'medium';
  else confidence = 'low';

  return {
    inferred: confidence === 'high' ? top.type : (confidence === 'medium' ? top.type : null),
    confidence,
    candidates: scores.slice(0, 3),
    reason: confidence === 'high' ? 'strong_signal' : 'ambiguous_signal',
    requiresConfirmation: confidence !== 'high'
  };
}
