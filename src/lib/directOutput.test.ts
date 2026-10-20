import { describe, expect, it } from 'vitest'
import { buildDirectOutputInstruction, parseDirectOutputReview } from './directOutput'

describe('single-request direct output protocol', () => {
  it('includes reply, review and task in one JSON contract', () => {
    const prompt = buildDirectOutputInstruction([{ id: 'cafe', name: '咖啡店' } as any])
    expect(prompt).toContain('"messages"')
    expect(prompt).toContain('"review"')
    expect(prompt).toContain('"specialTask"')
    expect(prompt).toContain('cafe=咖啡店')
    expect(prompt).toContain('knowledgeQueries 在此实验模式下必须保持空数组')
  })

  it('reads the self-review from the same response', () => {
    expect(parseDirectOutputReview('{"messages":[],"review":{"valid":true,"reason":"checked"}}'))
      .toEqual({ valid: true, reason: 'checked' })
  })
})
