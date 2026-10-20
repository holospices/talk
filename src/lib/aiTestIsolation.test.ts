import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { cleanupResidualAiTestData } from './aiTestCards'
import { USER_WALLET_ID } from './finance'
import type { Contact } from '../types'

function contact(id: string, name: string): Contact {
  return {
    id, name, avatar: '🙂', avatarColor: '#eee', systemPrompt: '测试人设', createdAt: 1,
    memoryFacts: '', memoryStyle: '', memoryUpdatedAt: 0, memoryMessageCursor: 0,
    relationshipBase: '朋友', relationshipDynamic: '',
  }
}

describe('AI test sandbox isolation', () => {
  beforeEach(async () => {
    await Promise.all([
      db.aiTestSuites.clear(), db.messages.clear(), db.conversations.clear(), db.contacts.clear(), db.groups.clear(),
      db.contactMemories.clear(), db.contactExperiences.clear(), db.lifeEvents.clear(), db.walletAccounts.clear(),
      db.walletTransactions.clear(), db.loans.clear(), db.aiTurns.clear(), db.adminAiTraces.clear(),
    ])
  })

  it('cleans prefixed sandbox rows, reverses unfinished financial impact, and preserves reports', async () => {
    const temporaryContactId = 'ai-test-contact-leftover'
    const conversationId = 'ai-test-conversation-leftover'
    await db.contacts.bulkAdd([contact('real-contact', '真人'), contact(temporaryContactId, '副本')])
    await db.conversations.add({ id: conversationId, contactId: temporaryContactId, pinned: false, createdAt: 1, updatedAt: 1 })
    await db.messages.add({ id: 'reply-with-random-id', conversationId, role: 'assistant', type: 'text', content: '测试回复', createdAt: 2 })
    await db.contactMemories.add({ id: 'random-memory-id', contactId: temporaryContactId, category: '基础信息', kind: 'general', content: '测试记忆', tags: [], importance: 0.5, emotionalWeight: 0, confidence: 1, sourceMessageIds: [], createdAt: 1, updatedAt: 1, usageCount: 0 })
    await db.walletAccounts.bulkAdd([{ ownerId: USER_WALLET_ID, balance: 110, updatedAt: 1 }, { ownerId: temporaryContactId, balance: 90, updatedAt: 1 }])
    await db.walletTransactions.add({ id: 'random-transaction-id', kind: 'transfer', fromOwnerId: temporaryContactId, toOwnerId: USER_WALLET_ID, amount: 10, status: 'completed', createdAt: 1, completedAt: 1 })
    await db.aiTestSuites.add({ id: 'saved-report', kind: 'conversation', executionMode: 'sequential', status: 'completed', title: '报告', scenarioLabel: '测试', targetLabel: '副本', targetSnapshot: {}, cards: [], createdAt: 1, updatedAt: 1 })

    const result = await cleanupResidualAiTestData()

    expect(result.total).toBeGreaterThan(0)
    expect(await db.contacts.get(temporaryContactId)).toBeUndefined()
    expect(await db.contacts.get('real-contact')).toBeTruthy()
    expect(await db.conversations.get(conversationId)).toBeUndefined()
    expect(await db.messages.get('reply-with-random-id')).toBeUndefined()
    expect(await db.contactMemories.get('random-memory-id')).toBeUndefined()
    expect((await db.walletAccounts.get(USER_WALLET_ID))?.balance).toBe(100)
    expect(await db.walletTransactions.get('random-transaction-id')).toBeUndefined()
    expect(await db.aiTestSuites.get('saved-report')).toBeTruthy()
  })
})
