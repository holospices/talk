import { describe, expect, it } from 'vitest'
import { buildProactiveContext } from './proactivePrompt'
import { DEFAULT_PROACTIVE_CONTEXT_PROMPT, DEFAULT_PROACTIVE_EXTRA_INSTRUCTION } from './proactiveDefaults'
import type { Contact, ProactiveTopicRecord } from '../types'

const contact = {
  name: '小满',
  proactiveTopicHistory: [
    { topic: '昨天聊到的拉面', source: 'memory', createdAt: 1 },
    { topic: '周末的约定', source: 'plan', createdAt: 2 },
  ],
} as Contact

const topic: ProactiveTopicRecord = { topic: '今天路过一家店', source: 'casual', createdAt: 3 }
const now = new Date(2026, 9, 19, 15, 30).getTime()

describe('proactive message context', () => {
  it('fills the user-editable placeholders and appends the proactive-only instruction', () => {
    const context = buildProactiveContext(contact, topic, {
      proactiveContextPrompt: '素材={{topic}} 来源={{source}} 最近={{recentTopics}} 联系人={{contactName}} 用户={{userName}} 时间={{time}}',
      proactiveExtraInstruction: '不要每次都问在干嘛',
      userNickname: '阿岚',
    }, now)
    expect(context).toContain('素材=今天路过一家店')
    expect(context).toContain('来源=casual')
    expect(context).toContain('最近=昨天聊到的拉面；周末的约定')
    expect(context).toContain('联系人=小满')
    expect(context).toContain('用户=阿岚')
    expect(context).toContain('不要每次都问在干嘛')
  })

  it('keeps the chosen material even when {{topic}} was removed from the template', () => {
    const context = buildProactiveContext(contact, topic, {
      proactiveContextPrompt: '只按你的角色说话。',
      proactiveExtraInstruction: '',
      userNickname: '我',
    }, now)
    expect(context).toContain('（本轮素材：今天路过一家店；来源：casual）')
  })

  it('uses the shipped defaults when the user clears both prompts', () => {
    const context = buildProactiveContext(contact, topic, {
      proactiveContextPrompt: '',
      proactiveExtraInstruction: '',
      userNickname: '我',
    }, now)
    expect(context).toContain('【本轮类型：主动开启对话】')
    expect(context).toContain(DEFAULT_PROACTIVE_CONTEXT_PROMPT.split('\n')[1].replace('{{topic}}', '今天路过一家店'))
    expect(context).not.toContain(DEFAULT_PROACTIVE_EXTRA_INSTRUCTION)
  })
})
