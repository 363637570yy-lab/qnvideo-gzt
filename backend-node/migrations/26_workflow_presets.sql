CREATE TABLE IF NOT EXISTS workflow_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preset_type TEXT NOT NULL,
  preset_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT,
  mode TEXT NOT NULL DEFAULT 'default',
  prompt_template TEXT,
  negative_prompt_template TEXT,
  options_json TEXT,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workflow_presets_type_active_order
ON workflow_presets (preset_type, deleted_at, is_active, sort_order);
