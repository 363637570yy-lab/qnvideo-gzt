import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeAiFriendlyMessage, NO_AI_CONFIG_MESSAGES } from '../src/utils/aiFriendlyErrors.js'

test('normalizes backend no image model message', () => {
  assert.equal(
    normalizeAiFriendlyMessage('图片生成请求失败: 未配置图片模型'),
    NO_AI_CONFIG_MESSAGES.image
  )
})

test('normalizes backend no text model message', () => {
  assert.equal(
    normalizeAiFriendlyMessage('AI生成失败: 未配置文本模型'),
    NO_AI_CONFIG_MESSAGES.text
  )
})

test('keeps unrelated backend errors unchanged', () => {
  assert.equal(
    normalizeAiFriendlyMessage('HTTP 400 - Invalid size'),
    'HTTP 400 - Invalid size'
  )
})
