const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const aiClient = require('../src/services/aiClient');
const aiConfigService = require('../src/services/aiConfigService');
const modelCallLogger = require('../src/services/ai-runtime/modelCallLogger');
const modelRuntimeService = require('../src/services/ai-runtime/modelRuntimeService');
const modelCapabilityService = require('../src/services/ai-runtime/modelCapabilityService');
const modelSceneKeys = require('../src/services/ai-runtime/modelSceneKeys');
const usageTracker = require('../src/services/ai-runtime/usageTracker');
const quotaGuard = require('../src/services/ai-runtime/quotaGuard');
const imageClient = require('../src/services/imageClient');
const videoProtocol = require('../src/services/ai-video/videoProtocol');
const videoResultParser = require('../src/services/ai-video/videoResultParser');
const videoClient = require('../src/services/videoClient');
const ttsService = require('../src/services/ttsService');
const minimaxTts = require('../src/services/ai-audio/adapters/minimaxTts');
const openAiTts = require('../src/services/ai-audio/adapters/openAiTts');

function createRuntimeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE global_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
    CREATE TABLE ai_service_configs (
      id INTEGER PRIMARY KEY,
      service_type TEXT,
      provider TEXT,
      api_protocol TEXT,
      name TEXT,
      base_url TEXT,
      api_key TEXT,
      model TEXT,
      default_model TEXT,
      endpoint TEXT,
      query_endpoint TEXT,
      route_order INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      cooldown_seconds INTEGER DEFAULT 0,
      request_timeout_ms INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      health_status TEXT DEFAULT 'ok',
      disabled_until TEXT,
      last_error TEXT,
      last_error_at TEXT,
      failure_count INTEGER DEFAULT 0,
      capabilities_json TEXT,
      settings TEXT,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE ai_model_map (
      id INTEGER PRIMARY KEY,
      key TEXT UNIQUE,
      service_type TEXT,
      config_id INTEGER,
      model_override TEXT,
      description TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE ai_model_call_logs (
      id INTEGER PRIMARY KEY,
      service_type TEXT,
      scene_key TEXT,
      config_id INTEGER,
      provider TEXT,
      api_protocol TEXT,
      model TEXT,
      status TEXT,
      elapsed_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      image_count INTEGER,
      audio_seconds REAL,
      video_seconds REAL,
      prompt_chars INTEGER,
      prompt_hash TEXT,
      task_id TEXT,
      project_id INTEGER,
      trace_id TEXT,
      error_message TEXT,
      usage_json TEXT,
      diagnostics_json TEXT,
      created_at TEXT
    );
    CREATE TABLE ai_usage_events (
      id INTEGER PRIMARY KEY,
      call_log_id INTEGER,
      service_type TEXT,
      scene_key TEXT,
      config_id INTEGER,
      provider TEXT,
      api_protocol TEXT,
      model TEXT,
      user_id TEXT,
      project_id INTEGER,
      task_id TEXT,
      status TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      image_count INTEGER,
      video_seconds REAL,
      audio_seconds REAL,
      storage_bytes INTEGER,
      estimated_cost REAL,
      actual_cost REAL,
      usage_source TEXT,
      period_key TEXT,
      trace_id TEXT,
      created_at TEXT
    );
    CREATE TABLE ai_quota_policies (
      id INTEGER PRIMARY KEY,
      scope_type TEXT,
      scope_id TEXT,
      service_type TEXT,
      model TEXT,
      scene_key TEXT,
      period_type TEXT,
      limit_unit TEXT,
      limit_value REAL,
      action_on_exceed TEXT,
      enabled INTEGER,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE ai_quota_counters (
      id INTEGER PRIMARY KEY,
      policy_id INTEGER,
      period_key TEXT,
      used_value REAL,
      reserved_value REAL,
      updated_at TEXT
    );
  `);
  const insert = db.prepare(`
    INSERT INTO ai_service_configs (
      id, service_type, provider, api_protocol, name, base_url, api_key, model,
      default_model, endpoint, route_order, is_active, health_status,
      disabled_until, created_at, updated_at
    ) VALUES (?, 'text', 'openai', 'openai_compatible', ?, 'https://relay.example/v1', 'sk-test',
      ?, ?, '/chat/completions', ?, 1, ?, ?, '2026-06-09T00:00:00Z', '2026-06-09T00:00:00Z')
  `);
  insert.run(1, 'cooling', JSON.stringify(['gpt-a']), 'gpt-a', 0, 'cooldown', '2999-01-01T00:00:00Z');
  insert.run(2, 'healthy', JSON.stringify(['gpt-b']), 'gpt-b', 1, 'ok', null);
  db.prepare('INSERT INTO ai_model_map (key, service_type, config_id, model_override) VALUES (?, ?, ?, ?)').run('story_generation', 'text', 1, 'gpt-a');
  return db;
}

test('scene_key runtime routing skips cooling mapped config', () => {
  const db = createRuntimeDb();

  const mapped = aiClient.getConfigFromModelMap(db, 'story_generation');

  assert.equal(mapped.config.id, 2);
  assert.equal(mapped.config.health_status, 'ok');
  assert.equal(mapped.modelOverride, null);
});

test('model call logger stores sanitized error and prompt hash only', () => {
  const db = createRuntimeDb();
  const ok = modelCallLogger.recordModelCall(db, {
    service_type: 'text',
    scene_key: 'story_generation',
    config_id: 2,
    model: 'gpt-b',
    status: 'failed',
    prompt: 'secret prompt body',
    error: 'HTTP 401 Bearer sk-abcdef1234567890',
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    user_id: 'user-1',
    project_id: 12,
    task_id: 'task-1',
  });

  assert.equal(ok, true);
  const row = db.prepare('SELECT * FROM ai_model_call_logs').get();
  assert.equal(row.prompt_chars, 'secret prompt body'.length);
  assert.ok(row.prompt_hash);
  assert.equal(row.total_tokens, 7);
  assert.ok(row.trace_id);
  assert.match(row.error_message, /Bearer \*\*\*/);
  assert.doesNotMatch(row.error_message, /sk-abcdef/);

  const event = db.prepare('SELECT * FROM ai_usage_events').get();
  assert.equal(event.call_log_id, row.id);
  assert.equal(event.trace_id, row.trace_id);
  assert.equal(event.service_type, 'text');
  assert.equal(event.scene_key, 'story_generation');
  assert.equal(event.user_id, 'user-1');
  assert.equal(event.project_id, 12);
  assert.equal(event.task_id, 'task-1');
  assert.equal(event.total_tokens, 7);
  assert.equal(event.usage_source, 'real');
});

test('model runtime service lists logs and aggregates usage summary', () => {
  const db = createRuntimeDb();
  modelCallLogger.recordModelCall(db, {
    service_type: 'text',
    scene_key: 'story_generation',
    config_id: 2,
    provider: 'openai',
    api_protocol: 'openai_compatible',
    model: 'gpt-b',
    status: 'success',
    elapsed_ms: 1200,
    prompt: 'story prompt',
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
  modelCallLogger.recordModelCall(db, {
    service_type: 'image',
    scene_key: 'character_image',
    config_id: 2,
    provider: 'cliproxy',
    api_protocol: 'cliproxy_gpt_image2',
    model: 'gpt-image-2',
    status: 'failed',
    elapsed_ms: 45000,
    prompt: 'image prompt',
    usage: { image_count: 1 },
    error: 'HTTP 504 timeout',
  });

  const logs = modelRuntimeService.listModelCallLogs(db, { days: 1, status: 'failed' });
  assert.equal(logs.total, 1);
  assert.equal(logs.items[0].service_type, 'image');
  assert.equal(logs.items[0].usage.image_count, 1);

  const summary = modelRuntimeService.getModelUsageSummary(db, { days: 1 });
  assert.equal(summary.totals.requests, 2);
  assert.equal(summary.totals.success, 1);
  assert.equal(summary.totals.failed, 1);
  assert.equal(summary.totals.total_tokens, 30);
  assert.equal(summary.totals.image_count, 1);
  assert.equal(summary.by_service.length, 2);
  assert.equal(summary.slow_calls[0].model, 'gpt-image-2');

  const trace = db.prepare("SELECT trace_id FROM ai_model_call_logs WHERE service_type = 'image'").get().trace_id;
  const tracedLogs = modelRuntimeService.listModelCallLogs(db, { days: 1, trace_id: trace });
  assert.equal(tracedLogs.total, 1);
  assert.equal(tracedLogs.items[0].scene_key, 'character_image');

  const usage = usageTracker.getUsageDailySummary(db, { days: 1 });
  assert.equal(usage.totals.requests, 2);
  assert.equal(usage.totals.total_tokens, 30);
  assert.equal(usage.totals.image_count, 1);
  assert.equal(usage.by_day.length, 2);
  assert.equal(usage.by_scene.some((item) => item.scene_key === 'character_image'), true);

  const tracedUsage = usageTracker.getUsageDailySummary(db, { days: 1, trace_id: trace });
  assert.equal(tracedUsage.totals.requests, 1);
  assert.equal(tracedUsage.totals.image_count, 1);
});

test('quota guard blocks runtime candidates after policy limit is reached', () => {
  const db = createRuntimeDb();
  const policy = quotaGuard.upsertPolicy(db, {
    scope_type: 'config',
    scope_id: '2',
    service_type: 'text',
    period_type: 'day',
    limit_unit: 'requests',
    limit_value: 1,
    action_on_exceed: 'fallback',
    enabled: true,
  });
  assert.ok(policy.id);

  modelCallLogger.recordModelCall(db, {
    service_type: 'text',
    scene_key: 'story_generation',
    config_id: 2,
    provider: 'openai',
    model: 'gpt-b',
    status: 'success',
    usage: { total_tokens: 10 },
  });

  const check = quotaGuard.isConfigQuotaAllowed(db, {
    config: { id: 2, service_type: 'text', model: ['gpt-b'], default_model: 'gpt-b' },
    scene_key: 'story_generation',
  }, { requests: 1 });
  assert.equal(check.allowed, false);
  assert.equal(check.violations[0].used_value, 1);

  const candidates = aiConfigService.getRuntimeConfigCandidates(db, 'text', {
    config_id: 2,
    fallback: false,
  });
  assert.equal(candidates.length, 0);
});

test('runtime quota precheck uses estimated token units before routing', () => {
  const db = createRuntimeDb();
  quotaGuard.upsertPolicy(db, {
    scope_type: 'config',
    scope_id: '2',
    service_type: 'text',
    period_type: 'day',
    limit_unit: 'tokens',
    limit_value: 50,
    action_on_exceed: 'fallback',
    enabled: true,
  });
  modelCallLogger.recordModelCall(db, {
    service_type: 'text',
    scene_key: 'story_generation',
    config_id: 2,
    provider: 'openai',
    model: 'gpt-b',
    status: 'success',
    usage: { total_tokens: 45 },
  });

  const allowed = aiConfigService.getRuntimeConfigCandidates(db, 'text', {
    config_id: 2,
    fallback: false,
    usage_estimate: { total_tokens: 5 },
  });
  assert.equal(allowed.length, 1);

  const blocked = aiConfigService.getRuntimeConfigCandidates(db, 'text', {
    config_id: 2,
    fallback: false,
    usage_estimate: { total_tokens: 6 },
  });
  assert.equal(blocked.length, 0);
  assert.match(
    aiConfigService.getRuntimeQuotaBlockMessage(db, 'text', {
      config_id: 2,
      usage_estimate: { total_tokens: 6 },
    }),
    /Token额度不足/
  );
});

test('model capability service infers image and video capabilities with overrides', () => {
  const imageCaps = modelCapabilityService.normalizeCapabilities(null, {
    service_type: 'image',
    provider: 'cliproxy',
    api_protocol: 'cliproxy_gpt_image2',
    default_model: 'gpt-image-2',
  }).map((item) => item.key);

  assert.ok(imageCaps.includes('image_output'));
  assert.ok(imageCaps.includes('multi_image_reference'));
  assert.ok(imageCaps.includes('partial_images'));

  const videoCaps = modelCapabilityService.normalizeCapabilities(
    { disabled: ['camera_control'], enabled: ['seed'] },
    {
      service_type: 'video',
      provider: 'kling',
      api_protocol: 'kling_omni',
      default_model: 'kling-video-o1',
    }
  ).map((item) => item.key);

  assert.ok(videoCaps.includes('video_output'));
  assert.ok(videoCaps.includes('first_last_frame'));
  assert.ok(videoCaps.includes('seed'));
  assert.equal(videoCaps.includes('camera_control'), false);
});

test('model scene keys expose stable business definitions', () => {
  const definitions = modelSceneKeys.getSceneKeyDefinitions();
  const keys = definitions.map((item) => item.key);

  assert.ok(keys.includes('character_image'));
  assert.ok(keys.includes('scene_image'));
  assert.ok(keys.includes('prop_image'));
  assert.ok(keys.includes('storyboard_video'));
  assert.equal(
    definitions.find((item) => item.key === 'character_image').service_type,
    'image'
  );
  assert.equal(modelSceneKeys.resolveImageSceneKey({ character_id: 9 }), 'character_image');
  assert.equal(modelSceneKeys.resolveImageSceneKey({ scene_id: 2 }), 'scene_image');
  assert.equal(modelSceneKeys.resolveImageSceneKey({ prop_id: 5 }), 'prop_image');
  assert.equal(modelSceneKeys.resolveImageSceneKey({ storyboard_id: 8 }), 'storyboard_image');
  assert.equal(modelSceneKeys.resolveTtsSceneKey({ storyboard_id: 8 }), 'narration_tts');
  assert.equal(modelSceneKeys.resolveVideoSceneKey({ storyboard_id: 8 }), 'storyboard_video');
});

test('image candidate routing honors scene model map before default queue', () => {
  const db = createRuntimeDb();
  const insertImage = db.prepare(`
    INSERT INTO ai_service_configs (
      id, service_type, provider, api_protocol, name, base_url, api_key, model,
      default_model, endpoint, route_order, is_active, health_status,
      disabled_until, created_at, updated_at
    ) VALUES (?, 'image', 'openai', 'openai_gpt_image', ?, 'https://relay.example/v1', 'sk-test',
      ?, ?, '/images/generations', ?, 1, 'ok', NULL, '2026-06-09T00:00:00Z', '2026-06-09T00:00:00Z')
  `);
  insertImage.run(10, 'default image', JSON.stringify(['gpt-image-default']), 'gpt-image-default', 1);
  insertImage.run(11, 'character image', JSON.stringify(['gpt-image-character']), 'gpt-image-character', 0);
  db.prepare(`
    INSERT OR REPLACE INTO ai_model_map (key, service_type, config_id, model_override)
    VALUES (?, ?, ?, ?)
  `).run('character_image', 'image', 11, 'gpt-image-character-fast');

  const mapped = imageClient._test.getImageCandidateEntries(db, null, null, null, null, 'character_image');
  assert.equal(mapped[0].config.id, 11);
  assert.equal(mapped[0].modelOverride, 'gpt-image-character-fast');

  const fallback = imageClient._test.getImageCandidateEntries(db, null, null, null, null, 'storyboard_image');
  assert.equal(fallback[0].config.id, 11);
  assert.equal(fallback[0].modelOverride, null);
});

test('video protocol helpers normalize provider, URL and model choices', () => {
  assert.equal(videoProtocol.resolveVideoProtocol({ provider: 'dashscope' }), 'dashscope');
  assert.equal(
    videoProtocol.resolveVideoProtocol({
      provider: 'openai',
      base_url: 'https://api.x.ai/v1',
    }, 'grok-imagine'),
    'xai'
  );
  assert.equal(
    videoProtocol.buildVideoUrl({
      provider: 'volcengine',
      base_url: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
    }),
    'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
  );
  assert.equal(
    videoProtocol.buildQueryUrl({
      provider: 'openai',
      api_protocol: 'sora',
      base_url: 'https://relay.example/v1',
    }, 'task-1'),
    'https://relay.example/v1/v1/videos/task-1'
  );
  assert.equal(
    videoProtocol.normalizeVolcModel('doubao-seedance-2.0-fast'),
    'doubao-seedance-2-0-fast-260128'
  );
  assert.equal(
    videoProtocol.getModelFromConfig({
      model: ['seedance-a', 'seedance-b'],
      default_model: 'seedance-b',
    }),
    'seedance-b'
  );
});

test('media usage helpers fill default metered units', () => {
  assert.deepEqual(imageClient._test.ensureImageUsage(null), { image_count: 1 });
  assert.deepEqual(imageClient._test.ensureImageUsage({ image_count: 2 }), { image_count: 2 });
  assert.deepEqual(videoClient._test.buildVideoUsageEstimate({ duration: 8 }), { video_seconds: 8 });
  assert.equal(videoClient._test.buildVideoUsageEstimate({ duration: null }).video_seconds, undefined);
  assert.ok(ttsService._test.estimateTtsAudioSeconds('这是一段用于测试的旁白文本', 1) >= 1);
});

test('video result parser extracts proxy URLs and failure messages', () => {
  assert.equal(
    videoResultParser.pickProxyVideoUrl({
      data: {
        result: {
          content: {
            item_list: [
              {
                common_attr: {
                  transcoded_video: { origin: { video_url: 'https://cdn.example/clip.mp4' } },
                },
              },
            ],
          },
        },
      },
    }),
    'https://cdn.example/clip.mp4'
  );
  assert.equal(
    videoResultParser.extractPollTaskStatus({ data: { status: 'FAILURE' } }),
    'failure'
  );
  assert.equal(videoResultParser.isPollTaskFailed('failure'), true);
  assert.equal(
    videoResultParser.extractPollFailureMessage({ data: { result_url: 'generation failed by policy' } }),
    'generation failed by policy'
  );
});

test('TTS adapters build real generation-compatible endpoints', () => {
  assert.equal(
    minimaxTts.buildMinimaxTtsUrl('https://api.minimax.chat/v1', 'group-1'),
    'https://api.minimax.chat/v1/t2a_v2?GroupId=group-1'
  );
  assert.equal(
    openAiTts.buildOpenAiTtsUrl('https://relay.example/v1'),
    'https://relay.example/v1/audio/speech'
  );
});
