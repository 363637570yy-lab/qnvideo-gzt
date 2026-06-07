import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { generationStyleOptions } from '../src/constants/styleOptions.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

test('all configured generation style thumbnails exist', () => {
  const missing = []
  for (const group of generationStyleOptions) {
    for (const opt of group.options || []) {
      if (!opt.thumb) continue
      const relative = opt.thumb.replace(/^\//, '')
      if (!existsSync(join(publicDir, relative))) {
        missing.push(`${opt.label}: ${opt.thumb}`)
      }
    }
  }
  assert.deepEqual(missing, [])
})
