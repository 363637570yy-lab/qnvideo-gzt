<template>
      <!-- 6. 分镜生成 -->
      <section v-show="filmWorkbenchTab === 'storyboards'" id="anchor-storyboard" class="section card">
        <StoryboardWorkbenchControls :ctx="$props.ctx" />
        <template v-if="storyboards.length > 0">
          <template v-for="(sb, i) in storyboards" :key="sb.id">
            <!-- 段落分隔标头：segment_title 存在且是新段落的第一个镜头时显示 -->
            <div
              v-if="sb.segment_title && (i === 0 || sb.segment_index !== storyboards[i - 1].segment_index)"
              class="segment-header"
            >
              <div class="segment-header-inner">
                <span class="segment-index-badge">第 {{ (sb.segment_index ?? 0) + 1 }} 幕</span>
                <span class="segment-title-text">{{ sb.segment_title }}</span>
                <span class="segment-shot-range">
                  镜头 {{ i + 1 }}–{{ (() => {
                    let end = i
                    while (end + 1 < storyboards.length && storyboards[end + 1].segment_index === sb.segment_index) end++
                    return end + 1
                  })() }}
                </span>
              </div>
            </div>
          <!-- 分镜控制栏（卡片外，缩进表示属于当前幕） -->
          <div class="sb-ctrl-bar">
            <span class="sb-ctrl-num">{{ i + 1 }}</span>
            <span class="sb-ctrl-title">{{ sb.title || '未命名分镜' }}</span>
            <el-tag v-if="sb.movement" size="small" effect="plain" type="info" class="sb-movement-tag">{{ getMovementLabel(sb.movement) }}</el-tag>
            <el-button size="small" plain class="sb-ctrl-btn sb-ctrl-config-btn" @click="onOpenVideoParamsDialog(sb)">⚙ 分镜配置</el-button>
            <el-button
              size="small"
              plain
              class="sb-ctrl-btn sb-ctrl-mode-btn"
              :title="isSbUniversalMode(sb.id) ? '切换为经典分镜（中间显示参考图）' : '切换为全能模式（中间为片段描述，经典字段保留）'"
              @click="onToggleSbUniversalMode(sb)"
            >
              {{ isSbUniversalMode(sb.id) ? '经典分镜' : '全能模式' }}
            </el-button>
            <el-button size="small" plain class="sb-ctrl-btn" title="在本镜头前增加一个分镜" @click="onInsertStoryboardBefore(sb)">＋ 新增</el-button>
            <el-button
              class="sb-ctrl-delete"
              type="danger"
              text
              size="small"
              :title="`删除分镜${i + 1}`"
              @click="onDeleteSingleStoryboard(sb.id)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div :id="'sb-' + sb.id" class="storyboard-row">
            <!-- 左：分镜脚本 -->
            <div class="sb-panel sb-script">
              <div class="sb-script-row sb-script-selects">
                <el-select
                  :model-value="getSbCharacterId(sb.id)"
                  placeholder="选择角色"
                  clearable
                  size="small"
                  class="sb-select"
                  @change="(v) => setSbCharacterId(sb.id, v)"
                >
                  <el-option
                    v-for="c in (characters || [])"
                    :key="String(c.id)"
                    :label="c.name || '未命名'"
                    :value="c.id"
                  />
                  <template v-if="!(characters || []).length" #empty>
                    <span class="sb-select-empty">请先在「角色生成」中添加角色</span>
                  </template>
                </el-select>
                <el-select
                  v-model="sbSceneId[sb.id]"
                  placeholder="选择场景"
                  clearable
                  size="small"
                  class="sb-select"
                  @change="() => onStoryboardSceneChange(sb.id)"
                >
                  <el-option
                    v-for="s in (scenes || [])"
                    :key="s.id"
                    :label="s.location"
                    :value="s.id"
                  />
                </el-select>
                <el-select
                  :model-value="getSbPropId(sb.id)"
                  placeholder="选择物品"
                  clearable
                  size="small"
                  class="sb-select"
                  @change="(v) => setSbPropId(sb.id, v)"
                >
                  <el-option
                    v-for="p in (props || [])"
                    :key="String(p.id)"
                    :label="p.name || '未命名'"
                    :value="p.id"
                  />
                  <template v-if="!(props || []).length" #empty>
                    <span class="sb-select-empty">请先在「道具生成」中添加物品</span>
                  </template>
                </el-select>
              </div>
              <!-- 当前选中：场景 / 角色 / 物品缩略图 -->
              <div v-if="getSbSelectedScene(sb.id) || getSbSelectedCharacters(sb.id).length || getSbSelectedProps(sb.id).length || (characters || []).length" class="sb-selected-thumbs">
                <div v-if="getSbSelectedScene(sb.id)" class="sb-thumb-row">
                  <span class="sb-thumb-label">场景</span>
                  <div class="sb-thumb-list">
                    <div
                      v-for="s in [getSbSelectedScene(sb.id)]"
                      :key="s.id"
                      class="sb-thumb-item sb-thumb-scene"
                      :class="{ 'sb-thumb-clickable': hasAssetImage(s) }"
                      :title="s.location"
                      role="button"
                      @click="hasAssetImage(s) && openImagePreview(assetImageUrl(s))"
                    >
                      <img v-if="hasAssetImage(s)" :src="assetThumbUrl(s, 96)" alt="" loading="lazy" decoding="async" />
                      <span v-else class="sb-thumb-placeholder">{{ (s.location || '')[0] }}</span>
                    </div>
                  </div>
                </div>
                <div v-if="(characters || []).length" class="sb-thumb-row">
                  <span class="sb-thumb-label">角色</span>
                  <div class="sb-thumb-list">
                    <div
                      v-for="c in getSbSelectedCharacters(sb.id)"
                      :key="c.id"
                      class="sb-thumb-item sb-thumb-avatar"
                      :class="{ 'sb-thumb-clickable': hasAssetImage(c) }"
                      :title="c.name"
                      role="button"
                      @click="hasAssetImage(c) && openImagePreview(assetImageUrl(c))"
                    >
                      <img v-if="hasAssetImage(c)" :src="assetThumbUrl(c, 96)" alt="" loading="lazy" decoding="async" />
                      <span v-else class="sb-thumb-placeholder">{{ (c.name || '')[0] }}</span>
                    </div>
                    <el-dropdown trigger="click" @command="(cmd) => onSbAddCharacterCommand(sb.id, cmd)">
                      <div
                        class="sb-thumb-item sb-thumb-avatar sb-thumb-add-char"
                        title="更换角色"
                        role="button"
                        @click.stop
                      >
                        <el-icon><Plus /></el-icon>
                      </div>
                      <template #dropdown>
                        <el-dropdown-menu class="sb-char-add-dropdown">
                          <el-dropdown-item
                            v-for="c in charactersAvailableToAddToSb(sb.id)"
                            :key="c.id"
                            :command="c.id"
                          >
                            {{ c.name || '未命名' }}
                          </el-dropdown-item>
                          <el-dropdown-item v-if="!charactersAvailableToAddToSb(sb.id).length" disabled>
                            无可更换角色
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </div>
                <div v-if="getSbSelectedProps(sb.id).length" class="sb-thumb-row">
                  <span class="sb-thumb-label">物品</span>
                  <div class="sb-thumb-list">
                    <div
                      v-for="p in getSbSelectedProps(sb.id)"
                      :key="p.id"
                      class="sb-thumb-item sb-thumb-prop"
                      :class="{ 'sb-thumb-clickable': hasAssetImage(p) }"
                      :title="p.name"
                      role="button"
                      @click="hasAssetImage(p) && openImagePreview(assetImageUrl(p))"
                    >
                      <img v-if="hasAssetImage(p)" :src="assetThumbUrl(p, 96)" alt="" loading="lazy" decoding="async" />
                      <span v-else class="sb-thumb-placeholder">{{ (p.name || '')[0] }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <!-- 首尾帧模式下隐藏“图片提示词”入口，统一收敛到首/尾帧槽位的“查看提示词” -->
              <div v-if="!storyboardUseFirstLastFrame" class="sb-prompt-label">
                <span class="sb-dot"></span>
                <span>图片提示词</span>
              </div>
              <div v-if="!storyboardUseFirstLastFrame" class="sb-prompt-row">
                <span class="sb-prompt-text">{{ sb.image_prompt || '暂无图片提示词' }}</span>
                <el-button size="small" link type="primary" @click="onOpenSbPromptDialog(sb)">编辑</el-button>
              </div>
              <template v-if="storyboardIncludeNarration || (sbNarration[sb.id] || '').trim() || (sb.narration || '').trim()">
                <div class="sb-prompt-label">
                  <span class="sb-dot"></span>
                  <span>解说旁白</span>
                </div>
                <el-input
                  v-model="sbNarration[sb.id]"
                  type="textarea"
                  :rows="2"
                  placeholder="本镜解说文案（画外音 / 纪录片式旁白，供 TTS 或导出 SRT）"
                  class="sb-narration-input"
                  @blur="() => onSaveSbNarrationField(sb)"
                />
                <div v-if="(sbNarration[sb.id] || sb.narration || '').toString().trim()" class="sb-narration-actions">
                  <el-tooltip content="解说旁白配音（TTS）" placement="top">
                    <el-button size="small" :loading="ttsSbNarrationIds.has(sb.id)" @click="onTtsSbNarration(sb)">
                      解说配音
                    </el-button>
                  </el-tooltip>
                  <el-tooltip v-if="sbNarrationAudioRelPath(sb)" content="播放解说旁白配音" placement="top">
                    <el-button size="small" @click="playSbNarrationTts(sb)">
                      <el-icon><VideoPlay /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </template>
            </div>
            <!-- 中：经典模式=分镜参考图；全能模式=片段描述（独立字段，与参考图并存） -->
            <div class="sb-panel sb-image" :class="{ 'sb-image--universal': isSbUniversalMode(sb.id) }">
              <template v-if="isSbUniversalMode(sb.id)">
                <div class="sb-prompt-label sb-universal-label-row">
                  <div class="sb-universal-label-left">
                    <span class="sb-dot"></span>
                    <span>片段描述</span>
                    <el-tooltip placement="top" :show-after="280" :show-arrow="false" popper-class="sb-universal-tooltip-popper">
                      <template #content>
                        <div class="sb-universal-tooltip">
                          全能生视频链路（<strong>AI 配置 · 视频</strong> 中选接口规范：<code>kling_omni</code> 可灵 Omni，或 <code>volcengine_omni</code> 火山即梦 Seedance 2.0 多图参考；模型如 <code>kling-video-o1</code>、<code>doubao-seedance-2-0-260128</code> 等以控制台为准）：此处为提交主提示词；生视频时还会追加已确认关键帧时间轴、站位合同和辅助稿说明。参考图顺序为：已确认关键帧/首尾帧 → 辅助稿；若关键帧不足 2 张，才补场景、角色、道具兜底（前端最多提交 10 张，火山全能链路当前最多取前 9 张）。请严格按下方 @ 图片槽位使用 <strong>@图片1</strong>、<strong>@图片2</strong>…，勿假设 @图片1 一定是场景或人物。若参考图是<strong>四宫格/多视角拼图</strong>，仅借空间与氛围，须在文案中写明<strong>单镜头完整画幅、禁止分屏宫格</strong>，避免成片模仿拼图布局。全能提示词下拉中「生成」会按<strong>本条分镜总时长</strong>与本集剧本、镜序、邻镜信息，自动决定子分镜数 M（第2行「由以下M个分镜…」），第4行起为「分镜1：T1秒:」…多行，且各段秒数之和等于本镜时长；第3行仍为参考图约束；「生成」与「润色」均为<strong>流式输出</strong>到本框；「润色」在此基础上增强。若本框留空，则退回仅用「视频提示词」。
                        </div>
                      </template>
                      <el-icon class="sb-universal-hint-icon" tabindex="0" role="img" aria-label="片段说明">
                        <QuestionFilled />
                      </el-icon>
                    </el-tooltip>
                  </div>
                  <el-dropdown
                    trigger="click"
                    class="sb-universal-prompt-dd"
                    @command="(cmd) => onUniversalSegmentPromptMenu(sb, cmd)"
                  >
                    <el-button
                      type="primary"
                      link
                      size="small"
                      class="sb-universal-gen-btn"
                      :loading="generatingUniversalSegmentIds.has(sb.id)"
                    >
                      全能提示词
                      <el-icon class="sb-universal-dd-caret"><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="generate">生成全能提示词</el-dropdown-item>
                        <el-dropdown-item command="generate-force">不查图片强制生成</el-dropdown-item>
                        <el-dropdown-item command="polish" :disabled="!sbUniversalSegmentTrimmed(sb)">
                          润色全能提示词
                        </el-dropdown-item>
                        <el-dropdown-item command="polish-force" :disabled="!sbUniversalSegmentTrimmed(sb)">
                          不查图片强制润色
                        </el-dropdown-item>
                        <el-dropdown-item
                          command="to-grok-video-tags"
                          divided
                          :disabled="!sbUniversalSegmentTrimmed(sb)"
                        >
                          改为 grok视频格式
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
                <UniversalSegmentOmniAtEditor
                  v-if="!generatingUniversalSegmentIds.has(sb.id)"
                  v-model="sbUniversalSegmentText[sb.id]"
                  :slots="getSbUniversalOmniRefSlots(sb)"
                  class="sb-universal-textarea"
                  @blur="() => onSaveUniversalSegmentField(sb)"
                />
                <el-input
                  v-else
                  v-model="sbUniversalSegmentText[sb.id]"
                  type="textarea"
                  :rows="10"
                  :autosize="{ minRows: 10, maxRows: 22 }"
                  placeholder="例如：@图片1 承接首帧动作，角色停在门口迟疑；@图片2 延续尾帧状态，镜头缓慢推近…"
                  class="sb-universal-textarea"
                  @blur="() => onSaveUniversalSegmentField(sb)"
                />
              </template>
              <template v-else>
              <div
                class="sb-image-area"
                :class="{
                  'sb-image-area--dragover': dragOverSbId === sb.id,
                  'sb-image-area--has-quad': !storyboardUseFirstLastFrame && getStripItems(sb.id).length > 0,
                  'sb-image-area--first-last': storyboardUseFirstLastFrame,
                }"
                @dragover="onSbImageDragOver($event, sb.id)"
                @dragleave="onSbImageDragLeave($event, sb.id)"
                @drop="onSbImageDrop($event, sb)"
              >
                <!-- 首尾帧双槽 -->
                <template v-if="storyboardUseFirstLastFrame">
                  <div class="sb-fl-dual">
                    <div class="sb-fl-slot">
                      <div class="sb-fl-slot-label">首帧</div>
                      <div class="sb-fl-slot-body">
                        <template v-if="getSbFirstImage(sb.id)">
                          <img
                            :src="assetThumbUrl(getSbFirstImage(sb.id), 640)"
                            class="sb-generated-img"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            @click="openImagePreview(assetImageUrl(getSbFirstImage(sb.id)))"
                          />
                        </template>
                        <template v-else-if="sb.image_url || sb.composed_image">
                          <img
                            :src="thumbImageUrl(sb.composed_image || sb.image_url, 640)"
                            class="sb-generated-img"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            @click="openImagePreview(imageUrl(sb.composed_image || sb.image_url))"
                          />
                        </template>
                        <template v-else>
                          <span class="sb-fl-empty">动作前静止</span>
                        </template>
                        <div v-if="isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id)" class="ai-generating-overlay">
                          <span class="ai-generating-timer">{{ resourceElapsedLabel(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) }}</span>
                          <el-icon class="ai-generating-spinner is-loading"><Loading /></el-icon>
                          <span class="ai-generating-text">生成中...</span>
                        </div>
                      </div>
                      <div v-if="getSbFirstImage(sb.id)?.prompt" class="sb-fl-slot-prompt" :title="getSbFirstImage(sb.id).prompt">
                        {{ getSbFirstImage(sb.id).prompt }}
                      </div>
                      <div class="sb-fl-slot-actions">
                        <el-button
                          :type="isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) ? 'warning' : 'primary'"
                          size="small"
                          @click="isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) ? stopResourceGeneration(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) : onGenerateSbFrameImage(sb, 'first')"
                        >
                          <el-icon v-if="isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id)" class="is-loading"><Loading /></el-icon>
                          {{ isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) ? '停止' : '生成' }}
                        </el-button>
                        <el-tooltip v-if="canUsePrevTailAsFirst(sb)" content="直接使用上一分镜的尾帧图片（高清原图）替换本首帧，画面更清晰" placement="top">
                          <el-button size="small" :loading="usingPrevTailAsFirstIds.has(sb.id)" @click="onUsePrevTailAsFirst(sb)">上镜尾帧</el-button>
                        </el-tooltip>
                        <el-button size="small" :loading="uploadingSbImageSlot(sb.id) === 'first'" @click="onUploadSbImageClick(sb, 'first')">上传</el-button>
                        <el-button type="primary" link size="small" @click="showSbFramePromptPreview(sb, 'first')">查看提示词</el-button>
                      </div>
                    </div>
                    <div class="sb-fl-arrow" aria-hidden="true">→</div>
                    <div class="sb-fl-slot">
                      <div class="sb-fl-slot-label">尾帧</div>
                      <div class="sb-fl-slot-body">
                        <template v-if="getSbLastImage(sb.id)">
                          <img
                            :src="assetThumbUrl(getSbLastImage(sb.id), 640)"
                            class="sb-generated-img"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            :title="getSbLastImage(sb.id).prompt || ''"
                            @click="openImagePreview(assetImageUrl(getSbLastImage(sb.id)))"
                          />
                        </template>
                        <template v-else>
                          <span class="sb-fl-empty">动作后结果</span>
                        </template>
                        <div v-if="isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id)" class="ai-generating-overlay">
                          <span class="ai-generating-timer">{{ resourceElapsedLabel(GEN_RESOURCE.SB_LAST_IMAGE, sb.id) }}</span>
                          <el-icon class="ai-generating-spinner is-loading"><Loading /></el-icon>
                          <span class="ai-generating-text">生成中...</span>
                        </div>
                      </div>
                      <div v-if="getSbLastImage(sb.id)?.prompt" class="sb-fl-slot-prompt" :title="getSbLastImage(sb.id).prompt">
                        {{ getSbLastImage(sb.id).prompt }}
                      </div>
                      <div class="sb-fl-slot-actions">
                        <el-button
                          :type="isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id) ? 'warning' : 'primary'"
                          size="small"
                          @click="isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id) ? stopResourceGeneration(GEN_RESOURCE.SB_LAST_IMAGE, sb.id) : onGenerateSbFrameImage(sb, 'last')"
                        >
                          <el-icon v-if="isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id)" class="is-loading"><Loading /></el-icon>
                          {{ isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id) ? '停止' : '生成' }}
                        </el-button>
                        <el-checkbox
                          v-model="lastFrameUseFirstLayoutLock"
                          class="sb-fl-first-lock-opt"
                          title="勾选时尾帧生成会附带首帧图作构图与左右站位参考；取消后仅使用场景/角色/道具参考，便于调整出场人物"
                          @change="onLastFrameLayoutLockChange"
                        >
                          首帧站位
                        </el-checkbox>
                        <el-button size="small" :loading="uploadingSbImageSlot(sb.id) === 'last'" @click="onUploadSbImageClick(sb, 'last')">上传</el-button>
                        <el-button type="primary" link size="small" @click="showSbFramePromptPreview(sb, 'last')">查看提示词</el-button>
                      </div>
                    </div>
                  </div>
                  <div v-if="getStripItems(sb.id).length" class="sb-imgs-strip">
                    <el-tooltip content="历史图：点击设为首帧或尾帧，左上角放大预览，右上角删除" placement="top" :show-arrow="false">
                      <el-icon class="sb-strip-hint-icon"><InfoFilled /></el-icon>
                    </el-tooltip>
                    <div
                      v-for="item in getStripItems(sb.id)"
                      :key="item.key"
                      class="sb-img-thumb"
                      :title="stripItemTitle(sb.id, item)"
                      @click="onStripItemClick(sb, item)"
                    >
                      <img :src="item.thumbSrc || item.src" alt="" loading="lazy" decoding="async" />
                      <div class="keyframe-state-badges">
                        <span v-if="item.selected" class="keyframe-state-badge keyframe-state-badge--selected">已确认</span>
                        <span v-if="item.locked" class="keyframe-state-badge keyframe-state-badge--locked">锁定</span>
                      </div>
                      <span v-if="item.frameBadge" class="sb-img-thumb-label">{{ item.frameBadge }}</span>
                      <span v-else-if="item.label" class="sb-img-thumb-label">{{ item.label }}</span>
                      <button v-if="!item.aux" class="keyframe-mini-btn keyframe-mini-btn--select" :title="item.selected ? '取消确认' : '确认该格'" @click.stop="onToggleKeyframeSelected(sb, item)">
                        <el-icon :size="10"><Check /></el-icon>
                      </button>
                      <button class="keyframe-mini-btn keyframe-mini-btn--lock" :title="item.locked ? '解锁' : '锁定该格'" @click.stop="onToggleKeyframeLocked(sb, item)">
                        {{ item.locked ? '解' : '锁' }}
                      </button>
                      <button class="keyframe-mini-btn keyframe-mini-btn--regen" title="单格重生" :disabled="item.locked" @click.stop="onRegenerateKeyframeItem(sb, item)">
                        <el-icon :size="10"><Refresh /></el-icon>
                      </button>
                      <button class="thumb-preview-btn" title="放大预览" @click.stop="openImagePreview(item.src)">
                        <el-icon :size="10"><ZoomIn /></el-icon>
                      </button>
                      <button v-if="item.img?.id" class="extra-thumb-remove" title="删除历史图" @click.stop="onRemoveSbHistoryImage(sb.id, item.img.id)">×</button>
                      <div v-if="!item.aux" class="keyframe-desc-mini" :title="item.description">
                        <span>{{ item.description }}</span>
                        <button class="keyframe-desc-edit" title="编辑关键帧描述" @click.stop="onEditKeyframeDescription(sb, item)">文</button>
                      </div>
                    </div>
                  </div>
                </template>
                <!-- 单主图（未勾选首尾帧） -->
                <template v-else>
                <div class="sb-main-image-wrap">
                  <template v-if="getSbImage(sb.id)">
                    <img
                      :src="assetThumbUrl(getSbImage(sb.id), 640)"
                      class="sb-generated-img"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      :title="getSbImage(sb.id).prompt || ''"
                      @click="openImagePreview(assetImageUrl(getSbImage(sb.id)))"
                    />
                    <div v-if="getSbImage(sb.id).prompt" class="sb-main-img-prompt">{{ getSbImage(sb.id).prompt }}</div>
                  </template>
                  <template v-else-if="sb.composed_image || sb.image_url">
                    <img
                      :src="thumbImageUrl(sb.composed_image || sb.image_url, 640)"
                      class="sb-generated-img"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      @click="openImagePreview(imageUrl(sb.composed_image || sb.image_url))"
                    />
                  </template>
                  <template v-else-if="sb.error_msg || sb.errorMsg">
                    <div class="sb-image-error" :title="sb.error_msg || sb.errorMsg">{{ sb.error_msg || sb.errorMsg }}</div>
                    <el-button
                      :type="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? 'warning' : 'primary'"
                      size="small"
                      class="sb-gen-btn"
                      @click="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? stopResourceGeneration(GEN_RESOURCE.SB_IMAGE, sb.id) : onGenerateSbImage(sb)"
                    >
                      <el-icon v-if="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id)" class="is-loading"><Loading /></el-icon>
                      <el-icon v-else><Refresh /></el-icon>
                      {{ isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? '停止' : '重试' }}
                    </el-button>
                    <el-button size="small" :loading="uploadingSbImageId === sb.id" @click="onUploadSbImageClick(sb)">上传</el-button>
                  </template>
                  <template v-else>
                    <el-button
                      :type="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? 'warning' : 'primary'"
                      size="small"
                      class="sb-gen-btn"
                      @click="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? stopResourceGeneration(GEN_RESOURCE.SB_IMAGE, sb.id) : onGenerateSbImage(sb)"
                    >
                      <el-icon v-if="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id)" class="is-loading"><Loading /></el-icon>
                      <el-icon v-else><MagicStick /></el-icon>
                      {{ isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? '停止' : '生成分镜参考图' }}
                    </el-button>
                    <el-button size="small" :loading="uploadingSbImageId === sb.id" @click="onUploadSbImageClick(sb)">上传</el-button>
                  </template>
                  <div v-if="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id)" class="ai-generating-overlay">
                    <span class="ai-generating-timer">{{ resourceElapsedLabel(GEN_RESOURCE.SB_IMAGE, sb.id) }}</span>
                    <el-icon class="ai-generating-spinner is-loading"><Loading /></el-icon>
                    <span class="ai-generating-text">生成中...</span>
                  </div>
                </div>
                <div v-if="getStripItems(sb.id).length" class="sb-imgs-strip">
                  <el-tooltip content="历史图：点击设为主图，左上角放大预览，右上角删除" placement="top" :show-arrow="false">
                    <el-icon class="sb-strip-hint-icon"><InfoFilled /></el-icon>
                  </el-tooltip>
                  <div
                    v-for="item in getStripItems(sb.id)"
                    :key="item.key"
                    class="sb-img-thumb"
                    :title="stripItemTitle(sb.id, item)"
                    @click="onStripItemClick(sb, item)"
                  >
                    <img :src="item.thumbSrc || item.src" alt="" loading="lazy" decoding="async" />
                    <div class="keyframe-state-badges">
                      <span v-if="item.selected" class="keyframe-state-badge keyframe-state-badge--selected">已确认</span>
                      <span v-if="item.locked" class="keyframe-state-badge keyframe-state-badge--locked">锁定</span>
                    </div>
                    <span v-if="item.label" class="sb-img-thumb-label">{{ item.label }}</span>
                    <button v-if="!item.aux" class="keyframe-mini-btn keyframe-mini-btn--select" :title="item.selected ? '取消确认' : '确认该格'" @click.stop="onToggleKeyframeSelected(sb, item)">
                      <el-icon :size="10"><Check /></el-icon>
                    </button>
                    <button class="keyframe-mini-btn keyframe-mini-btn--lock" :title="item.locked ? '解锁' : '锁定该格'" @click.stop="onToggleKeyframeLocked(sb, item)">
                      {{ item.locked ? '解' : '锁' }}
                    </button>
                    <button class="keyframe-mini-btn keyframe-mini-btn--regen" title="单格重生" :disabled="item.locked" @click.stop="onRegenerateKeyframeItem(sb, item)">
                      <el-icon :size="10"><Refresh /></el-icon>
                    </button>
                    <button class="thumb-preview-btn" title="放大预览" @click.stop="openImagePreview(item.src)">
                      <el-icon :size="10"><ZoomIn /></el-icon>
                    </button>
                    <button v-if="item.img?.id" class="extra-thumb-remove" title="删除历史图" @click.stop="onRemoveSbHistoryImage(sb.id, item.img.id)">×</button>
                    <div v-if="!item.aux" class="keyframe-desc-mini" :title="item.description">
                      <span>{{ item.description }}</span>
                      <button class="keyframe-desc-edit" title="编辑关键帧描述" @click.stop="onEditKeyframeDescription(sb, item)">文</button>
                    </div>
                  </div>
                </div>
                </template>
                <div v-if="dragOverSbId === sb.id" class="sb-image-area-drop-hint">松开上传到首帧</div>
              </div>
              <div v-if="hasSbImage(sb) || storyboardUseFirstLastFrame" class="sb-image-actions">
                <template v-if="storyboardUseFirstLastFrame">
                  <el-button
                    size="small"
                    :type="(isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) || isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id)) ? 'warning' : 'default'"
                    @click="(isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) || isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id)) ? stopSbFramePair(sb) : onGenerateSbFramePair(sb)"
                  >
                    <el-icon v-if="isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) || isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id)" class="is-loading"><Loading /></el-icon>
                    {{ (isResourceGenerating(GEN_RESOURCE.SB_FIRST_IMAGE, sb.id) || isResourceGenerating(GEN_RESOURCE.SB_LAST_IMAGE, sb.id)) ? '停止' : (hasSbFirstLastPair(sb) ? '重新生成首尾帧' : '一键生成首尾帧') }}
                  </el-button>
                  <el-tooltip content="高清放大仅作用于首帧" placement="top">
                    <el-button size="small" :loading="upscalingSbIds.has(sb.id)" :disabled="!getSbLocalImage(sb)" @click="onUpscaleSbImage(sb)">
                      <el-icon><ZoomIn /></el-icon>超分(首帧)
                    </el-button>
                  </el-tooltip>
                  <el-dropdown trigger="click" @command="(role) => onGenerateStoryboardAux(sb, role)">
                    <el-button size="small" :loading="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id)">
                      辅助稿
                      <el-icon><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="role in storyboardAuxRoleOptions"
                          :key="role.value"
                          :command="role.value"
                        >
                          {{ role.label }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </template>
                <template v-else>
                <el-button
                  size="small"
                  :type="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? 'warning' : 'default'"
                  @click="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? stopResourceGeneration(GEN_RESOURCE.SB_IMAGE, sb.id) : onGenerateSbImage(sb)"
                >
                  <el-icon v-if="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id)" class="is-loading"><Loading /></el-icon>
                  {{ isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id) ? '停止' : '重新生成' }}
                </el-button>
                <el-button size="small" :loading="uploadingSbImageId === sb.id" @click="onUploadSbImageClick(sb)">上传</el-button>
                <el-tooltip content="高清放大（2x超分辨率）" placement="top">
                  <el-button
                    size="small"
                    :loading="upscalingSbIds.has(sb.id)"
                    :disabled="!getSbLocalImage(sb)"
                    @click="onUpscaleSbImage(sb)"
                  >
                    <el-icon><ZoomIn /></el-icon>超分
                  </el-button>
                </el-tooltip>
                <el-dropdown trigger="click" @command="(role) => onGenerateStoryboardAux(sb, role)">
                  <el-button size="small" :loading="isResourceGenerating(GEN_RESOURCE.SB_IMAGE, sb.id)">
                    辅助稿
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="role in storyboardAuxRoleOptions"
                        :key="role.value"
                        :command="role.value"
                      >
                        {{ role.label }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                </template>
              </div>
              </template>
            </div>
            <!-- 右：分镜视频（由 /videos?storyboard_id 拉取）；有视频时仍显示提示词与生成按钮便于调整后重新生成 -->
            <div class="sb-panel sb-video">
              <div v-if="getSbVideo(sb.id)" class="sb-video-area">
                <video
                  v-if="assetVideoUrl(getSbVideo(sb.id))"
                  :key="sbMainVideoPlayerKey(sb.id)"
                  :src="assetVideoUrl(getSbVideo(sb.id))"
                  controls
                  class="sb-video-player"
                  preload="metadata"
                />
                <div
                  v-else
                  class="sb-video-error"
                  :title="getSbVideoError(sb.id) || '视频地址无效'"
                >
                  {{ getSbVideoError(sb.id) || '视频地址无效，请重新生成' }}
                </div>
                <span v-if="isResourceGenerating(GEN_RESOURCE.SB_VIDEO, sb.id)" class="sb-video-regenerating-overlay">
                  <span class="ai-generating-timer">{{ resourceElapsedLabel(GEN_RESOURCE.SB_VIDEO, sb.id) }}</span>
                  <el-icon class="is-loading"><Loading /></el-icon>
                  正在重新生成...
                </span>
              </div>
              <div v-else class="sb-video-area sb-video-placeholder">
                <span v-if="isResourceGenerating(GEN_RESOURCE.SB_VIDEO, sb.id)" class="sb-video-generating-text">
                  <span class="ai-generating-timer">{{ resourceElapsedLabel(GEN_RESOURCE.SB_VIDEO, sb.id) }}</span>
                  <el-icon class="is-loading"><Loading /></el-icon>
                  正在生成视频...
                  <el-button size="small" type="warning" plain @click.stop="stopResourceGeneration(GEN_RESOURCE.SB_VIDEO, sb.id)">停止</el-button>
                </span>
                <template v-else>
                  <div v-if="getSbVideoError(sb.id)" class="sb-video-error">
                    {{ getSbVideoError(sb.id) }}
                  </div>
                  <el-button
                    type="primary"
                    size="small"
                    class="sb-generate-video-btn"
                    :disabled="!sbCanSubmitVideo(sb)"
                    @click="onGenerateSbVideo(sb)"
                  >
                    生成分镜视频
                  </el-button>
                </template>
              </div>
              <!-- 视频历史条：有多条历史时显示，点击可切换 -->
              <div v-if="getVideoStripItems(sb.id).length" class="sb-videos-strip">
                <el-tooltip content="历史视频：点击可切换为当前视频" placement="top" :show-arrow="false">
                  <el-icon class="sb-strip-hint-icon"><InfoFilled /></el-icon>
                </el-tooltip>
                <div
                  v-for="item in getVideoStripItems(sb.id)"
                  :key="item.key"
                  class="sb-video-thumb"
                  :title="`${item.label}（点击切换）`"
                  @click="onSelectSbMainVideo(sb, item.video)"
                >
                  <video :src="item.src" preload="metadata" class="sb-video-thumb-player" />
                  <span class="sb-video-thumb-label">{{ item.label }}</span>
                </div>
              </div>
              <div v-if="getSbVideo(sb.id)" class="sb-video-actions">
                <el-button
                  size="small"
                  :type="isResourceGenerating(GEN_RESOURCE.SB_VIDEO, sb.id) ? 'warning' : 'default'"
                  :disabled="!isResourceGenerating(GEN_RESOURCE.SB_VIDEO, sb.id) && !sbCanSubmitVideo(sb)"
                  @click="isResourceGenerating(GEN_RESOURCE.SB_VIDEO, sb.id) ? stopResourceGeneration(GEN_RESOURCE.SB_VIDEO, sb.id) : onGenerateSbVideo(sb)"
                >
                  <el-icon v-if="isResourceGenerating(GEN_RESOURCE.SB_VIDEO, sb.id)" class="is-loading"><Loading /></el-icon>
                  {{ isResourceGenerating(GEN_RESOURCE.SB_VIDEO, sb.id) ? '停止' : '重新生成' }}
                </el-button>
                <el-tooltip v-if="getNextStoryboard(sb.id)" content="提取本视频尾帧，设为下一个分镜的首帧" placement="top">
                  <el-button size="small" :loading="linkingTailFrameIds.has(sb.id)" @click="onLinkTailFrameToNext(sb)">尾帧衔接</el-button>
                </el-tooltip>
                <el-tooltip v-if="sb.dialogue" content="对白配音（TTS）" placement="top">
                  <el-button size="small" :loading="ttsSbIds.has(sb.id)" @click="onTtsSbDialogue(sb)">
                    对白配音
                  </el-button>
                </el-tooltip>
                <el-tooltip v-if="sb.dialogue && sbDialogueAudioRelPath(sb)" content="播放对白配音" placement="top">
                  <el-button size="small" @click="playSbDialogueTts(sb)">
                    <el-icon><VideoPlay /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
              <div class="sb-video-prompt-label">
                <span class="sb-dot"></span>
                <span>视频提示词</span>
              </div>
              <div class="sb-video-params-bar">
                <span class="sb-video-prompt-text sb-video-prompt-text--preview">{{ sb.video_prompt || '暂无视频提示词（在「视频配置」保存后自动生成）' }}</span>
                <el-button size="small" link type="primary" @click="onOpenSbPromptDialog(sb)">手工编辑</el-button>
              </div>
            </div>
          </div>
          </template>
        </template>
        <!-- 分镜生成中提示条 -->
        <div v-if="storyboardGenerating || universalOmniPolishRunning" class="sb-generating-tip">
          <span class="sb-gen-dot" /><span class="sb-gen-dot" /><span class="sb-gen-dot" />
          <span v-if="universalOmniPolishRunning" class="sb-gen-text">
            全能片段润色中 {{ universalOmniPolishProgress.current }}/{{ universalOmniPolishProgress.total }}
            <template v-if="universalOmniPolishProgress.label"> · {{ universalOmniPolishProgress.label }}</template>
          </span>
          <span v-else class="sb-gen-text">分镜持续生成中，客官稍等片刻…</span>
        </div>
        <div v-else-if="storyboards.length === 0" class="empty-tip">请先生成分镜</div>
      </section>


</template>

<script>
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis } from '@element-plus/icons-vue'
import UniversalSegmentOmniAtEditor from '@/components/UniversalSegmentOmniAtEditor.vue'
import StoryboardWorkbenchControls from './StoryboardWorkbenchControls.vue'

export default {
  name: 'StoryboardWorkbench',
  props: {
    ctx: { type: Object, required: true },
  },
  components: {
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Setting, Plus, Minus, Sunny, Moon, MagicStick, Upload, Delete, Check, Loading, WarningFilled, User, Box, Picture, Film, VideoCamera, Document, InfoFilled, Refresh, ZoomIn, QuestionFilled, DocumentAdd, Expand, Fold, VideoPlay, DataAnalysis, UniversalSegmentOmniAtEditor, StoryboardWorkbenchControls,
  },
  setup(props) {
    return props.ctx
  },
}
</script>
