const test = require('node:test');
const assert = require('node:assert/strict');

const {
  openAiGptImageSize,
  resolveProjectImageSpecFromMetadata,
  resolveProjectVideoSpecFromMetadata,
} = require('../src/services/projectMediaSpec');

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
  const defaultImage = resolveProjectImageSpecFromMetadata({});
  assert.equal(defaultImage.tier, '4K');
  assert.equal(defaultImage.aspect_ratio, '16:9');

  const defaultVideo = resolveProjectVideoSpecFromMetadata({});
  assert.equal(defaultVideo.resolution, '720p');
  assert.equal(defaultVideo.aspect_ratio, '16:9');

  const invalidCustomImage = resolveProjectImageSpecFromMetadata({
    aspect_ratio: '9:16',
    image_spec: { mode: 'custom' },
  });
  assert.equal(invalidCustomImage.tier, '4K');
  assert.equal(invalidCustomImage.aspect_ratio, '9:16');
  assert.ok(invalidCustomImage.width > 1000);
  assert.ok(invalidCustomImage.height > 1000);

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
