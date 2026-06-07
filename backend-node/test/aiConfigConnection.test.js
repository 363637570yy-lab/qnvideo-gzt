const test = require('node:test');
const assert = require('node:assert/strict');

const { testConnection } = require('../src/services/aiConfigService');

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
