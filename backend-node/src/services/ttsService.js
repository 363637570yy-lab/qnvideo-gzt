/**
 * TTS 语音合成服务
 * 支持多种 TTS 接口：minimax、edge-tts（本地）、通用 HTTP
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const minimaxTtsAdapter = require('./ai-audio/adapters/minimaxTts');
const openAiTtsAdapter = require('./ai-audio/adapters/openAiTts');
const modelRouter = require('./ai-runtime/modelRouter');
const modelCallLogger = require('./ai-runtime/modelCallLogger');
const modelSceneKeys = require('./ai-runtime/modelSceneKeys');
const usageEstimator = require('./ai-runtime/usageEstimator');

/**
 * 合成 TTS 并保存到本地文件
 * @returns {{ local_path: string, audio_url: string }}
 */
async function synthesize(db, log, { text, storyboard_id, scene_key, sceneKey, config, storage_base, voice_id, speed, ai_config_id, tts_config_id, user, user_id, userId, project_id, projectId, drama_id, task_id, taskId, trace_id, traceId }) {
  if (!text || !text.trim()) throw new Error('text 不能为空');
  const sceneKeyForRoute = modelSceneKeys.resolveTtsSceneKey({ storyboard_id, scene_key, sceneKey });
  const callContext = {
    user_id: user_id || userId || user?.id || null,
    project_id: project_id || projectId || drama_id || null,
    task_id: task_id || taskId || null,
    trace_id: trace_id || traceId || null,
  };
  const quotaEstimate = usageEstimator.estimateTtsUsage(text, speed || 1);
  const candidates = config
    ? [{ config, modelOverride: null }]
    : (() => {
        const mapped = modelRouter.getSceneMappedEntries(db, sceneKeyForRoute, {
          serviceType: 'tts',
          config_id: ai_config_id || tts_config_id || null,
          scene_key: sceneKeyForRoute,
          usage_estimate: quotaEstimate,
          ...callContext,
        });
        return mapped.length
          ? mapped
          : modelRouter.getRuntimeConfigCandidates(db, 'tts', {
            config_id: ai_config_id || tts_config_id || null,
            scene_key: sceneKeyForRoute,
            usage_estimate: quotaEstimate,
            ...callContext,
          }).map((item) => ({ config: item, modelOverride: null }));
      })();
  if (!candidates.length) {
    throw new Error(modelRouter.getRuntimeQuotaBlockMessage(db, 'tts', {
      config_id: ai_config_id || tts_config_id || null,
      scene_key: sceneKeyForRoute,
      usage_estimate: quotaEstimate,
      ...callContext,
    }) || '未配置 TTS 模型，请在「AI 配置」中添加 service_type=tts 的配置');
  }
  let audioBuffer;
  let provider = '';
  let ttsModel = '';
  let lastError = null;

  for (let i = 0; i < candidates.length; i += 1) {
    const { config: ttsConfig, modelOverride } = candidates[i];
    provider = (ttsConfig.provider || '').toLowerCase();
    let ttsSettings = {};
    try { ttsSettings = JSON.parse(ttsConfig.settings || '{}'); } catch (_) {}
    const voiceId = voice_id || ttsConfig.voice_id || ttsSettings.voice_id || '';
    const groupId = ttsConfig.group_id || ttsSettings.group_id || '';
    ttsModel = modelOverride || ttsConfig.default_model || (Array.isArray(ttsConfig.model) ? ttsConfig.model[0] : ttsConfig.model) || '';
    const finalSpeed = speed || ttsSettings.speed || 1.0;
    const requestTimeoutMs = modelRouter.getRequestTimeoutMsForConfig(db, ttsConfig, 'tts', ttsModel, 180000);

    const startMs = Date.now();
    try {
      if (provider === 'minimax') {
        audioBuffer = await minimaxTtsAdapter.synthesizeWithMinimax(
          text,
          voiceId || 'female-shaonv',
          ttsConfig.api_key,
          groupId,
          ttsModel || 'speech-02-hd',
          requestTimeoutMs,
          ttsConfig.base_url
        );
      } else if (provider === 'openai' || ttsConfig.base_url) {
        log?.info?.('TTS synthesize with OpenAI-compatible provider', {
          config_id: ttsConfig.id,
          provider: provider || 'openai-compatible',
          voice: voiceId || null,
          base_url: ttsConfig.base_url || null,
          model: ttsModel || null,
          text_length: text.length,
        });
        audioBuffer = await openAiTtsAdapter.synthesizeWithOpenai(
          text,
          voiceId || 'alloy',
          ttsConfig.api_key,
          ttsConfig.base_url,
          ttsModel || 'tts-1',
          finalSpeed,
          requestTimeoutMs
        );
      } else {
        throw new Error(`不支持的 TTS provider: ${provider}，目前支持 openai、minimax`);
      }
      modelRouter.recordConfigSuccess(db, ttsConfig.id);
      modelCallLogger.recordModelCall(db, {
        service_type: 'tts',
        scene_key: sceneKeyForRoute,
        config_id: ttsConfig.id,
        provider: ttsConfig.provider,
        api_protocol: ttsConfig.api_protocol,
        model: ttsModel,
        status: 'success',
        elapsed_ms: Date.now() - startMs,
        prompt: text,
        usage: usageEstimator.estimateTtsUsage(text, finalSpeed),
        usage_source: 'estimated',
        diagnostics: { text_length: text.length, voice_id: voiceId || null },
        ...callContext,
      });
      break;
    } catch (err) {
      lastError = err;
      const failure = modelRouter.recordConfigFailure(db, ttsConfig.id, err, { serviceType: 'tts', model: ttsModel });
      modelCallLogger.recordModelCall(db, {
        service_type: 'tts',
        scene_key: sceneKeyForRoute,
        config_id: ttsConfig.id,
        provider: ttsConfig.provider,
        api_protocol: ttsConfig.api_protocol,
        model: ttsModel,
        status: 'failed',
        elapsed_ms: Date.now() - startMs,
        prompt: text,
        error: err,
        diagnostics: { reason: failure.reason, fallbackable: failure.fallbackable, text_length: text.length },
        ...callContext,
      });
      log?.warn?.('[TTS] 当前配置失败，尝试下一个可用配置', {
        config_id: ttsConfig.id,
        reason: failure.reason,
        fallbackable: failure.fallbackable,
        error: failure.message,
      });
      if (!failure.fallbackable || i === candidates.length - 1) break;
    }
  }
  if (!audioBuffer) throw lastError || new Error('TTS 合成失败');

  // 保存到本地
  const audioDir = path.join(storage_base, 'audio');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  const filename = `tts_sb${storyboard_id || 'x'}_${randomUUID().slice(0, 8)}.mp3`;
  const filePath = path.join(audioDir, filename);
  fs.writeFileSync(filePath, audioBuffer);
  const localPath = `audio/${filename}`;
  log.info('[TTS] 合成完成', { storyboard_id, local_path: localPath, provider });
  try { const cs = require('./cloudService'); cs.reportUsage('tts', ttsModel || '', '', 0); } catch (_) {}
  return { local_path: localPath };
}

module.exports = { synthesize, _test: { estimateTtsAudioSeconds: usageEstimator.estimateTtsAudioSeconds } };
