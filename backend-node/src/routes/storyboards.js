const response = require('../response');
const storyboardService = require('../services/storyboardService');
const episodeStoryboardService = require('../services/episodeStoryboardService');
const framePromptService = require('../services/framePromptService');
const aiClient = require('../services/aiClient');
const promptI18n = require('../services/promptI18n');
const { buildUniversalSegmentUserPromptBundle } = require('../services/universalSegmentPromptBundle');
const { normalizeUniversalSegmentShotDurations } = require('../services/universalSegmentDurationNormalize');
const {
  formatNeighborShotPolishContext,
  extractRetentionClausesFromVideoPrompts,
  buildClassicRequiredCoverageDigest,
  formatClassicVideoNeighborBlock,
  normalizeUniversalSegmentAtImageSpacing,
} = require('./storyboardRouteHelpers');
const { createStoryboardUpscaleHandler } = require('./storyboardUpscaleHandler');
const { createStoryboardBatchInferHandler } = require('./storyboardBatchInferHandler');

function routes(db, log) {
  return {
    create: (req, res) => {
      try {
        const sb = storyboardService.createStoryboard(db, log, req.body || {});
        response.created(res, sb);
      } catch (err) {
        log.error('storyboards create', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    insertBefore: (req, res) => {
      try {
        const sb = storyboardService.insertBeforeStoryboard(db, log, req.params.id);
        if (!sb) return response.notFound(res, '目标分镜不存在');
        response.created(res, sb);
      } catch (err) {
        log.error('storyboards insertBefore', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    getOne: (req, res) => {
      try {
        const sb = storyboardService.getStoryboardById(db, req.params.id);
        if (!sb) return response.notFound(res, '分镜不存在');
        response.success(res, sb);
      } catch (err) {
        log.error('storyboards getOne', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    update: (req, res) => {
      try {
        const sb = storyboardService.updateStoryboard(db, log, req.params.id, req.body || {});
        if (!sb) return response.notFound(res, '分镜不存在');
        response.success(res, sb);
      } catch (err) {
        log.error('storyboards update', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    delete: (req, res) => {
      try {
        const ok = storyboardService.deleteStoryboard(db, log, req.params.id);
        if (!ok) return response.notFound(res, '分镜不存在');
        response.success(res, { message: '删除成功' });
      } catch (err) {
        log.error('storyboards delete', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    framePrompt: (req, res) => {
      try {
        const body = req.body || {};
        const frameType = body.frame_type || 'first';
        const panelCount = body.panel_count || 3;
        const model = body.model || '';
        const taskId = framePromptService.generateFramePrompt(db, log, req.params.id, frameType, panelCount, model, req.user);
        response.success(res, {
          task_id: taskId,
          status: 'pending',
          message: '帧提示词生成任务已创建，正在后台处理...',
        });
      } catch (err) {
        log.error('storyboards frame-prompt', { error: err.message });
        if (err.message && (err.message.includes('分镜不存在') || err.message.includes('不支持的'))) {
          return response.badRequest(res, err.message);
        }
        response.internalError(res, err.message);
      }
    },
    framePromptsGet: (req, res) => {
      try {
        const list = framePromptService.getFramePrompts(db, req.params.id);
        response.success(res, { frame_prompts: list });
      } catch (err) {
        log.error('storyboards frame-prompts', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    framePromptSave: (req, res) => {
      try {
        const frameType = req.params.frame_type;
        const validTypes = ['first', 'key', 'last', 'panel', 'action'];
        if (!validTypes.includes(frameType)) {
          return response.badRequest(res, '不支持的 frame_type');
        }
        const body = req.body || {};
        const prompt = typeof body.prompt === 'string' ? body.prompt : '';
        const description = typeof body.description === 'string' ? body.description : null;
        const layout = typeof body.layout === 'string' ? body.layout : null;
        if (!prompt.trim()) {
          return response.badRequest(res, 'prompt 不能为空');
        }
        framePromptService.saveFramePrompt(db, log, req.params.id, frameType, prompt, description, layout);
        response.success(res, { message: '保存成功', frame_type: frameType });
      } catch (err) {
        log.error('storyboards frame-prompt-save', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    regenerateLayoutDescription: async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!id) return response.badRequest(res, '缺少分镜 id');
        const newLayout = await framePromptService.regenerateLayoutDescription(db, log, id);
        response.success(res, {
          layout_description: newLayout,
          message: '布局描述已由 AI 重新生成并保存',
        });
      } catch (err) {
        log.error('storyboards regenerateLayoutDescription', { error: err.message, id: req.params.id });
        response.internalError(res, err.message || '重新生成布局描述失败');
      }
    },
    rebuildVideoPrompt: (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!id) return response.badRequest(res, '缺少分镜 id');
        const sb = episodeStoryboardService.rebuildVideoPromptForStoryboard(db, log, id);
        if (!sb) return response.notFound(res, '分镜不存在');
        response.success(res, {
          ...sb,
          message: '视频提示词已按最新规则重建并保存',
        });
      } catch (err) {
        log.error('storyboards rebuildVideoPrompt', { error: err.message, id: req.params.id });
        response.internalError(res, err.message || '重建视频提示词失败');
      }
    },
    splitByAudio: (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!id) return response.badRequest(res, '缺少分镜 id');
        const result = episodeStoryboardService.splitStoryboardByAudio(db, log, id);
        response.success(res, {
          ...result,
          message: `已拆成 ${result.storyboard_ids.length} 条分镜（新增 ${result.created_count} 条）`,
        });
      } catch (err) {
        log.error('storyboards splitByAudio', { error: err.message, id: req.params.id });
        response.badRequest(res, err.message || '拆镜失败');
      }
    },
    episodeStoryboardsGenerate: (req, res) => {
      try {
        const taskId = episodeStoryboardService.generateStoryboard(
          db,
          log,
          req.params.episode_id,
          req.query.model,
          req.query.style,
          undefined,
          undefined,
          undefined,
          req.query.language || 'zh',
          undefined,
          undefined,
          undefined,
          req.user
        );
        response.success(res, { task_id: taskId, status: 'pending', message: '分镜头生成任务已创建，正在后台处理...' });
      } catch (err) {
        log.error('episode storyboards generate', { error: err.message });
        response.internalError(res, err.message);
      }
    },
    episodeStoryboardsGet: (req, res) => {
      try {
        const list = episodeStoryboardService.getStoryboardsForEpisode(db, req.params.episode_id);
        response.success(res, { storyboards: list, total: list.length });
      } catch (err) {
        log.error('episode storyboards get', { error: err.message });
        response.internalError(res, err.message);
      }
    },

    // 独立触发单条分镜的 image prompt 优化，结果保存到 storyboards.polished_prompt 并返回
    polishPrompt: async (req, res) => {
      try {
        const sbId = Number(req.params.id);
        const sb = db.prepare(
          'SELECT id, episode_id, storyboard_number, image_prompt, action, dialogue, result, atmosphere, shot_type FROM storyboards WHERE id = ? AND deleted_at IS NULL'
        ).get(sbId);
        if (!sb) return response.notFound(res, '分镜不存在');
        if (!sb.image_prompt && !sb.action && !sb.dialogue) {
          return response.badRequest(res, '该分镜暂无可优化的内容（image_prompt / action / dialogue 均为空）');
        }

        // 通过 episode 查 drama_id
        let dramaId = null;
        try {
          const ep = db.prepare('SELECT drama_id FROM episodes WHERE id = ? AND deleted_at IS NULL').get(sb.episode_id);
          dramaId = ep?.drama_id ?? null;
        } catch (_) {}

        // 画风：mergeCfgStyleWithDrama 会把 dramas.style 的 value（如 cartoon）展开为完整提示词，与图生一致
        let styleZh = '';
        let styleEn = '';
        try {
          const loadConfig = require('../config').loadConfig;
          const { mergeCfgStyleWithDrama } = require('../utils/dramaStyleMerge');
          let cfg = loadConfig();
          const dr = dramaId
            ? db.prepare('SELECT style, metadata FROM dramas WHERE id = ? AND deleted_at IS NULL').get(dramaId)
            : null;
          cfg = mergeCfgStyleWithDrama(cfg, dr || {});
          styleEn = (cfg?.style?.default_style_en || cfg?.style?.default_style || '').trim();
          styleZh = (cfg?.style?.default_style_zh || '').trim();
        } catch (_) {}
        const styleForTokens =
          styleEn ||
          styleZh ||
          'cinematic movie still, anamorphic lens, film grain, dramatic lighting, shallow depth of field, professional cinematography';
        const styleBlockLines = [];
        if (styleZh) styleBlockLines.push(`【画风·最高优先级】${styleZh}`);
        if (styleEn && styleEn !== styleZh) styleBlockLines.push(`MANDATORY ART STYLE: ${styleEn}.`);
        else if (styleEn && !styleZh) styleBlockLines.push(`MANDATORY ART STYLE: ${styleEn}.`);
        else if (!styleZh && !styleEn) styleBlockLines.push(`MANDATORY ART STYLE: ${styleForTokens}.`);

        // 获取前后镜头上下文（含上一镜头连戏状态快照）
        let prevDesc = '(first shot)';
        let nextDesc = '(last shot)';
        let prevContinuityState = null;
        if (sb.episode_id != null && sb.storyboard_number != null) {
          const prevShot = db.prepare(
            'SELECT action, location, time, continuity_snapshot FROM storyboards WHERE episode_id = ? AND storyboard_number < ? AND deleted_at IS NULL ORDER BY storyboard_number DESC LIMIT 1'
          ).get(sb.episode_id, sb.storyboard_number);
          const nextShot = db.prepare(
            'SELECT action, location, time FROM storyboards WHERE episode_id = ? AND storyboard_number > ? AND deleted_at IS NULL ORDER BY storyboard_number ASC LIMIT 1'
          ).get(sb.episode_id, sb.storyboard_number);
          if (prevShot) {
            prevDesc = (prevShot.action || [prevShot.location, prevShot.time].filter(Boolean).join(' ')).slice(0, 120).trim() || '(first shot)';
            if (prevShot.continuity_snapshot) {
              try { prevContinuityState = JSON.parse(prevShot.continuity_snapshot); } catch (_) {}
            }
          }
          if (nextShot) nextDesc = (nextShot.action || [nextShot.location, nextShot.time].filter(Boolean).join(' ')).slice(0, 120).trim() || '(last shot)';
        }

        // 获取该分镜实际关联的角色名（优先 storyboards.characters JSON，其次 storyboard_characters 表）
        let assetNames = '';
        try {
          const nameSet = new Set();
          // 来源1：storyboards.characters JSON（[{id,name}] 或 [id, ...]）
          const sbFull = db.prepare('SELECT characters FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(sbId);
          if (sbFull?.characters) {
            const parsed = JSON.parse(sbFull.characters);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                const cid = typeof item === 'object' && item != null ? item.id : item;
                const c = db.prepare('SELECT name FROM characters WHERE id = ? AND deleted_at IS NULL').get(Number(cid));
                if (c?.name) nameSet.add(c.name);
              }
            }
          }
          // 来源2：storyboard_characters 关联表（character_libraries）
          const libLinks = db.prepare('SELECT character_id FROM storyboard_characters WHERE storyboard_id = ?').all(sbId);
          for (const link of libLinks) {
            const lib = db.prepare('SELECT name FROM character_libraries WHERE id = ? AND deleted_at IS NULL').get(link.character_id);
            if (lib?.name) nameSet.add(lib.name);
          }
          assetNames = [...nameSet].join(', ');
        } catch (_) {}

        const userPromptLines = [
          ...styleBlockLines,
          sb.image_prompt  ? `PROMPT: ${sb.image_prompt}`    : null,
          sb.action        ? `ACTION: ${sb.action}`          : null,
          sb.dialogue      ? `DIALOGUE: ${sb.dialogue}`      : null,
          sb.result        ? `RESULT: ${sb.result}`          : null,
          sb.atmosphere    ? `ATMOSPHERE: ${sb.atmosphere}`  : null,
          sb.shot_type     ? `SHOT_TYPE: ${sb.shot_type}`    : null,
          `STYLE_TOKENS (repeat in output): ${styleForTokens}`,
          `ASSETS: ${assetNames || 'none'}`,
          prevContinuityState ? `PREV_CONTINUITY_STATE: ${JSON.stringify(prevContinuityState)}` : null,
          `CONTEXT_PREV: ${prevDesc}`,
          `CONTEXT_NEXT: ${nextDesc}`,
          `REMINDER: Output a STATIC SINGLE-FRAME image prompt only. No camera motion, no transitions, no split panels.`,
        ].filter(Boolean);

        const polishedPrompt = await aiClient.generateText(
          db, log, 'text', userPromptLines.join('\n'), promptI18n.getImagePolishPrompt(),
          { scene_key: 'image_polish', max_tokens: 300, temperature: 0.3 }
        );

        if (!polishedPrompt || polishedPrompt.trim().length < 10) {
          return response.badRequest(res, 'AI 返回内容过短，请检查文本模型配置');
        }

        const polished = polishedPrompt.trim();
        const nowIso = new Date().toISOString();
        db.prepare('UPDATE storyboards SET polished_prompt = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
          polished, nowIso, sbId
        );
        log.info('[分镜] polishPrompt 完成', { id: sbId, len: polished.length, has_prev_continuity: !!prevContinuityState });

        // 异步提取连戏状态快照并保存（不阻塞响应）
        const snapshotPrompt = promptI18n.getContinuitySnapshotPrompt();
        const snapshotUserPrompt = [`PROMPT: ${polished}`, `ASSETS: ${assetNames || 'none'}`].join('\n');
        aiClient.generateText(db, log, 'text', snapshotUserPrompt, snapshotPrompt, {
          scene_key: 'image_polish', max_tokens: 200, temperature: 0.1,
        }).then((snapshotJson) => {
          if (!snapshotJson?.trim()) return;
          const cleaned = snapshotJson.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
          try {
            JSON.parse(cleaned);
            db.prepare('UPDATE storyboards SET continuity_snapshot = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
              cleaned, new Date().toISOString(), sbId
            );
            log.info('[分镜] polishPrompt 连戏快照已保存', { id: sbId });
          } catch (_) {}
        }).catch(() => {});

        response.success(res, { polished_prompt: polished });
      } catch (err) {
        log.error('storyboards polishPrompt', { error: err.message });
        response.internalError(res, err.message);
      }
    },

    /** 全能模式：根据分镜字段 AI 生成 universal_segment_text（含运镜/机位等专业描述） */
    generateUniversalSegmentPrompt: async (req, res) => {
      try {
        const sbId = Number(req.params.id);
        const built = buildUniversalSegmentUserPromptBundle(db, sbId, req.body || {}, {});
        if (!built.ok) {
          if (built.code === 'not_found') return response.notFound(res, built.message);
          return response.badRequest(res, built.message);
        }
        const { userPrompt, durationLabel, durationSec } = built;
        const out = await aiClient.generateText(
          db,
          log,
          'text',
          userPrompt,
          promptI18n.getUniversalOmniSegmentPrompt(),
          { scene_key: 'image_polish', max_tokens: 2400, temperature: 0.28 }
        );
        if (!out || String(out).trim().length < 20) {
          return response.badRequest(res, 'AI 返回内容过短，请检查文本模型配置');
        }
        let text = String(out).trim();
        text = normalizeUniversalSegmentShotDurations(text, durationLabel, durationSec);
        text = normalizeUniversalSegmentAtImageSpacing(text);
        const nowIso = new Date().toISOString();
        db.prepare('UPDATE storyboards SET universal_segment_text = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
          text,
          nowIso,
          sbId
        );
        log.info('[分镜] generateUniversalSegmentPrompt 完成', { id: sbId, len: text.length, duration_sec: durationSec });
        response.success(res, { universal_segment_text: text });
      } catch (err) {
        log.error('storyboards generateUniversalSegmentPrompt', { error: err.message });
        response.internalError(res, err.message);
      }
    },

    /** 全能模式：与 generateUniversalSegmentPrompt 相同逻辑，NDJSON 流式（delta + done） */
    generateUniversalSegmentStream: async (req, res) => {
      const sbId = Number(req.params.id);
      const built = buildUniversalSegmentUserPromptBundle(db, sbId, req.body || {}, {});
      if (!built.ok) {
        if (built.code === 'not_found') return response.notFound(res, built.message);
        return response.badRequest(res, built.message);
      }
      const { userPrompt, durationLabel, durationSec } = built;

      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const writeNd = (obj) => {
        res.write(`${JSON.stringify(obj)}\n`);
      };

      let finalRaw = '';
      try {
        finalRaw = await aiClient.streamGenerateText(
          db,
          log,
          'text',
          userPrompt,
          promptI18n.getUniversalOmniSegmentPrompt(),
          {
            scene_key: 'image_polish',
            max_tokens: 2400,
            temperature: 0.28,
            silence_timeout_ms: 180000,
          },
          (delta) => writeNd({ type: 'delta', text: delta })
        );
      } catch (err) {
        log.error('storyboards generateUniversalSegmentStream', { error: err.message, id: sbId });
        writeNd({ type: 'error', message: err.message || 'stream failed' });
        return res.end();
      }

      if (!finalRaw || String(finalRaw).trim().length < 20) {
        writeNd({ type: 'error', message: 'AI 返回内容过短，请检查文本模型配置' });
        return res.end();
      }
      let text = String(finalRaw).trim();
      text = normalizeUniversalSegmentShotDurations(text, durationLabel, durationSec);
      text = normalizeUniversalSegmentAtImageSpacing(text);
      const nowIso = new Date().toISOString();
      db.prepare('UPDATE storyboards SET universal_segment_text = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
        text,
        nowIso,
        sbId
      );
      log.info('[分镜] generateUniversalSegmentStream 完成', { id: sbId, len: text.length, duration_sec: durationSec });
      writeNd({ type: 'done', universal_segment_text: text });
      res.end();
    },

    /**
     * 全能片段润色：结合整集剧本与邻镜全能/分镜字段，流式返回 NDJSON（delta + done）。
     * body.draft_universal_segment_text 必填（与编辑器一致，可为未保存到 DB 的当前文本）
     */
    polishUniversalSegmentStream: async (req, res) => {
      const sbId = Number(req.params.id);
      const draftRaw =
        req.body && req.body.draft_universal_segment_text != null
          ? String(req.body.draft_universal_segment_text)
          : '';
      const draft = draftRaw.trim();
      if (!draft) {
        return response.badRequest(res, '请先填写或生成全能片段描述后再润色（编辑器内容不能为空）');
      }
      const built = buildUniversalSegmentUserPromptBundle(db, sbId, req.body || {}, {
        universalSegmentOverride: draftRaw,
      });
      if (!built.ok) {
        if (built.code === 'not_found') return response.notFound(res, built.message);
        return response.badRequest(res, built.message);
      }
      const { userPrompt: baseUser, durationLabel, durationSec, episodeId, storyboardNumber } = built;

      let scriptText = '';
      try {
        const ep = db
          .prepare('SELECT script_content, title FROM episodes WHERE id = ? AND deleted_at IS NULL')
          .get(episodeId);
        scriptText = (ep?.script_content && String(ep.script_content).trim()) || '';
      } catch (_) {}

      let prevRow = null;
      let nextRow = null;
      try {
        prevRow = db
          .prepare(
            `SELECT storyboard_number, title, description, action, dialogue, narration, video_prompt, universal_segment_text
             FROM storyboards WHERE episode_id = ? AND storyboard_number < ? AND deleted_at IS NULL
             ORDER BY storyboard_number DESC LIMIT 1`
          )
          .get(episodeId, storyboardNumber);
        nextRow = db
          .prepare(
            `SELECT storyboard_number, title, description, action, dialogue, narration, video_prompt, universal_segment_text
             FROM storyboards WHERE episode_id = ? AND storyboard_number > ? AND deleted_at IS NULL
             ORDER BY storyboard_number ASC LIMIT 1`
          )
          .get(episodeId, storyboardNumber);
      } catch (_) {}

      const polishPassStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const polishUserPrompt = [
        'TASK: POLISH_UNIVERSAL_OMNI_SEGMENT',
        `POLISH_PASS_STAMP: ${polishPassStamp}`,
        'POLISH_REFRESH（多次点击「润色」时强制）: 在严格遵守 MULTI_BEAT_OUTPUT、子分镜秒数之和=TOTAL_CLIP_SECONDS、IMAGE_SLOT_MAP、不编造剧本外情节的前提下，**本轮输出须与 CURRENT_OMNI_DRAFT 在中文表述上有明显差异**（换动词/语序、合并或拆分从句、加强或收紧运镜与情绪描写均可；**第3行仍须与 LINE3_REQUIRED 完全一致**）。除第3行外，**禁止**与草稿逐字相同或仅标点差异；若 M 与秒数分配不变，子分镜正文也须重写措辞。',
        'DIALOGUE_RETENTION（硬性，与 system 全能润色一致）: BASE_OMNI_CONTRACT 内 STORYBOARD FIELDS 的 DIALOGUE、NARRATION、VIDEO_PROMPT 及 CURRENT_OMNI_DRAFT 中一切对白/旁白/引号句，成稿各「分镜k」行须**逐条以「」或明确旁白写出**，保留笑点、数字、剧名、奖项名等关键信息；禁止用「两人对话」「念词带过」等概括替代具体台词。总秒数与各 Tk 不变前提下提高信息密度：台词与反应优先，少写无推进的纯氛围叠句。',
        'You are refining the CURRENT omni multi-beat prompt for a short drama vertical-video shot.',
        `FULL_EPISODE_SCRIPT（本集完整剧本，用于信息对齐与连戏；不得引入剧本未写的情节）:\n${scriptText || '(本集剧本正文为空，请仅依据下方 STORYBOARD FIELDS 与邻镜信息)'}`,
        '',
        'NEIGHBOR_PREV（上一分镜：含其全能片段与其它提示词字段，供衔接）:',
        formatNeighborShotPolishContext(prevRow),
        '',
        'NEIGHBOR_NEXT（下一分镜）:',
        formatNeighborShotPolishContext(nextRow),
        '',
        'CURRENT_OMNI_DRAFT（用户当前全能片段文本，必须在此基础上增强而非另起无关故事）:',
        draft,
        '',
        '--- BASE_OMNI_CONTRACT（与生成接口相同的约束与分镜字段块）---',
        baseUser,
      ].join('\n');

      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const writeNd = (obj) => {
        res.write(`${JSON.stringify(obj)}\n`);
      };

      let finalRaw = '';
      try {
        finalRaw = await aiClient.streamGenerateText(
          db,
          log,
          'text',
          polishUserPrompt,
          promptI18n.getUniversalOmniPolishPrompt(),
          {
            scene_key: 'image_polish',
            max_tokens: 4096,
            temperature: 0.52,
            silence_timeout_ms: 180000,
          },
          (delta) => writeNd({ type: 'delta', text: delta })
        );
      } catch (err) {
        log.error('storyboards polishUniversalSegmentStream', { error: err.message, id: sbId });
        writeNd({ type: 'error', message: err.message || 'stream failed' });
        return res.end();
      }

      if (!finalRaw || String(finalRaw).trim().length < 20) {
        writeNd({ type: 'error', message: 'AI 返回内容过短，请检查文本模型配置' });
        return res.end();
      }
      let text = String(finalRaw).trim();
      text = normalizeUniversalSegmentShotDurations(text, durationLabel, durationSec);
      text = normalizeUniversalSegmentAtImageSpacing(text);
      const nowIso = new Date().toISOString();
      db.prepare('UPDATE storyboards SET universal_segment_text = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
        text,
        nowIso,
        sbId
      );
      log.info('[分镜] polishUniversalSegmentStream 完成', { id: sbId, len: text.length, duration_sec: durationSec });
      writeNd({ type: 'done', universal_segment_text: text });
      res.end();
    },

    /**
     * 经典分镜：结合剧本与邻镜流式润色 video_prompt（NDJSON delta + done）。
     * body.draft_video_prompt 可选，为当前编辑区全文；缺省则用库内 video_prompt，再不行则用字段自动拼装。
     */
    polishClassicVideoPromptStream: async (req, res) => {
      const sbId = Number(req.params.id);
      const sbRow = db.prepare('SELECT * FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(sbId);
      if (!sbRow) return response.notFound(res, '分镜不存在');
      const mode = sbRow.creation_mode === 'universal' ? 'universal' : 'classic';
      if (mode === 'universal') {
        return response.badRequest(res, '当前为全能模式，请使用「润色全能提示词」');
      }

      let dramaId = null;
      try {
        const ep0 = db.prepare('SELECT drama_id FROM episodes WHERE id = ? AND deleted_at IS NULL').get(sbRow.episode_id);
        dramaId = ep0?.drama_id ?? null;
      } catch (_) {}

      let styleEn = '';
      let styleZh = '';
      let videoRatio = '9:16';
      try {
        const loadConfig = require('../config').loadConfig;
        const { mergeCfgStyleWithDrama } = require('../utils/dramaStyleMerge');
        let cfg = loadConfig();
        const dr = dramaId
          ? db.prepare('SELECT style, metadata FROM dramas WHERE id = ? AND deleted_at IS NULL').get(dramaId)
          : null;
        cfg = mergeCfgStyleWithDrama(cfg, dr || {});
        styleEn = (cfg?.style?.default_style_en || cfg?.style?.default_style || '').trim();
        styleZh = (cfg?.style?.default_style_zh || '').trim();
        try {
          const meta = dr?.metadata ? JSON.parse(dr.metadata) : {};
          if (meta?.aspect_ratio && String(meta.aspect_ratio).trim()) {
            videoRatio = String(meta.aspect_ratio).trim().replace(/\uFF1A/g, ':');
          }
        } catch (_) {}
      } catch (_) {}

      const autoComposed = episodeStoryboardService.composeStoryboardVideoPrompt(sbRow, styleEn || styleZh, videoRatio);
      const draftRaw =
        req.body && req.body.draft_video_prompt != null ? String(req.body.draft_video_prompt) : '';
      const draftTrim = draftRaw.trim();
      const dbVp = sbRow.video_prompt != null ? String(sbRow.video_prompt).trim() : '';
      const currentDraft = draftTrim || dbVp;
      const anchor = currentDraft || String(autoComposed || '').trim();
      if (!anchor || anchor.length < 4) {
        return response.badRequest(res, '请先填写分镜的动作/对白/场景等字段，或手写视频提示词后再润色');
      }

      let scriptText = '';
      try {
        const ep = db
          .prepare('SELECT script_content FROM episodes WHERE id = ? AND deleted_at IS NULL')
          .get(sbRow.episode_id);
        scriptText = (ep?.script_content && String(ep.script_content).trim()) || '';
      } catch (_) {}

      let prevRow = null;
      let nextRow = null;
      try {
        const num = sbRow.storyboard_number;
        const eid = sbRow.episode_id;
        prevRow = db
          .prepare(
            `SELECT storyboard_number, title, description, action, dialogue, narration, video_prompt, universal_segment_text
             FROM storyboards WHERE episode_id = ? AND storyboard_number < ? AND deleted_at IS NULL
             ORDER BY storyboard_number DESC LIMIT 1`
          )
          .get(eid, num);
        nextRow = db
          .prepare(
            `SELECT storyboard_number, title, description, action, dialogue, narration, video_prompt, universal_segment_text
             FROM storyboards WHERE episode_id = ? AND storyboard_number > ? AND deleted_at IS NULL
             ORDER BY storyboard_number ASC LIMIT 1`
          )
          .get(eid, num);
      } catch (_) {}

      let dramaTitle = '';
      let episodeTitle = '';
      let shotTotalInEpisode = 0;
      try {
        if (dramaId) {
          const drT = db.prepare('SELECT title FROM dramas WHERE id = ? AND deleted_at IS NULL').get(dramaId);
          dramaTitle = drT?.title != null ? String(drT.title).trim() : '';
        }
        const epT = db
          .prepare('SELECT title FROM episodes WHERE id = ? AND deleted_at IS NULL')
          .get(sbRow.episode_id);
        episodeTitle = epT?.title != null ? String(epT.title).trim() : '';
        const cnt = db
          .prepare(
            'SELECT COUNT(*) AS n FROM storyboards WHERE episode_id = ? AND deleted_at IS NULL'
          )
          .get(sbRow.episode_id);
        shotTotalInEpisode = cnt?.n != null ? Number(cnt.n) : 0;
      } catch (_) {}

      const firstFrameAnchor = clipClassicCtx(
        (sbRow.polished_prompt && String(sbRow.polished_prompt).trim()) ||
          (sbRow.image_prompt && String(sbRow.image_prompt).trim()) ||
          '',
        980
      );

      let linkedSceneText = '';
      try {
        if (sbRow.scene_id) {
          const sc = db
            .prepare(
              'SELECT location, time, prompt FROM scenes WHERE id = ? AND deleted_at IS NULL'
            )
            .get(sbRow.scene_id);
          if (sc) {
            const bits = [sc.location, sc.time].filter((x) => x != null && String(x).trim());
            const head = bits.join('，');
            const pr = sc.prompt != null ? String(sc.prompt).trim() : '';
            linkedSceneText = [head, pr ? `场景库文案摘要：${clipClassicCtx(pr, 280)}` : '']
              .filter(Boolean)
              .join('；');
          }
        }
      } catch (_) {}

      const fieldLines = [
        ['SHOT_NUM', sbRow.storyboard_number],
        ['TITLE', sbRow.title],
        ['DESCRIPTION', sbRow.description],
        ['LOCATION', sbRow.location],
        ['TIME', sbRow.time],
        ['DURATION_SEC', sbRow.duration],
        ['ACTION', sbRow.action],
        ['DIALOGUE', sbRow.dialogue],
        ['NARRATION', sbRow.narration],
        ['RESULT', sbRow.result],
        ['ATMOSPHERE', sbRow.atmosphere],
        ['EMOTION', sbRow.emotion],
        ['EMOTION_INTENSITY', sbRow.emotion_intensity],
        ['SHOT_TYPE', sbRow.shot_type],
        ['ANGLE_H', sbRow.angle_h],
        ['ANGLE_V', sbRow.angle_v],
        ['ANGLE_S', sbRow.angle_s],
        ['ANGLE_LEGACY', sbRow.angle],
        ['MOVEMENT', sbRow.movement],
        ['LIGHTING_STYLE', sbRow.lighting_style],
        ['DEPTH_OF_FIELD', sbRow.depth_of_field],
        ['SEGMENT_INDEX', sbRow.segment_index],
        ['SEGMENT_TITLE', sbRow.segment_title],
        ['IMAGE_PROMPT', sbRow.image_prompt],
        ['POLISHED_IMAGE_PROMPT', sbRow.polished_prompt],
      ]
        .map(([k, v]) => {
          if (v == null || v === '') return null;
          const s = String(v).trim();
          return s ? `${k}: ${s}` : null;
        })
        .filter(Boolean)
        .join('\n');

      const retentionClauses = extractRetentionClausesFromVideoPrompts(
        currentDraft || '',
        String(autoComposed || '').trim()
      );

      const polishPassStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const polishUserPrompt = [
        'TASK: POLISH_CLASSIC_STORYBOARD_STILL_TO_VIDEO_PROMPT',
        `POLISH_PASS_STAMP: ${polishPassStamp}`,
        'POLISH_REFRESH: 用户可多次润色；事实与时长不变，但须明显换表述；禁止与 CURRENT_VIDEO_DRAFT 仅标点或个别虚词差异。',
        'OUTPUT_GOAL: 单段、可直接送图生视频模型的专业提示词；首帧画面已由参考图锁定，文案负责动效、节奏、运镜意图、声画暗示与画风气质。',
        '',
        `PROJECT:\nDRAMA_TITLE: ${dramaTitle || '(unknown)'}\nEPISODE_TITLE: ${episodeTitle || '(unknown)'}`,
        `SHOT_SEQUENCE: 当前镜号 ${sbRow.storyboard_number ?? '?'} / 本集共 ${shotTotalInEpisode || '?'} 镜`,
        `VIDEO_RATIO: ${videoRatio}`,
        '',
        `FULL_EPISODE_SCRIPT（用于人物关系、因果与语气；勿编造剧本未出现的情节）:\n${scriptText || '(本集剧本正文为空)'}`,
        '',
        'NEIGHBOR_PREV（上一镜：用于入戏衔接、情绪与空间连贯）:',
        formatClassicVideoNeighborBlock('PREV', prevRow),
        '',
        'NEIGHBOR_NEXT（下一镜：用于本镜收束与出口暗示，勿剧透下一镜未发生的具体事件）:',
        formatClassicVideoNeighborBlock('NEXT', nextRow),
        '',
        'STORYBOARD_FIELDS（当前镜结构化事实）:',
        fieldLines || '(empty)',
        '',
        'REQUIRED_COVERAGE_DIGEST（下列凡出现「- 维度：」行的，润色成稿必须全部体现其语义；可与邻镜/剧本融合叙述，禁止省略事实、禁止改对白原意、禁止改时长秒数）:',
        buildClassicRequiredCoverageDigest(sbRow, linkedSceneText),
        '',
        `FIRST_FRAME_VISUAL_ANCHOR（分镜参考静帧对应的英文/中文图提示摘要；动效须与此一致，禁止改换装、改人脸特征、改场景时代）:\n${
          firstFrameAnchor || '(无图侧文本；仅依据 STORYBOARD_FIELDS 与剧本推断画面)'
        }`,
        '',
        `AUTO_COMPOSED_VIDEO_PROMPT（与程序字段拼装一致，作事实底线）:\n${autoComposed}`,
        '',
        `CURRENT_VIDEO_DRAFT（用户当前 video_prompt，优先在其上润色）:\n${currentDraft || '(empty — use AUTO_COMPOSED + FIELDS)'}`,
        '',
        'RETENTION_CLAUSES_FROM_SOURCE（由 CURRENT_VIDEO_DRAFT / AUTO_COMPOSED 按句号拆出的「标签分句」；每一条中的**全部信息点**须在成稿中出现——含：配乐侧写、音效层次、情绪强度数值、括号内**完整**英文镜头/景深/透视描述、=VideoRatio 画幅；允许调整语序与衔接词，**禁止**把多条合并后只剩笼统氛围描写而导致某类信息消失）:',
        retentionClauses.length
          ? retentionClauses.map((c, i) => `${i + 1}. ${c}`).join('\n')
          : '(未解析到「场景：/配乐：/镜头角度：/=VideoRatio:」等标签分句；此时须把 CURRENT_VIDEO_DRAFT 全文信息等价写入成稿，禁止删减子句类别。)',
        '',
        `VISUAL_STYLE（须内化进成稿；中文气质描写 + 英文质感词均可）:\nSTYLE_ZH: ${styleZh || '(none)'}\nSTYLE_EN: ${styleEn || '(none)'}`,
      ].join('\n');

      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const writeNd = (obj) => {
        res.write(`${JSON.stringify(obj)}\n`);
      };

      let finalRaw = '';
      try {
        finalRaw = await aiClient.streamGenerateText(
          db,
          log,
          'text',
          polishUserPrompt,
          promptI18n.getClassicVideoPromptPolishPrompt(),
          {
            scene_key: 'image_polish',
            max_tokens: 3600,
            temperature: 0.28,
            silence_timeout_ms: 180000,
          },
          (delta) => writeNd({ type: 'delta', text: delta })
        );
      } catch (err) {
        log.error('storyboards polishClassicVideoPromptStream', { error: err.message, id: sbId });
        writeNd({ type: 'error', message: err.message || 'stream failed' });
        return res.end();
      }

      if (!finalRaw || String(finalRaw).trim().length < 12) {
        writeNd({ type: 'error', message: 'AI 返回内容过短，请检查文本模型配置' });
        return res.end();
      }
      const text = String(finalRaw).trim();
      const nowIso = new Date().toISOString();
      db.prepare('UPDATE storyboards SET video_prompt = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(
        text,
        nowIso,
        sbId
      );
      log.info('[分镜] polishClassicVideoPromptStream 完成', { id: sbId, len: text.length });
      writeNd({ type: 'done', video_prompt: text });
      res.end();
    },

    upscale: createStoryboardUpscaleHandler({ db, log }),

    batchInferParams: createStoryboardBatchInferHandler({ db, log }),
  };
}

module.exports = routes;
