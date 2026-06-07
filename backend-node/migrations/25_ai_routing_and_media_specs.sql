-- AI 路由池与项目媒体规格记录

ALTER TABLE ai_service_configs ADD COLUMN route_order INTEGER DEFAULT 0;
ALTER TABLE ai_service_configs ADD COLUMN retry_count INTEGER DEFAULT 0;
ALTER TABLE ai_service_configs ADD COLUMN cooldown_seconds INTEGER DEFAULT 0;
ALTER TABLE ai_service_configs ADD COLUMN request_timeout_ms INTEGER DEFAULT 0;

UPDATE ai_service_configs
SET service_type = 'image'
WHERE service_type = 'storyboard_image';

ALTER TABLE image_generations ADD COLUMN params_json TEXT;
ALTER TABLE image_generations ADD COLUMN actual_params_json TEXT;

ALTER TABLE video_generations ADD COLUMN params_json TEXT;
ALTER TABLE video_generations ADD COLUMN actual_params_json TEXT;
