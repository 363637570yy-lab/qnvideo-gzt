const test = require('node:test');
const assert = require('node:assert/strict');

const { transformSql } = require('../src/db/pgCompat');

test('workflow_presets inserts return id in postgres compatibility mode', () => {
  const result = transformSql(
    'INSERT INTO workflow_presets (preset_type, preset_key, name) VALUES (?, ?, ?)',
    'run'
  );

  assert.match(result.sql, /RETURNING id$/);
  assert.equal(result.returnsId, true);
});
