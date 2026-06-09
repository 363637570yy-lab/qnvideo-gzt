const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

test('extracts Responses API image usage from stream', () => {
  const raw = [
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":11,"output_tokens":7,"total_tokens":18},"output":[{"type":"image_generation_call","result":"ZmluYWw="}]}}',
    '',
    '',
  ].join('\n');

  const parsed = _test.parseOpenAiImageStreamResult(raw, 'png');

  assert.equal(parsed.image_url, 'data:image/png;base64,ZmluYWw=');
  assert.equal(parsed.usage.total_tokens, 18);
});

test('supports CLIProxyAPI zero partial image default', () => {
  assert.equal(_test.normalizeGptImagePartialImagesWithDefault(undefined, 0), 0);
  assert.equal(_test.normalizeGptImagePartialImagesWithDefault('', 0), 0);
  assert.equal(_test.normalizeGptImagePartialImagesWithDefault(3, 0), 3);
});

test('resolves /static reference images from local storage before public URL fallback', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qnvideo-image-ref-'));
  const rel = path.join('projects', 'demo', 'images', 'ref.png');
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from('png-bytes'));

  const dataUrl = _test.resolveImageRef(
    '/static/projects/demo/images/ref.png',
    'http://www.qnzn.top:20880/static',
    dir,
  );

  assert.equal(dataUrl, 'data:image/png;base64,' + Buffer.from('png-bytes').toString('base64'));
});

test('does not duplicate /static when falling back to public reference URL', () => {
  const url = _test.resolveImageRef(
    '/static/projects/demo/images/missing.png',
    'http://www.qnzn.top:20880/static',
    path.join(os.tmpdir(), 'missing-storage-root'),
  );

  assert.equal(url, 'http://www.qnzn.top:20880/static/projects/demo/images/missing.png');
});

test('keeps unrelated public reference URLs unchanged', () => {
  const url = _test.resolveImageRef(
    'https://cdn.example.com/assets/ref.png',
    'http://www.qnzn.top:20880/static',
    path.join(os.tmpdir(), 'missing-storage-root'),
  );

  assert.equal(url, 'https://cdn.example.com/assets/ref.png');
});

test('prefers persisted local static URL over returned base64 image', () => {
  const imageUrl = _test.preferLocalStaticImageUrl('data:image/png;base64,ZmluYWw=', 'projects/demo/characters/ig_test.png');

  assert.equal(imageUrl, '/static/projects/demo/characters/ig_test.png');
});
