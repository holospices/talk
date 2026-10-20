import { describe, expect, it } from 'vitest'
import type { AiTurnDebug } from '../types'
import { resultFromTurn } from './aiTestCards'

describe('AI test diagnostics', () => {
  it('keeps complete prompts and action judgment for later Markdown analysis', () => {
    const turn: AiTurnDebug = {
      id: 'turn', conversationId: 'conversation', raw: '{"bubbles":[]}', knowledgeQueries: [], createdAt: 1,
      parsed: {
        mainPrompt: '完整主提示词', conversionPrompt: '完整转换提示词', parsedBubbles: [{ type: 'text', content: '可以' }],
        actionCommittee: { approved: true, reason: '三个判断一致' },
        promptTrace: { sections: [{ label: '日程与当前情境', content: '没有截断的完整日程上下文' }], memorySummary: '记忆' },
      },
    }

    const result = resultFromTurn({ id: 'case', description: '测试', userMessage: '明天见' }, turn, [])

    expect(result.diagnostics).toMatchObject({
      mainPrompt: '完整主提示词', conversionPrompt: '完整转换提示词',
      promptSections: [{ label: '日程与当前情境', content: '没有截断的完整日程上下文' }],
      actionCommittee: { approved: true, reason: '三个判断一致' },
    })
  })
})
