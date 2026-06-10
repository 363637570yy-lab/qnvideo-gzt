const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const {
  getRoutingPolicies,
  reorderConfigs,
  testConnection,
  updateRoutingPolicy,
} = require('../src/services/aiConfigService');

const cases = [
  { service_type: 'text', expectedPath: '/chat/completions' },
  { service_type: 'image', expectedPath: '/images/generations' },
  { service_type: 'video', expectedPath: '/chat/completions' },
];

for (const item of cases) {
  test(`testConnection uses default_model before the first ${item.service_type} model`, async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = '';
    let requestBody = null;

    globalThis.fetch = async (url, options) => {
      requestUrl = String(url);
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      await testConnection({
        base_url: 'https://relay.example/v1',
        api_key: 'test-key',
        provider: 'openai',
        service_type: item.service_type,
        model: ['gpt-4o', 'gpt-5.5'],
        default_model: 'gpt-5.5',
      });

      assert.equal(requestBody.model, 'gpt-5.5');
      assert.equal(new URL(requestUrl).pathname, '/v1' + item.expectedPath);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test('testConnection uses /responses when image config selects Responses API mode', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestBody = null;

  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      output: [{ type: 'image_generation_call', result: 'ZmluYWw=' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await testConnection({
      base_url: 'https://relay.example/v1',
      api_key: 'test-key',
      provider: 'cliproxy',
      api_protocol: 'cliproxy_gpt_image2',
      service_type: 'image',
      model: ['gpt-5.5'],
      default_model: 'gpt-5.5',
      settings: JSON.stringify({ image: { api_mode: 'responses', tool_model: 'gpt-image-2' } }),
    });

    assert.equal(new URL(requestUrl).pathname, '/v1/responses');
    assert.equal(requestBody.model, 'gpt-5.5');
    assert.equal(requestBody.tools[0].type, 'image_generation');
    assert.equal(requestBody.tools[0].model, 'gpt-image-2');
    assert.equal(requestBody.tool_choice.type, 'image_generation');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createAiConfigDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE ai_service_configs (
      id INTEGER PRIMARY KEY,
      service_type TEXT,
      route_order INTEGER,
      created_at TEXT,
      updated_at TEXT,
      deleted_at TEXT
    );
  `);
  const insert = db.prepare(
    'INSERT INTO ai_service_configs (id, service_type, route_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run(1, 'image', 0, '2026-06-08T00:00:01Z', '2026-06-08T00:00:01Z');
  insert.run(2, 'image', 1, '2026-06-08T00:00:02Z', '2026-06-08T00:00:02Z');
  insert.run(3, 'jimeng2_character_auth', 0, '2026-06-08T00:00:03Z', '2026-06-08T00:00:03Z');
  insert.run(4, 'jimeng2_character_auth', 1, '2026-06-08T00:00:04Z', '2026-06-08T00:00:04Z');
  return db;
}

test('reorderConfigs applies order independently per service type', () => {
  const db = createAiConfigDb();

  const count = reorderConfigs(db, { info() {} }, [2, 4, 1, 3]);

  assert.equal(count, 4);
  const rows = db.prepare('SELECT id, service_type, route_order FROM ai_service_configs ORDER BY id').all();
  assert.deepEqual(rows, [
    { id: 1, service_type: 'image', route_order: 1 },
    { id: 2, service_type: 'image', route_order: 0 },
    { id: 3, service_type: 'jimeng2_character_auth', route_order: 1 },
    { id: 4, service_type: 'jimeng2_character_auth', route_order: 0 },
  ]);
});

test('reorderConfigs rejects partial order lists for a touched service type', () => {
  const db = createAiConfigDb();

  assert.throws(
    () => reorderConfigs(db, { info() {} }, [2]),
    /未覆盖全部 image 配置/
  );
});

test('routing policy accepts seconds without exposing legacy time units', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE global_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
  `);

  const saved = updateRoutingPolicy(db, 'video', {
    request_timeout_seconds: 125,
    video_poll_timeout_seconds: 650,
  });

  assert.equal(saved.video.request_timeout_seconds, 125);
  assert.equal(saved.video.video_poll_timeout_seconds, 650);
  assert.equal(Object.hasOwn(saved.video, 'request_timeout_ms'), false);
  assert.equal(Object.hasOwn(saved.video, 'video_poll_timeout_minutes'), false);

  const reread = getRoutingPolicies(db);
  assert.equal(reread.video.request_timeout_seconds, 125);
  assert.equal(reread.video.video_poll_timeout_seconds, 650);
  assert.equal(Object.hasOwn(reread.video, 'request_timeout_ms'), false);
  assert.equal(Object.hasOwn(reread.video, 'video_poll_timeout_minutes'), false);
});

test('image routing policy clamps unsafe concurrency defaults', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE global_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
  `);

  const saved = updateRoutingPolicy(db, 'image', {
    concurrency_limit: 100,
  });

  assert.equal(saved.image.concurrency_limit, 8);
  assert.equal(getRoutingPolicies(db).image.concurrency_limit, 8);
});
