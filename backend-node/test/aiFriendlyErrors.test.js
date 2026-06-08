const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getNoAiConfigMessage,
  normalizeNoAiConfigMessage,
} = require('../src/utils/aiFriendlyErrors');

test('normalizes terse image no-config errors to a friendly operator hint', () => {
  assert.equal(
    normalizeNoAiConfigMessage('未配置图片模型', 'image'),
    getNoAiConfigMessage('image')
  );
});

test('keeps unrelated AI errors unchanged', () => {
  assert.equal(
    normalizeNoAiConfigMessage('HTTP 400 - Invalid size', 'image'),
    'HTTP 400 - Invalid size'
  );
});
