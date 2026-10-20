import { describe, expect, it } from 'vitest'
import type { AppSettings, LibraryItem } from '../types'
import { materializeLibraryItem } from './worldviewImport'

const settings = { autoCompressLibraryImports: true, libraryCompressionThresholdTokens: 2000 } as AppSettings
const base: LibraryItem = { id: 'source', sourceType: 'worldbook', title: '校规', content: '夜间禁止离开宿舍。', keywords: ['校规', '宵禁'], createdAt: 1, updatedAt: 1 }

describe('library to worldview materialization', () => {
  it('keeps short content and explicit source keywords unchanged', async () => {
    const result = await materializeLibraryItem(base, 'world', settings)
    expect(result.compressed).toBe(false)
    expect(result.entry.content).toBe(base.content)
    expect(result.entry.keywords).toEqual(base.keywords)
  })

  it('keeps missing keywords empty so permanent activation is not silently changed', async () => {
    const result = await materializeLibraryItem({ ...base, keywords: [] }, 'world', settings)
    expect(result.entry.keywords).toEqual([])
  })

  it('always preserves original content when automatic compression is off', async () => {
    const long = { ...base, content: '规则。'.repeat(4000) }
    const result = await materializeLibraryItem(long, 'world', { ...settings, autoCompressLibraryImports: false })
    expect(result.compressed).toBe(false)
    expect(result.entry.content).toBe(long.content)
  })
})
