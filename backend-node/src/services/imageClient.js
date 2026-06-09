// 与 Go pkg/image + ImageGenerationService 对齐：调用图片生成 API，更新 image_generations 与角色头像
const path = require('path');
const crypto = require('crypto');
const aiConfigService = require('./aiConfigService');
const { getNoAiConfigMessage } = require('../utils/aiFriendlyErrors');
const uploadService = require('./uploadService');
const storageLayout = require('./storageLayout');
const taskService = require('./taskService');
const generationQueueService = require('./generationQueueService');
const seedance2AssetGuards = require('../utils/seedance2AssetGuards');
const { resolveProjectImageSpec } = require('./projectMediaSpec');
const { safeDeleteFile } = require('./storageCleanupService');
const { resolveImageRef } = require('./ai-image/imageRefResolver');
const { preferLocalStaticImageUrl, summarizeImageUrlForLog } = require('./ai-image/imageResultStore');
const modelRouter = require('./ai-runtime/modelRouter');
const modelCallLogger = require('./ai-runtime/modelCallLogger');
const modelSceneKeys = require('./ai-runtime/modelSceneKeys');
const usageEstimator = require('./ai-runtime/usageEstimator');
const dashScopeImageAdapter = require('./ai-image/adapters/dashScopeImage');
const geminiImageAdapter = require('./ai-image/adapters/geminiImage');
const klingImageAdapter = require('./ai-image/adapters/klingImage');
const nanoBananaImageAdapter = require('./ai-image/adapters/nanoBananaImage');
const openAiCompatibleImageAdapter = require('./ai-image/adapters/openAiCompatibleImage');
const openAiGptImageAdapter = require('./ai-image/adapters/openAiGptImage');

// 多参考图时注入到所有支持 negative_prompt 的模型，防止生成分割/拼贴布局；同时加入安全词以减少敏感拦截
const ANTI_SPLIT_NEGATIVE_PROMPT = 'nsfw, nudity, naked, violence, blood, gore, sensitive content, split panels, side-by-side layout, collage, diptych, triptych, grid layout, multiple panels, comparison view, composite image, two images in one frame';

function mergeNegativePromptFragments(auto, user) {
  const a = (auto || '').trim();
  const u = (user || '').trim();
  if (a && u) return `${a}, ${u}`;
  return a || u || '';
}

/** 角色/场景/道具资产生图：请求里显式传入 model 且资产上存有负面词时，与自动负面片段合并后传给图生 API */
function resolveAssetUserNegativeForApi(explicitModelName, storedNegative) {
  const hasModel = explicitModelName != null && String(explicitModelName).trim().length > 0;
  const neg = storedNegative != null ? String(storedNegative).trim() : '';
  return hasModel && neg ? neg : '';
}

/**
 * 根据 provider 名推断接口规范（api_protocol 未设置时的兜底逻辑）
 * 已明确设置 api_protocol 的配置不会走此函数。
 */
function inferProtocol(provider, model) {
  const p = String(provider || '').toLowerCase();
  if (p === 'cliproxy' || p === 'cliproxyapi' || p === 'cli_proxy_api') return 'cliproxy_gpt_image2';
  if (p === 'dashscope' || p === 'qwen_image') return 'dashscope';
  if (p === 'nano_banana') return 'nano_banana';
  if (p === 'gemini' || p === 'google') return 'gemini';
  if (p === 'volces' || p === 'volcengine' || p === 'volc') return 'volcengine';
  if (/seedream|doubao/i.test(model || '')) return 'volcengine';
  if (p === 'kling' || p === 'klingai') return 'kling';
  if (/^kling-/i.test(model || '')) return 'kling';
  return 'openai';
}

/**
 * 获取默认图片配置：使用统一图像路由池，按路由策略、冷却状态和可选模型/厂商筛选。
 */
function getDefaultImageConfig(db, preferredModel, preferredProvider, imageServiceType) {
  const first = getImageCandidateEntries(db, preferredModel, preferredProvider, imageServiceType)[0] || null;
  return first?.config || null;
}

function getImageConfigCandidates(db, preferredModel, preferredProvider, imageServiceType, configId) {
  return getImageCandidateEntries(db, preferredModel, preferredProvider, imageServiceType, configId).map((entry) => entry.config);
}

function getImageCandidateEntries(db, preferredModel, preferredProvider, imageServiceType, configId, sceneKey, context = {}) {
  const serviceType = 'image';
  let entries = [];
  if (sceneKey) {
    entries = modelRouter.getSceneMappedEntries(db, sceneKey, {
      serviceType,
      model: preferredModel,
      config_id: configId,
      user_id: context.user_id || context.userId,
      project_id: context.project_id || context.projectId || context.drama_id,
      usage_estimate: context.usage_estimate || context.usageEstimate,
    });
  }
  if (entries.length === 0) {
    entries = aiConfigService.getRuntimeConfigCandidates(db, serviceType, {
      model: preferredModel,
      config_id: configId,
      scene_key: sceneKey,
      user_id: context.user_id || context.userId,
      project_id: context.project_id || context.projectId || context.drama_id,
      usage_estimate: context.usage_estimate || context.usageEstimate,
    }).map((config) => ({ config, modelOverride: null, sceneKey: null, serviceType, source: 'default' }));
  }
  if (preferredProvider && String(preferredProvider).trim()) {
    const want = String(preferredProvider).trim().toLowerCase();
    const byProvider = entries.filter(({ config }) => (config.provider || '').toLowerCase() === want);
    if (byProvider.length > 0) entries = byProvider;
  }
  return entries;
}

function getModelFromConfig(config, preferredModel) {
  const models = Array.isArray(config.model) ? config.model : (config.model != null ? [config.model] : []);
  if (preferredModel && models.includes(preferredModel)) return preferredModel;
  if (config.default_model && models.includes(config.default_model)) return config.default_model;
  return models[0] || 'dall-e-3';
}

function ensureImageUsage(usage) {
  const next = { ...(usage || {}) };
  if (next.image_count == null) next.image_count = 1;
  return next;
}

function buildModelCallContextFromImageOpts(opts = {}) {
  return {
    project_id: opts.project_id || opts.projectId || opts.drama_id || null,
    task_id: opts.task_id || opts.taskId || null,
    user_id: opts.user_id || opts.userId || opts.operator_user_id || opts.user?.id || null,
    trace_id: opts.trace_id || opts.traceId || null,
  };
}

/**
 * 调用提供商图片生成 API（OpenAI /images/generations 风格 或 通义万象 multimodal-generation）
 * @param {object} db - database
 * @param {object} log - logger
 * @param {object} opts - { prompt, model?, size?, quality?, drama_id, preferred_provider?, character_id?, image_type?, image_gen_id, user_negative_prompt? }
 * @returns {Promise<{ image_url?: string, error?: string }>}
 */
async function callImageApi(db, log, opts) {
  const preferredProvider = opts.preferred_provider ?? opts.preferredProvider;
  const sceneKey = modelSceneKeys.resolveImageSceneKey(opts);
  const callContext = buildModelCallContextFromImageOpts(opts);
  const quotaEstimate = usageEstimator.estimateImageUsage(opts);
  const candidates = getImageCandidateEntries(
    db,
    opts.model,
    preferredProvider,
    opts.imageServiceType,
    opts.ai_config_id || opts.image_config_id || opts.config_id,
    sceneKey,
    { ...callContext, usage_estimate: quotaEstimate }
  );
  if (candidates.length === 0) {
    throw new Error(aiConfigService.getRuntimeQuotaBlockMessage(db, 'image', {
      model: opts.model,
      config_id: opts.ai_config_id || opts.image_config_id || opts.config_id,
      scene_key: sceneKey,
      usage_estimate: quotaEstimate,
      ...callContext,
    }) || getNoAiConfigMessage('image'));
  }
  let lastError = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const { config, modelOverride } = candidates[i];
    const effectiveModel = modelOverride || opts.model;
    const modelForPolicy = effectiveModel || config.default_model || (Array.isArray(config.model) ? config.model[0] : null);
    const retryCount = aiConfigService.getRetryCountForConfig(db, config, 'image', modelForPolicy);
    let stopRouting = false;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        const result = await callImageApiWithConfig(db, log, { ...opts, model: effectiveModel || opts.model }, config);
        if (result?.error) {
          lastError = new Error(result.error);
          if (attempt < retryCount) {
            log.warn('[图生] 当前配置失败，按策略重试', { config_id: config.id, attempt: attempt + 1, retry_count: retryCount, error: result.error });
            continue;
          }
          const failure = aiConfigService.recordConfigFailure(db, config.id, lastError, { serviceType: 'image', model: modelForPolicy });
          modelCallLogger.recordModelCall(db, {
            service_type: 'image',
            scene_key: sceneKey,
            config_id: config.id,
            provider: config.provider,
            api_protocol: config.api_protocol,
            model: modelForPolicy,
            status: 'failed',
            prompt: opts.prompt,
            error: lastError,
            diagnostics: { reason: failure.reason, fallbackable: failure.fallbackable, image_gen_id: opts.image_gen_id || null },
            ...callContext,
          });
          log.warn('[图生] 当前配置失败，尝试下一个可用配置', {
            config_id: config.id,
            reason: failure.reason,
            fallbackable: failure.fallbackable,
            error: failure.message,
          });
          if (failure.fallbackable && i < candidates.length - 1) break;
          return result;
        }
        aiConfigService.recordConfigSuccess(db, config.id);
        modelCallLogger.recordModelCall(db, {
            service_type: 'image',
            scene_key: sceneKey,
            config_id: config.id,
          provider: config.provider,
          api_protocol: config.api_protocol,
          model: modelForPolicy,
          status: 'success',
          prompt: opts.prompt,
          usage: ensureImageUsage(result.usage),
          diagnostics: { ...(result.diagnostics || {}), image_gen_id: opts.image_gen_id || null },
          ...callContext,
        });
        return result;
      } catch (err) {
        lastError = err;
        if (attempt < retryCount) {
          log.warn('[图生] 当前配置异常，按策略重试', { config_id: config.id, attempt: attempt + 1, retry_count: retryCount, error: err.message });
          continue;
        }
        const failure = aiConfigService.recordConfigFailure(db, config.id, err, { serviceType: 'image', model: modelForPolicy });
        modelCallLogger.recordModelCall(db, {
          service_type: 'image',
          scene_key: sceneKey,
          config_id: config.id,
          provider: config.provider,
          api_protocol: config.api_protocol,
          model: modelForPolicy,
          status: 'failed',
          prompt: opts.prompt,
          error: err,
          diagnostics: { reason: failure.reason, fallbackable: failure.fallbackable, image_gen_id: opts.image_gen_id || null },
          ...callContext,
        });
        log.warn('[图生] 当前配置异常，尝试下一个可用配置', {
          config_id: config.id,
          reason: failure.reason,
          fallbackable: failure.fallbackable,
          error: failure.message,
        });
        if (!failure.fallbackable || i === candidates.length - 1) {
          stopRouting = true;
          break;
        }
      }
    }
    if (stopRouting) break;
  }
  return { error: lastError?.message || '图片生成失败' };
}

async function callImageApiWithConfig(db, log, opts, config) {
  const {
    prompt,
    model: preferredModel,
    size,
    quality,
    drama_id,
    preferred_provider,
    character_id,
    image_type,
    image_gen_id,
    imageServiceType,
    reference_image_urls,
    files_base_url,
    storage_local_path,
    system_prompt,
    user_negative_prompt,
  } = opts;
  if (!config) {
    throw new Error(getNoAiConfigMessage('image'));
  }
  const model = getModelFromConfig(config, preferredModel);
  const provider = (config.provider || '').toLowerCase();
  // api_protocol 显式指定接口规范，优先级高于 provider 推断；未设置时按 provider 自动判断
  const protocol = (config.api_protocol || '').toLowerCase() || inferProtocol(provider, model);

  // ── 参考图标签注入：为所有非 Gemini 模型将标签注入 prompt 文本 ─────────────────────────────
  // Gemini 通过 parts 结构处理（interleaved text+image），不需要文字注入。
  // 其他所有模型（Doubao/DashScope/NanoBanana/OpenAI-compat 等）通过文字告知模型各参考图用途，
  // 避免模型模仿参考图的宫格/四视图布局，同时抑制生成分割画面。
  let effectivePrompt = prompt || '';
  if (
    protocol !== 'gemini' &&
    Array.isArray(reference_image_urls) && reference_image_urls.length > 0 &&
    system_prompt
  ) {
    const refLines = String(system_prompt).split('\n').filter(l => /^Image\s+\d+:/i.test(l));
    if (refLines.length > 0) {
      const refHeader = refLines
        .map(l => `[${l} — FOR REFERENCE ONLY, DO NOT copy its layout or framing]`)
        .join('\n');
      effectivePrompt = `${refHeader}\n\n[GENERATE THIS SCENE — single continuous image, no grid, no split panels]:\n${effectivePrompt}`;
    }
  }

  log.info('[图生] callImageApi 路由', {
    image_gen_id,
    protocol,
    api_protocol_raw: config.api_protocol || '(empty→auto)',
    provider,
    model,
    size,
    imageServiceType,
    ref_count: Array.isArray(opts.reference_image_urls) ? opts.reference_image_urls.length : 0,
    ref_label_injected: effectivePrompt !== (prompt || ''),
    prompt_len: String(effectivePrompt || '').length,
    prompt_hash: crypto.createHash('sha1').update(String(effectivePrompt || '')).digest('hex').slice(0, 12),
  });

  // 多参考图时统一生成 negative_prompt（供各子函数使用）
  const refCountForNeg = Array.isArray(opts.reference_image_urls) ? opts.reference_image_urls.filter(Boolean).length : 0;
  // Seedream/Volcengine 模型强制启用安全词负面提示，其他模型仅在多参考图时启用
  const isVolcOrSeedream = (protocol === 'volcengine' || /seedream|doubao/i.test(model));
  const autoNegativePrompt = (refCountForNeg > 1 || isVolcOrSeedream) ? ANTI_SPLIT_NEGATIVE_PROMPT : '';
  const userNegFragment = (user_negative_prompt && String(user_negative_prompt).trim()) || '';
  const mergedNegativePrompt = mergeNegativePromptFragments(autoNegativePrompt, userNegFragment);

  if (protocol === 'openai_gpt_image' || protocol === 'cliproxy_gpt_image2') {
    return openAiGptImageAdapter.callOpenAiGptImageApi(db, config, log, {
      prompt: effectivePrompt,
      model,
      size,
      quality,
      image_gen_id,
      reference_image_urls: opts.reference_image_urls,
      files_base_url: opts.files_base_url,
      storage_local_path: opts.storage_local_path,
      protocol,
    });
  }

  if (protocol === 'dashscope') {
    return dashScopeImageAdapter.callDashScopeImageApi(config, log, {
      prompt: effectivePrompt, model, size, image_gen_id,
      reference_image_urls: opts.reference_image_urls,
      files_base_url: opts.files_base_url,
      storage_local_path: opts.storage_local_path,
      negative_prompt: mergedNegativePrompt,
    });
  }

  if (protocol === 'nano_banana') {
    return nanoBananaImageAdapter.callNanoBananaImageApi(config, log, {
      prompt: effectivePrompt, model, size, image_gen_id,
      reference_image_urls: opts.reference_image_urls,
      files_base_url: opts.files_base_url,
      storage_local_path: opts.storage_local_path,
    });
  }

  if (protocol === 'kling') {
    return klingImageAdapter.callKlingImageApi(config, log, {
      prompt: effectivePrompt, model, size, image_gen_id,
      reference_image_urls: opts.reference_image_urls,
      files_base_url: opts.files_base_url,
      storage_local_path: opts.storage_local_path,
    });
  }

  if (protocol === 'gemini') {
    return geminiImageAdapter.callGeminiImageApi(db, config, log, {
      prompt, model, size, image_gen_id,          // Gemini 用原始 prompt，不注入文字标签
      reference_image_urls: opts.reference_image_urls,
      files_base_url: opts.files_base_url,
      storage_local_path: opts.storage_local_path,
      system_prompt: opts.system_prompt,
    });
  }

  return openAiCompatibleImageAdapter.callOpenAiCompatibleImageApi(db, config, log, {
    prompt: effectivePrompt,
    model,
    size,
    quality,
    image_gen_id,
    reference_image_urls: opts.reference_image_urls,
    files_base_url: opts.files_base_url,
    storage_local_path: opts.storage_local_path,
    protocol,
    negative_prompt: mergedNegativePrompt,
  });
}

/**
 * 创建 image_generation 记录并异步调用 API，完成后更新记录与角色 image_url。
 * 与场景图一致：创建 task 并写入 task_id，便于前端轮询 /tasks/:task_id 获知完成或报错。
 */
function createAndGenerateImage(db, log, opts) {
  const {
    drama_id,
    character_id,
    scene_id,
    image_type,
    prompt,
    model,
    size,
    quality,
    provider,
    ai_config_id,
    image_config_id,
    user_negative_prompt,
    user,
  } = opts;
  const negRow = (user_negative_prompt && String(user_negative_prompt).trim()) || null;
  const now = new Date().toISOString();
  const dramaIdNum = Number(drama_id) || 0;
  const charIdNum = character_id != null ? Number(character_id) : null;
  const sceneIdNum = scene_id != null ? Number(scene_id) : null;

  let resourceId;
  if (charIdNum != null) resourceId = `character_${charIdNum}`;
  else if (sceneIdNum != null) resourceId = `scene_${sceneIdNum}`;
  else resourceId = String(dramaIdNum);
  const task = taskService.createTask(db, log, 'image_generation', resourceId, {
    drama_id: dramaIdNum,
    resource_type: charIdNum != null ? 'character' : sceneIdNum != null ? 'scene' : 'image_generation',
    user,
  });
  const taskId = task.id;
  const projectImageSpec = dramaIdNum ? resolveProjectImageSpec(db, dramaIdNum) : null;
  const effectiveSize = size || projectImageSpec?.size || null;
  const paramsJson = JSON.stringify({
    product_image_spec: projectImageSpec,
    request_size: size || null,
  });

  const info = db.prepare(
    `INSERT INTO image_generations (drama_id, character_id, scene_id, provider, prompt, negative_prompt, model, ai_config_id, size, quality, params_json, status, task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).run(
    dramaIdNum,
    charIdNum,
    sceneIdNum,
    provider || 'openai',
    prompt || '',
    negRow,
    model || null,
    ai_config_id || image_config_id || null,
    effectiveSize,
    quality || null,
    paramsJson,
    taskId,
    now,
    now
  );
  const imageGenId = info.lastInsertRowid;

  generationQueueService.enqueue(db, log, {
    generationType: 'image',
    taskId,
    label: `image_generation:${imageGenId}`,
    queuedMessage: '图片任务排队中，等待可用生成名额',
    processingMessage: '正在生成图片...',
    onCancel: () => {
      db.prepare(
        'UPDATE image_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ? AND status = ?'
      ).run('cancelled', '任务已停止', new Date().toISOString(), imageGenId, 'pending');
    },
    runner: async () => {
    try {
      db.prepare('UPDATE image_generations SET status = ? WHERE id = ?').run('processing', imageGenId);
      if (taskService.isTaskCancelled(db, taskId)) {
        db.prepare(
          'UPDATE image_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?'
        ).run('cancelled', '任务已停止', new Date().toISOString(), imageGenId);
        log.info('Image generation cancelled before API call', { image_gen_id: imageGenId, task_id: taskId });
        return;
      }
      const result = await callImageApi(db, log, {
        prompt,
        model,
        size: effectiveSize,
        quality,
        drama_id: drama_id,
        character_id: character_id,
        image_type,
        image_gen_id: imageGenId,
        task_id: taskId,
        ai_config_id: ai_config_id || image_config_id || undefined,
        user_negative_prompt: user_negative_prompt || undefined,
        user,
      });
      const now2 = new Date().toISOString();
      if (taskService.isTaskCancelled(db, taskId)) {
        db.prepare(
          'UPDATE image_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?'
        ).run('cancelled', '任务已停止', now2, imageGenId);
        log.info('Image generation cancelled, ignoring model result', { image_gen_id: imageGenId, task_id: taskId });
        return;
      }
      if (result.error) {
        db.prepare(
          'UPDATE image_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?'
        ).run('failed', result.error, now2, imageGenId);
        taskService.updateTaskError(db, taskId, result.error);
        if (charIdNum != null) {
          try {
            db.prepare('UPDATE characters SET error_msg = ?, updated_at = ? WHERE id = ?').run(result.error, now2, charIdNum);
          } catch (_) {}
        }
        if (sceneIdNum != null) {
          try {
            db.prepare('UPDATE scenes SET error_msg = ?, updated_at = ? WHERE id = ?').run(result.error, now2, sceneIdNum);
          } catch (_) {}
        }
        log.error('Image generation failed', { image_gen_id: imageGenId, error: result.error });
        return;
      }
      let localPath = null;
      let storagePath = null;
      try {
        const loadConfig = require('../config').loadConfig;
        const cfg = loadConfig();
        storagePath = path.isAbsolute(cfg.storage?.local_path)
          ? cfg.storage.local_path
          : path.join(process.cwd(), cfg.storage?.local_path || './data/storage');
        const category = sceneIdNum != null ? 'scenes' : (charIdNum != null ? 'characters' : 'images');
        const projectSubdir = storageLayout.getProjectStorageSubdir(db, dramaIdNum);
        localPath = await uploadService.downloadImageToLocal(
          storagePath,
          result.image_url,
          category,
          log,
          'ig',
          projectSubdir
        );
      } catch (_) {}
      if (taskService.isTaskCancelled(db, taskId)) {
        if (localPath && storagePath) {
          try { safeDeleteFile(storagePath, localPath); } catch (_) {}
        }
        db.prepare(
          'UPDATE image_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?'
        ).run('cancelled', '任务已停止', new Date().toISOString(), imageGenId);
        log.info('Image generation cancelled after download, ignoring model result', { image_gen_id: imageGenId, task_id: taskId });
        return;
      }
      const persistedImageUrl = preferLocalStaticImageUrl(result.image_url, localPath);
      db.prepare(
        'UPDATE image_generations SET status = ?, image_url = ?, local_path = ?, actual_params_json = ?, completed_at = ?, updated_at = ? WHERE id = ?'
      ).run('completed', persistedImageUrl, localPath, result.actual_params ? JSON.stringify(result.actual_params) : null, now2, now2, imageGenId);
      taskService.updateTaskResult(db, taskId, { image_generation_id: imageGenId, image_url: persistedImageUrl, local_path: localPath, status: 'completed' });
      if (charIdNum != null) {
        try {
          // 旧图追加到 extra_images，与上传逻辑保持一致
          const oldChar = db
            .prepare('SELECT local_path, image_url, extra_images, seedance2_asset FROM characters WHERE id = ?')
            .get(charIdNum);
          const oldPath = oldChar?.local_path || oldChar?.image_url || '';
          let extras = [];
          try { extras = oldChar?.extra_images ? JSON.parse(oldChar.extra_images) : []; } catch (_) {}
          if (!Array.isArray(extras)) extras = [];
          if (oldPath && !extras.includes(oldPath)) extras.push(oldPath);
          const extraJson = extras.length ? JSON.stringify(extras) : null;
          seedance2AssetGuards.markStaleOnCharacterMainImageDrift(db, log, { ...oldChar, id: charIdNum }, {
            image_url: persistedImageUrl,
            local_path: localPath,
          });
          db.prepare('UPDATE characters SET image_url = ?, local_path = ?, extra_images = ?, updated_at = ? WHERE id = ?').run(
            persistedImageUrl,
            localPath,
            extraJson,
            now2,
            charIdNum
          );
        } catch (e) {
          if ((e.message || '').includes('local_path') || (e.message || '').includes('extra_images')) {
            db.prepare('UPDATE characters SET image_url = ?, updated_at = ? WHERE id = ?').run(persistedImageUrl, now2, charIdNum);
          } else {
            throw e;
          }
        }
        log.info('Character image updated', { character_id: charIdNum, ...summarizeImageUrlForLog(persistedImageUrl), local_path: localPath });
      }
      if (sceneIdNum != null) {
        try {
          // 旧图追加到 extra_images，与上传逻辑保持一致
          const oldScene = db.prepare('SELECT local_path, image_url, extra_images FROM scenes WHERE id = ?').get(sceneIdNum);
          const oldPath = oldScene?.local_path || oldScene?.image_url || '';
          let extras = [];
          try { extras = oldScene?.extra_images ? JSON.parse(oldScene.extra_images) : []; } catch (_) {}
          if (!Array.isArray(extras)) extras = [];
          if (oldPath && !extras.includes(oldPath)) extras.push(oldPath);
          const extraJson = extras.length ? JSON.stringify(extras) : null;
          db.prepare('UPDATE scenes SET image_url = ?, local_path = ?, extra_images = ?, updated_at = ? WHERE id = ?').run(
            persistedImageUrl,
            localPath,
            extraJson,
            now2,
            sceneIdNum
          );
        } catch (e) {
          if ((e.message || '').includes('local_path') || (e.message || '').includes('extra_images')) {
            db.prepare('UPDATE scenes SET image_url = ?, updated_at = ? WHERE id = ?').run(persistedImageUrl, now2, sceneIdNum);
          } else {
            throw e;
          }
        }
        log.info('Scene image updated', { scene_id: sceneIdNum, ...summarizeImageUrlForLog(persistedImageUrl), local_path: localPath });
      }
      log.info('Image generation completed', { image_gen_id: imageGenId, local_path: localPath });
    } catch (err) {
      const now2 = new Date().toISOString();
      const errMsg = (err && err.message) ? String(err.message).slice(0, 500) : 'Unknown error';
      if (taskService.isTaskCancelled(db, taskId)) {
        try {
          db.prepare(
            'UPDATE image_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?'
          ).run('cancelled', '任务已停止', now2, imageGenId);
        } catch (_) {}
        log.info('Image generation cancelled after error, ignoring error state', { image_gen_id: imageGenId, task_id: taskId });
        return;
      }
      try {
        db.prepare(
          'UPDATE image_generations SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?'
        ).run('failed', errMsg, now2, imageGenId);
      } catch (e) {
        log.error('Image generation: failed to update image_generations', { image_gen_id: imageGenId, error: e.message });
      }
      try {
        taskService.updateTaskError(db, taskId, errMsg);
      } catch (e) {
        log.error('Image generation: failed to update task status', { task_id: taskId, error: e.message });
      }
      if (charIdNum != null) {
        try {
          db.prepare('UPDATE characters SET error_msg = ?, updated_at = ? WHERE id = ?').run(errMsg, now2, charIdNum);
        } catch (_) {}
      }
      if (sceneIdNum != null) {
        try {
          db.prepare('UPDATE scenes SET error_msg = ?, updated_at = ? WHERE id = ?').run(errMsg, now2, sceneIdNum);
        } catch (_) {}
      }
      log.error('Image generation error', { image_gen_id: imageGenId, task_id: taskId, error: err.message });
    }
    },
  });

  const row = db.prepare('SELECT * FROM image_generations WHERE id = ?').get(imageGenId);
  return row ? rowToItem(row) : { id: imageGenId, task_id: taskId, status: 'pending', drama_id: dramaIdNum, character_id: charIdNum, scene_id: sceneIdNum, prompt, model, size, quality, created_at: now, updated_at: now };
}

function rowToItem(r) {
  return {
    id: r.id,
    storyboard_id: r.storyboard_id,
    drama_id: r.drama_id,
    character_id: r.character_id,
    provider: r.provider,
    prompt: r.prompt,
    model: r.model,
    size: r.size,
    quality: r.quality,
    image_url: r.image_url,
    local_path: r.local_path,
    status: r.status,
    task_id: r.task_id,
    error_msg: r.error_msg,
    created_at: r.created_at,
    updated_at: r.updated_at,
    completed_at: r.completed_at,
  };
}

/** 分镜参考图上限（与 callGeminiImageApi 的 MAX_GEMINI_REF_IMAGES、可灵单图参考等对齐） */
function getStoryboardReferenceLimits(config, modelName) {
  const provider = (config?.provider || '').toLowerCase();
  const protocol = (config?.api_protocol || '').toLowerCase() || inferProtocol(provider, modelName || config?.model);
  if (protocol === 'kling') {
    return { total: 1, maxCharacters: 1, maxObjects: 1 };
  }
  return { total: 4, maxCharacters: 3, maxObjects: 4 };
}

function countStoryboardRefsFromLabels(refLabels) {
  let characters = 0;
  let objects = 0;
  for (const lbl of refLabels || []) {
    if (/character appearance/i.test(lbl)) characters += 1;
    else if (/scene background|prop\/object/i.test(lbl)) objects += 1;
  }
  return { characters, objects };
}

function canAddStoryboardCharacterRef(refLabels, limits) {
  const { characters } = countStoryboardRefsFromLabels(refLabels);
  return refLabels.length < limits.total && characters < limits.maxCharacters;
}

function canAddStoryboardObjectRef(refLabels, limits) {
  const { objects } = countStoryboardRefsFromLabels(refLabels);
  return refLabels.length < limits.total && objects < limits.maxObjects;
}

/** 去重：同一本地路径或 URL（忽略 query）不重复加入参考图列表 */
function canonicalRefKey(ref) {
  if (ref == null || ref === '') return '';
  let s = String(ref).trim().replace(/\\/g, '/');
  if (s.startsWith('data:')) return s.slice(0, 120);
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return `${u.origin}${u.pathname}`.toLowerCase();
    } catch (_) {
      return s.split('?')[0].toLowerCase();
    }
  }
  try {
    return path.normalize(s).toLowerCase();
  } catch (_) {
    return s.toLowerCase();
  }
}

function refListHasCanonical(list, ref) {
  const key = canonicalRefKey(ref);
  if (!key) return false;
  return (list || []).some((item) => canonicalRefKey(item) === key);
}

module.exports = {
  getDefaultImageConfig,
  callImageApi,
  createAndGenerateImage,
  resolveAssetUserNegativeForApi,
  getStoryboardReferenceLimits,
  canAddStoryboardCharacterRef,
  canAddStoryboardObjectRef,
  refListHasCanonical,
  _test: {
    ...dashScopeImageAdapter._test,
    ...geminiImageAdapter._test,
    ...klingImageAdapter._test,
    ...nanoBananaImageAdapter._test,
    ...openAiCompatibleImageAdapter._test,
    ...openAiGptImageAdapter._test,
    getImageCandidateEntries,
    ensureImageUsage,
    resolveImageRef,
    preferLocalStaticImageUrl,
  },
  /** 图床 URL 缓存（image_proxy_cache），供 SD2 认证等复用 */
  getProxyCache: geminiImageAdapter.getProxyCache,
  setProxyCache: geminiImageAdapter.setProxyCache,
};
