import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguageIntent, isLanguageIntentText } from '../utils/languageDetection';

test('detectLanguageIntent identifies supported languages', () => {
  assert.equal(detectLanguageIntent('Teach me German')?.targetLanguage, 'de');
  assert.equal(detectLanguageIntent('I want to learn Français')?.targetLanguage, 'fr');
  assert.equal(detectLanguageIntent('Teach me Español')?.targetLanguage, 'es');
  assert.equal(detectLanguageIntent('Teach me العربية')?.targetLanguage, 'ar');
});

test('isLanguageIntentText flags teach/learn phrasing', () => {
  assert.equal(isLanguageIntentText('Teach me Italian'), true);
  assert.equal(isLanguageIntentText('I want to learn coding'), true);
  assert.equal(isLanguageIntentText('Hello world'), false);
});
