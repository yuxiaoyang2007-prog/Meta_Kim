/**
 * 04-intent-verb-lexicon.test.mjs
 * Verifies IntentVerbLexicon multilingual detection (Q3: zh/en/ja/ko).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  SUPPORTED_LANGUAGES_V1,
  SUPPORTED_LANGUAGES_V1_1,
  KNOWN_INTENTS,
  loadLexicon,
  detectIntent,
  isSupportedLanguage
} from '../../canonical/runtime-assets/shared/lib/intent-verb-lexicon.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../../config/contracts/deliverable-type-profiles.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

test('Q3: SUPPORTED_LANGUAGES_V1 contains zh/en/ja/ko', () => {
  assert.deepEqual([...SUPPORTED_LANGUAGES_V1].sort(), ['en', 'ja', 'ko', 'zh']);
});

test('Q3: v1.1 extends with es/fr', () => {
  assert.ok(SUPPORTED_LANGUAGES_V1_1.includes('es'));
  assert.ok(SUPPORTED_LANGUAGES_V1_1.includes('fr'));
  assert.equal(SUPPORTED_LANGUAGES_V1_1.length, 6);
});

test('isSupportedLanguage: v1 vs v1.1', () => {
  assert.equal(isSupportedLanguage('zh', 'v1'), true);
  assert.equal(isSupportedLanguage('es', 'v1'), false);
  assert.equal(isSupportedLanguage('es', 'v1.1'), true);
});

test('loadLexicon: loads all 4 intents', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  assert.equal(lexicon.isEmpty, false);
  for (const intent of KNOWN_INTENTS) {
    assert.ok(lexicon.intents[intent], `missing intent ${intent}`);
  }
});

test('loadLexicon: each intent has 4 languages with non-empty word lists', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  for (const intent of KNOWN_INTENTS) {
    for (const lang of SUPPORTED_LANGUAGES_V1) {
      const words = lexicon.intents[intent][lang];
      assert.ok(Array.isArray(words), `${intent}/${lang} not array`);
      assert.ok(words.length >= 4, `${intent}/${lang} too few words (${words.length})`);
    }
  }
});

test('loadLexicon: empty input returns isEmpty=true', () => {
  const lexicon = loadLexicon(null);
  assert.equal(lexicon.isEmpty, true);
});

test('Q3: detectIntent in Chinese', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  const result = detectIntent('帮我实现登录功能', lexicon);
  assert.equal(result.intent, 'implement');
  assert.equal(result.matchedLang, 'zh');
});

test('Q3: detectIntent in English', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  const result = detectIntent('please implement the login feature', lexicon);
  assert.equal(result.intent, 'implement');
  assert.equal(result.matchedLang, 'en');
});

test('Q3: detectIntent in Japanese', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  const result = detectIntent('ログインを実装してください', lexicon);
  assert.equal(result.intent, 'implement');
  assert.equal(result.matchedLang, 'ja');
});

test('Q3: detectIntent in Korean', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  const result = detectIntent('로그인 기능을 구현해주세요', lexicon);
  assert.equal(result.intent, 'implement');
  assert.equal(result.matchedLang, 'ko');
});

test('detectIntent: analyze keyword detected', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  const result = detectIntent('analyze the bottleneck', lexicon);
  assert.equal(result.intent, 'analyze');
});

test('detectIntent: verify keyword in Chinese', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  const result = detectIntent('请验证这个功能', lexicon);
  assert.equal(result.intent, 'verify');
});

test('detectIntent: no match returns null', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  const result = detectIntent('xyzzy quux foo bar baz', lexicon);
  assert.equal(result.intent, null);
  assert.equal(result.confidence, 0);
});

test('detectIntent: empty text returns null', () => {
  const lexicon = loadLexicon(config.intentLexicon);
  const result = detectIntent('', lexicon);
  assert.equal(result.intent, null);
});
