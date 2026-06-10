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

test('skips transparent background for gpt-image-2 requests', () => {
  assert.equal(_test.normalizeGptImageBackground('transparent', 'gpt-image-2'), null);
  assert.equal(_test.normalizeGptImageBackground('transparent', 'gpt-image-2-2026-04-21'), null);
  assert.equal(_test.normalizeGptImageBackground('opaque', 'gpt-image-2'), 'opaque');
  assert.equal(_test.normalizeGptImageBackground('transparent', 'gpt-image-1.5'), 'transparent');
});

test('builds Responses API image_generation body for CLIProxy mode', () => {
  const { body, toolModel, action, toolModelSent } = _test.buildResponsesImageBody({
    model: 'gpt-5.5',
    prompt: 'Use the following text as the complete prompt. Do not rewrite it:\nA quiet courtyard',
    resolvedRefs: ['data:image/png;base64,cmVm'],
    protocol: 'cliproxy_gpt_image2',
    settings: { api_mode: 'responses', tool_model: 'gpt-image-2' },
    commonFields: {
      size: '1024x1024',
      output_format: 'png',
      moderation: 'auto',
    },
    outputFormat: 'png',
    compression: NaN,
    streamImages: true,
    partialImages: 0,
  });

  assert.equal(body.model, 'gpt-5.5');
  assert.equal(body.tools[0].type, 'image_generation');
  assert.equal(body.tools[0].model, 'gpt-image-2');
  assert.equal(body.tools[0].action, 'edit');
  assert.equal(body.tools[0].partial_images, 0);
  assert.equal(body.tool_choice.type, 'image_generation');
  assert.equal(body.input[0].content[1].type, 'input_image');
  assert.equal(toolModel, 'gpt-image-2');
  assert.equal(action, 'edit');
  assert.equal(toolModelSent, true);
});

test('normalizes GPT Image API mode aliases', () => {
  assert.equal(_test.normalizeGptImageApiMode('responses_api'), 'responses');
  assert.equal(_test.normalizeGptImageApiMode('/v1/responses'), 'responses');
  assert.equal(_test.normalizeGptImageApiMode('images'), 'images');
});

test('times out when a streaming image response body never completes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Response(new ReadableStream({
    start(controller) {
      options.signal.addEventListener('abort', () => {
        controller.error(new DOMException('Aborted', 'AbortError'));
      });
      controller.enqueue(Buffer.from('data: {"type":"response.created"}\n\n'));
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });

  try {
    await assert.rejects(
      _test.fetchTextWithTimeout(
        'https://relay.example/v1/responses',
        { method: 'POST' },
        20,
        { info() {} },
        'test',
        1,
        Date.now(),
      ),
      (err) => err?.name === 'AbortError',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
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
