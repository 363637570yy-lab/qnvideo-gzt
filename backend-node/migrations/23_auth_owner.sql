ALTER TABLE dramas ADD COLUMN owner_user_id TEXT;
ALTER TABLE dramas ADD COLUMN created_by_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_dramas_owner_user_id ON dramas(owner_user_id);
