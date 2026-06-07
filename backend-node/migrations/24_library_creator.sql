ALTER TABLE character_libraries ADD COLUMN created_by_user_id TEXT;
ALTER TABLE character_libraries ADD COLUMN created_by_username TEXT;
ALTER TABLE character_libraries ADD COLUMN created_by_display_name TEXT;
CREATE INDEX IF NOT EXISTS idx_character_libraries_created_by_user_id ON character_libraries(created_by_user_id);

ALTER TABLE scene_libraries ADD COLUMN created_by_user_id TEXT;
ALTER TABLE scene_libraries ADD COLUMN created_by_username TEXT;
ALTER TABLE scene_libraries ADD COLUMN created_by_display_name TEXT;
CREATE INDEX IF NOT EXISTS idx_scene_libraries_created_by_user_id ON scene_libraries(created_by_user_id);

ALTER TABLE prop_libraries ADD COLUMN created_by_user_id TEXT;
ALTER TABLE prop_libraries ADD COLUMN created_by_username TEXT;
ALTER TABLE prop_libraries ADD COLUMN created_by_display_name TEXT;
CREATE INDEX IF NOT EXISTS idx_prop_libraries_created_by_user_id ON prop_libraries(created_by_user_id);
