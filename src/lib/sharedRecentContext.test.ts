import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import type { Contact, Conversation, Group, Message, Moment, MomentComment } from '../types'
import { recentSharedOriginalContext, SHARED_CONTEXT_MAX_CHARS } from './sharedRecentContext'

const now = Date.now()

function contact(id: string, name: string): Contact {
  return {
    id,
    name,
    avatar: name,
    avatarColor: '#fff',
    systemPrompt: '',
    createdAt: now,
    memoryFacts: '',
    memoryStyle: '',
    memoryUpdatedAt: now,
    memoryMessageCursor: 0,
    relationshipBase: '朋友',
    relationshipDynamic: '',
  }
}

async function clearDatabase() {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}

beforeEach(clearDatabase)

describe('recentSharedOriginalContext', () => {
  it('excludes unrelated private chats but retains a group shared with the target contact', async () => {
    await db.contacts.bulkPut([contact('a', '联系人A'), contact('b', '联系人B'), contact('c', '联系人C')])
    await db.groups.bulkPut([
      { id: 'shared-group', name: 'A和B的群', avatar: '', avatarColor: '', memberContactIds: ['a', 'b'], createdAt: now } satisfies Group,
      { id: 'unrelated-group', name: 'B和C的群', avatar: '', avatarColor: '', memberContactIds: ['b', 'c'], createdAt: now } satisfies Group,
    ])
    await db.conversations.bulkPut([
      { id: 'private-a', contactId: 'a', pinned: false, createdAt: now, updatedAt: now } satisfies Conversation,
      { id: 'private-b', contactId: 'b', pinned: false, createdAt: now, updatedAt: now } satisfies Conversation,
      { id: 'shared-chat', groupId: 'shared-group', pinned: false, createdAt: now, updatedAt: now } satisfies Conversation,
      { id: 'unrelated-chat', groupId: 'unrelated-group', pinned: false, createdAt: now, updatedAt: now } satisfies Conversation,
    ])
    await db.messages.bulkPut([
      { id: 'a-message', conversationId: 'private-a', role: 'assistant', type: 'text', content: 'A私聊原文', createdAt: now - 4 } satisfies Message,
      { id: 'b-message', conversationId: 'private-b', role: 'assistant', type: 'text', content: 'B不相关私聊原文', createdAt: now - 3 } satisfies Message,
      { id: 'shared-message', conversationId: 'shared-chat', role: 'assistant', speakerContactId: 'b', type: 'text', content: '共同群聊原文', createdAt: now - 2 } satisfies Message,
      { id: 'unrelated-message', conversationId: 'unrelated-chat', role: 'assistant', speakerContactId: 'b', type: 'text', content: '不相关群聊原文', createdAt: now - 1 } satisfies Message,
    ])

    const result = await recentSharedOriginalContext(['a'], '用户')

    expect(result).toContain('A私聊原文')
    expect(result).toContain('共同群聊原文')
    expect(result).not.toContain('B不相关私聊原文')
    expect(result).not.toContain('不相关群聊原文')
  })

  it('keeps only moments whose post or comment involves the target contact', async () => {
    await db.contacts.bulkPut([contact('a', '联系人A'), contact('b', '联系人B'), contact('c', '联系人C')])
    await db.moments.bulkPut([
      { id: 'related-moment', contactId: 'b', content: 'A评论过的动态', createdAt: now - 3 } satisfies Moment,
      { id: 'unrelated-moment', contactId: 'c', content: '完全无关的动态', createdAt: now - 2 } satisfies Moment,
    ])
    await db.momentComments.bulkPut([
      { id: 'related-comment', momentId: 'related-moment', authorContactId: 'a', content: 'A的评论', createdAt: now - 1 } satisfies MomentComment,
    ])

    const result = await recentSharedOriginalContext(['a'], '用户')

    expect(result).toContain('A评论过的动态')
    expect(result).toContain('A的评论')
    expect(result).not.toContain('完全无关的动态')
  })

  it('caps the complete returned string at 3000 characters even when a caller requests more', async () => {
    await db.contacts.put(contact('a', '联系人A'))
    await db.conversations.put({ id: 'private-a', contactId: 'a', pinned: false, createdAt: now, updatedAt: now })
    await db.messages.put({
      id: 'long-message',
      conversationId: 'private-a',
      role: 'assistant',
      type: 'text',
      content: '长'.repeat(5_000),
      createdAt: now,
    })

    const result = await recentSharedOriginalContext(['a'], '用户', { maxChars: 10_000 })

    expect(result.length).toBe(SHARED_CONTEXT_MAX_CHARS)
    expect(result.length).toBeLessThanOrEqual(3_000)
  })
})
