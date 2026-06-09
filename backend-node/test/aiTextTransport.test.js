const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../src/services/ai-text/openAiChatTransport');

test('extracts normal chat message content', () => {
  const content = _test.extractChatMessageContent({
    choices: [{ message: { content: '普通文本' } }],
  });
  assert.equal(content, '普通文本');
});

test('extracts reasoning model content fallback', () => {
  const content = _test.extractChatMessageContent({
    choices: [{ message: { reasoning_content: '推理文本' } }],
  });
  assert.equal(content, '推理文本');
});

test('extracts chat usage aliases', () => {
  const usage = _test.extractChatUsage({
    usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
  });
  assert.equal(usage.input_tokens, 12);
  assert.equal(usage.output_tokens, 3);
  assert.equal(usage.total_tokens, 15);
});

test('extracts stream delta content', () => {
  const delta = _test.extractStreamDelta({
    choices: [{ delta: { content: '增量' } }],
  });
  assert.equal(delta, '增量');
});
