const settingsService = require('../services/settingsService');
const response = require('../response');
const { loadConfig } = require('../config');
const { resolveVideoGenerationTimeoutMinutes } = require('../config/videoGeneration');
const aiConfigService = require('../services/aiConfigService');

function getLanguage(cfg) {
  return (req, res) => {
    const language = settingsService.getLanguage(cfg);
    response.success(res, { language });
  };
}

function updateLanguage(cfg, log) {
  return (req, res) => {
    const lang = req.body?.language;
    if (lang !== 'zh' && lang !== 'en') {
      return response.badRequest(res, '语言参数错误，只支持 zh 或 en');
    }
    const out = settingsService.updateLanguage(cfg, log, lang);
    if (!out.ok) return response.badRequest(res, out.error);
    const message = lang === 'en' ? 'Language switched to English' : '语言已切换为中文';
    response.success(res, { message, language: lang });
  };
}

/** GET /settings/generation — 获取生成相关全局设置 */
function getGenerationSettings(db) {
  return (req, res) => {
    const policies = aiConfigService.getRoutingPolicies(db);
    const video_generation_timeout_minutes =
      policies.video?.video_poll_timeout_minutes || resolveVideoGenerationTimeoutMinutes(loadConfig());
    response.success(res, {
      policies,
      // 兼容旧前端字段：这些字段不再作为管理员主设置展示。
      concurrency: settingsService.getGlobalSetting(db, 'pipeline_concurrency', 8),
      video_concurrency: settingsService.getGlobalSetting(db, 'pipeline_video_concurrency', 3),
      video_generation_timeout_minutes,
    });
  };
}

/** PUT /settings/generation — 更新生成相关全局设置 */
function updateGenerationSettings(db) {
  return (req, res) => {
    const { concurrency, video_concurrency, policies } = req.body || {};
    if (policies !== undefined) {
      let savedPolicies = aiConfigService.getRoutingPolicies(db);
      for (const [serviceType, patch] of Object.entries(policies || {})) {
        savedPolicies = aiConfigService.updateRoutingPolicy(db, serviceType, patch);
      }
      return response.success(res, {
        policies: savedPolicies,
        concurrency: settingsService.getGlobalSetting(db, 'pipeline_concurrency', 8),
        video_concurrency: settingsService.getGlobalSetting(db, 'pipeline_video_concurrency', 3),
        video_generation_timeout_minutes:
          savedPolicies.video?.video_poll_timeout_minutes || resolveVideoGenerationTimeoutMinutes(loadConfig()),
      });
    }

    if (concurrency !== undefined) {
      const n = Number(concurrency);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return response.badRequest(res, '图片并发数需为 1-20 之间的整数');
      }
      settingsService.setGlobalSetting(db, 'pipeline_concurrency', n);
    }
    if (video_concurrency !== undefined) {
      const n = Number(video_concurrency);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        return response.badRequest(res, '视频并发数需为 1-20 之间的整数');
      }
      settingsService.setGlobalSetting(db, 'pipeline_video_concurrency', n);
    }
    const saved = settingsService.getGlobalSetting(db, 'pipeline_concurrency', 8);
    const saved_video = settingsService.getGlobalSetting(db, 'pipeline_video_concurrency', 3);
    const policiesOut = aiConfigService.getRoutingPolicies(db);
    const video_generation_timeout_minutes =
      policiesOut.video?.video_poll_timeout_minutes || resolveVideoGenerationTimeoutMinutes(loadConfig());
    response.success(res, {
      policies: policiesOut,
      concurrency: saved,
      video_concurrency: saved_video,
      video_generation_timeout_minutes,
    });
  };
}

module.exports = function settingsRoutes(db, cfg, log) {
  return {
    getLanguage: getLanguage(cfg),
    updateLanguage: updateLanguage(cfg, log),
    getGenerationSettings: getGenerationSettings(db),
    updateGenerationSettings: updateGenerationSettings(db),
  };
};
