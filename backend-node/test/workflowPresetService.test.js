const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const workflowPresetService = require('../src/services/workflowPresetService');

function createDb() {
  return new Database(':memory:');
}

test('workflow preset defaults seed all supported types', () => {
  const db = createDb();

  const items = workflowPresetService.listPresets(db, { activeOnly: true });

  assert.equal(items.length, 24);
  assert.deepEqual(
    Array.from(new Set(items.map((item) => item.preset_type))).sort(),
    ['character', 'prop', 'scene', 'storyboard']
  );
  for (const type of ['character', 'prop', 'scene', 'storyboard']) {
    assert.equal(items.filter((item) => item.preset_type === type && item.is_default).length, 1);
  }
});

test('setDefaultPreset keeps only one default per type', () => {
  const db = createDb();
  const sceneItems = workflowPresetService.listPresets(db, { type: 'scene', activeOnly: true });
  const target = sceneItems.find((item) => item.preset_key === 'scene_multi_angle');

  workflowPresetService.setDefaultPreset(db, target.id, { id: 'admin-test' });
  const nextSceneItems = workflowPresetService.listPresets(db, { type: 'scene', activeOnly: true });

  assert.equal(nextSceneItems.filter((item) => item.is_default).length, 1);
  assert.equal(nextSceneItems.find((item) => item.is_default).preset_key, 'scene_multi_angle');
});

test('listPresets activeOnly hides disabled presets', () => {
  const db = createDb();
  const propItems = workflowPresetService.listPresets(db, { type: 'prop', activeOnly: true });
  const target = propItems.find((item) => item.preset_key === 'prop_material_detail');

  workflowPresetService.updatePreset(db, target.id, { ...target, is_active: false }, { id: 'admin-test' });

  const active = workflowPresetService.listPresets(db, { type: 'prop', activeOnly: true });
  const all = workflowPresetService.listPresets(db, { type: 'prop' });
  assert.equal(active.some((item) => item.id === target.id), false);
  assert.equal(all.some((item) => item.id === target.id), true);
});
