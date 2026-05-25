/**
 * intent-verb-lexicon.mjs
 *
 * Abstraction: IntentVerbLexicon
 * Purpose: Multilingual intent verb detection (replaces hardcoded English regex
 *          in enforce-agent-dispatch.mjs).
 *
 * Implements user decisions:
 *   Q3 - v1.0 supports zh/en/ja/ko (README languages); v1.1 extends to es/fr.
 *
 * Ironclad rules served:
 *   - No hardcoding: vocabulary lives in deliverable-type-profiles.json
 *   - Best-practice case: i18next namespace lookup
 */

export const SUPPORTED_LANGUAGES_V1 = Object.freeze(['zh', 'en', 'ja', 'ko']);
export const SUPPORTED_LANGUAGES_V1_1 = Object.freeze(['zh', 'en', 'ja', 'ko', 'es', 'fr']);
export const KNOWN_INTENTS = Object.freeze(['implement', 'analyze', 'review', 'verify']);

export function loadLexicon(intentLexiconRaw, options = {}) {
  const requestedLanguages = options.languages ?? SUPPORTED_LANGUAGES_V1;
  if (!intentLexiconRaw || !intentLexiconRaw.intents) {
    return {
      version: null,
      languages: [],
      intents: {},
      isEmpty: true,
      errors: [{ kind: 'empty_lexicon' }]
    };
  }
  const intents = {};
  const errors = [];
  for (const intent of Object.keys(intentLexiconRaw.intents)) {
    intents[intent] = {};
    for (const lang of requestedLanguages) {
      const words = intentLexiconRaw.intents[intent]?.[lang];
      if (Array.isArray(words)) {
        intents[intent][lang] = Object.freeze(words.filter((w) => typeof w === 'string' && w.length > 0));
      } else {
        intents[intent][lang] = Object.freeze([]);
        errors.push({ kind: 'missing_language', intent, language: lang });
      }
    }
    Object.freeze(intents[intent]);
  }
  return Object.freeze({
    version: intentLexiconRaw.version ?? null,
    languages: Object.freeze(requestedLanguages.slice()),
    intents: Object.freeze(intents),
    isEmpty: false,
    errors: Object.freeze(errors)
  });
}

export function detectIntent(text, lexicon) {
  if (typeof text !== 'string' || text.length === 0 || !lexicon || lexicon.isEmpty) {
    return Object.freeze({
      intent: null,
      confidence: 0,
      matchedLang: null,
      matchedWord: null,
      reason: 'no_input_or_lexicon'
    });
  }
  const normalized = text.toLowerCase();
  const matches = [];
  for (const intent of Object.keys(lexicon.intents)) {
    for (const lang of lexicon.languages) {
      const words = lexicon.intents[intent]?.[lang] ?? [];
      for (const word of words) {
        if (!word) continue;
        const needle = word.toLowerCase();
        if (normalized.includes(needle)) {
          matches.push({ intent, lang, word, length: needle.length });
        }
      }
    }
  }
  if (matches.length === 0) {
    return Object.freeze({
      intent: null,
      confidence: 0,
      matchedLang: null,
      matchedWord: null,
      reason: 'no_keyword_matched'
    });
  }
  matches.sort((a, b) => b.length - a.length);
  const best = matches[0];
  const sameIntentMatches = matches.filter((m) => m.intent === best.intent).length;
  const confidence = Math.min(1, 0.5 + sameIntentMatches * 0.15);
  return Object.freeze({
    intent: best.intent,
    confidence,
    matchedLang: best.lang,
    matchedWord: best.word,
    reason: 'keyword_match'
  });
}

export function isSupportedLanguage(lang, version = 'v1') {
  if (version === 'v1') return SUPPORTED_LANGUAGES_V1.includes(lang);
  if (version === 'v1.1') return SUPPORTED_LANGUAGES_V1_1.includes(lang);
  return false;
}
