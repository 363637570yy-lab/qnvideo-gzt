const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../src/services/imageClient');

test('parses Responses API image_generation_call result as data URL', () => {
  const image = _test.parseOpenAiImageResponse({
    output: [
      { type: 'image_generation_call', result: 'ZmluYWw=' },
    ],
  }, 'png');

  assert.equal(image, 'data:image/png;base64,ZmluYWw=');
});

test('parses CLIProxyAPI image stream completed event', () => {
  const raw = [
    'event: image_generation.completed',
    'data: {"type":"image_generation.completed","b64_json":"ZmluYWw="}',
    '',
    '',
  ].join('\n');

  const image = _test.parseOpenAiImageStreamResponse(raw, 'png');

  assert.equal(image, 'data:image/png;base64,ZmluYWw=');
});

test('prefers Responses API final image over partial preview', () => {
  const raw = [
    'data: {"type":"response.image_generation_call.partial_image","partial_image_index":0,"partial_image_b64":"cGFydGlhbA=="}',
    '',
    'data: {"type":"response.completed","response":{"output":[{"type":"image_generation_call","result":"ZmluYWw="}]}}',
    '',
    '',
  ].join('\n');

  const image = _test.parseOpenAiImageStreamResponse(raw, 'png');

  assert.equal(image, 'data:image/png;base64,ZmluYWw=');
});

test('supports CLIProxyAPI zero partial image default', () => {
  assert.equal(_test.normalizeGptImagePartialImagesWithDefault(undefined, 0), 0);
  assert.equal(_test.normalizeGptImagePartialImagesWithDefault('', 0), 0);
  assert.equal(_test.normalizeGptImagePartialImagesWithDefault(3, 0), 3);
});
