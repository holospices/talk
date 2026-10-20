import { describe, expect, it } from 'vitest'
import { scoreLibraryItem, searchLibraryItems } from './library'
import type { LibraryItem } from '../types'

function item(id: string, title: string, content: string, keywords: string[] = []): LibraryItem {
  return { id, sourceType: 'manual', title, content, keywords, createdAt: 1, updatedAt: 1 }
}

describe('library relevance ranking', () => {
  it('puts exact titles and keywords ahead of incidental body matches', () => {
    const rows = [
      item('body', '很长的杂项资料', `其他内容 ${'霍格沃茨 '.repeat(80)}`),
      item('keyword', '学校制度', '简短规则', ['霍格沃茨']),
      item('title', '霍格沃茨', '学校设定'),
    ]
    expect(searchLibraryItems(rows, '霍格沃茨').map((row) => row.id)).toEqual(['title', 'keyword', 'body'])
  })

  it('normalizes case and gives full-query coverage a bonus', () => {
    const complete = item('complete', 'Cyber City Atlas', 'Night district regulations')
    const partial = item('partial', 'Cyber notes', 'unrelated')
    expect(scoreLibraryItem(complete, 'CYBER CITY')).toBeGreaterThan(scoreLibraryItem(partial, 'CYBER CITY'))
  })
})
