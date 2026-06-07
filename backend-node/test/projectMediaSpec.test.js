const test = require('node:test');
const assert = require('node:assert/strict');

const { openAiGptImageSize, resolveProjectVideoSpecFromMetadata } = require('../src/services/projectMediaSpec');

test('OpenAI GPT Image direct size is aligned to 16-pixel multiples', () => {
  assert.equal(openAiGptImageSize('1080x1920'), '1088x1920');
  assert.equal(openAiGptImageSize('1920x1080'), '1920x1088');
  assert.equal(openAiGptImageSize('1024x1536'), '1024x1536');
});

test('OpenAI GPT Image fixed mode keeps official sizes', () => {
  assert.equal(openAiGptImageSize('1080x1920', 'official_fixed'), '1024x1536');
  assert.equal(openAiGptImageSize('1920x1080', 'fixed'), '1536x1024');
});

test('project video spec only uses common video resolutions', () => {
  const p720 = resolveProjectVideoSpecFromMetadata({
    aspect_ratio: '9:16',
    video_spec: { tier: '720p' },
  });
  assert.equal(p720.resolution, '720p');
  assert.equal(p720.aspect_ratio, '9:16');

  const legacy2k = resolveProjectVideoSpecFromMetadata({
    aspect_ratio: '16:9',
    video_spec: { tier: '2K' },
  });
  assert.equal(legacy2k.resolution, '1080p');

  const legacyCustom = resolveProjectVideoSpecFromMetadata({
    aspect_ratio: '1:1',
    video_spec: { mode: 'custom', width: 2560, height: 1440 },
  });
  assert.equal(legacyCustom.resolution, '1080p');
  assert.equal(legacyCustom.aspect_ratio, '1:1');
});
