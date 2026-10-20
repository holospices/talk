import { v4 as uuid } from 'uuid'
import { db } from '../db/db'
import type { Contact, ContactSaveSnapshotData, ContactStoryline, GlobalSaveSnapshot } from '../types'
import { resetAllChatTurns } from './chatEngine'
import { resetAllGroupChatTurns } from './groupChatEngine'

const now = () => Date.now()

function defaultStorylineName(worldName?: string) {
  return worldName ? `${worldName}剧情线` : '默认剧情线'
}

export async function ensureActiveStoryline(contact: Contact, worldName?: string): Promise<ContactStoryline> {
  const existing = (await db.contactStorylines.where('contactId').equals(contact.id).toArray()).find((line) => line.active)
  if (existing) return existing
  const createdAt = now()
  const line: ContactStoryline = {
    id: uuid(), contactId: contact.id, worldviewId: contact.worldviewId,
    name: defaultStorylineName(worldName), active: true, createdAt, updatedAt: createdAt,
  }
  await db.contactStorylines.add(line)
  return line
}

async function captureContact(contact: Contact): Promise<ContactSaveSnapshotData> {
  const conversation = await db.conversations.where('contactId').equals(contact.id).first()
  const [messages, memories, mediaAssets] = await Promise.all([
    conversation ? db.messages.where('conversationId').equals(conversation.id).toArray() : [],
    db.contactMemories.where('contactId').equals(contact.id).toArray(),
    conversation ? db.mediaAssets.where('conversationId').equals(conversation.id).toArray() : [],
  ])
  return { contact: structuredClone(contact), conversation: conversation ? structuredClone(conversation) : undefined, messages: structuredClone(messages), memories: structuredClone(memories), mediaAssets: structuredClone(mediaAssets) }
}

export async function createContactSave(contact: Contact, options: { name: string; kind: 'manual' | 'automatic'; storyline?: ContactStoryline }) {
  const storyline = options.storyline ?? await ensureActiveStoryline(contact)
  const snapshot = await captureContact(contact)
  const createdAt = now()
  await db.contactSaveSnapshots.add({ id: uuid(), contactId: contact.id, storylineId: storyline.id, name: options.name.trim() || '未命名存档', kind: options.kind, createdAt, snapshot })
  await db.contactStorylines.update(storyline.id, { updatedAt: createdAt })
}

export async function restoreContactSave(snapshotId: string) {
  const saved = await db.contactSaveSnapshots.get(snapshotId)
  if (!saved) throw new Error('该联系人存档不存在')
  const data = saved.snapshot
  resetAllChatTurns()
  await db.transaction('rw', [db.contacts, db.conversations, db.messages, db.contactMemories, db.contactStorylines, db.mediaAssets], async () => {
    const current = await db.conversations.where('contactId').equals(saved.contactId).first()
    if (current) {
      await db.messages.where('conversationId').equals(current.id).delete()
      await db.mediaAssets.where('conversationId').equals(current.id).delete()
      await db.conversations.delete(current.id)
    }
    await db.contactMemories.where('contactId').equals(saved.contactId).delete()
    await db.contacts.put(data.contact)
    if (data.conversation) await db.conversations.put(data.conversation)
    if (data.messages.length) await db.messages.bulkPut(data.messages)
    if (data.memories.length) await db.contactMemories.bulkPut(data.memories)
    if (data.mediaAssets?.length) await db.mediaAssets.bulkPut(data.mediaAssets)
    const lines = await db.contactStorylines.where('contactId').equals(saved.contactId).toArray()
    for (const line of lines) await db.contactStorylines.update(line.id, { active: line.id === saved.storylineId, updatedAt: now() })
  })
}

/** Protect the old story, then start a clean branch in the selected world. */
export async function switchContactWorldview(contact: Contact, nextWorldviewId: string, nextWorldName: string) {
  const oldLine = await ensureActiveStoryline(contact)
  await createContactSave(contact, { storyline: oldLine, kind: 'automatic', name: '切换世界观前' })
  const createdAt = now()
  const newLine: ContactStoryline = { id: uuid(), contactId: contact.id, worldviewId: nextWorldviewId, name: defaultStorylineName(nextWorldName), active: true, createdAt, updatedAt: createdAt }
  await db.transaction('rw', [db.contacts, db.conversations, db.messages, db.contactMemories, db.contactStorylines, db.mediaAssets], async () => {
    const conversation = await db.conversations.where('contactId').equals(contact.id).first()
    if (conversation) {
      await db.messages.where('conversationId').equals(conversation.id).delete()
      await db.mediaAssets.where('conversationId').equals(conversation.id).delete()
    }
    await db.contactMemories.where('contactId').equals(contact.id).delete()
    await db.contacts.update(contact.id, { worldviewId: nextWorldviewId })
    await db.contactStorylines.update(oldLine.id, { active: false, updatedAt: createdAt })
    await db.contactStorylines.add(newLine)
  })
}

export async function createWorldbookSave(resourceId: string, name: string, kind: GlobalSaveSnapshot['kind'] = 'manual') {
  const collection = await db.worldbookCollections.get(resourceId)
  if (!collection) throw new Error('世界书不存在')
  const entries = await db.worldbookEntries.where('collectionId').equals(resourceId).toArray()
  await db.globalSaveSnapshots.add({ id: uuid(), resourceType: 'worldbook', resourceId, name: name.trim() || '世界书存档', kind, createdAt: now(), snapshot: { collection: structuredClone(collection), entries: structuredClone(entries) } })
}

export async function restoreWorldbookSave(snapshotId: string) {
  const saved = await db.globalSaveSnapshots.get(snapshotId)
  if (!saved || saved.resourceType !== 'worldbook') throw new Error('该世界书存档不存在')
  const data = saved.snapshot as { collection: Record<string, unknown>; entries: Array<Record<string, unknown>> }
  await db.transaction('rw', db.worldbookCollections, db.worldbookEntries, async () => {
    await db.worldbookCollections.put(data.collection as never)
    await db.worldbookEntries.where('collectionId').equals(saved.resourceId).delete()
    if (data.entries.length) await db.worldbookEntries.bulkPut(data.entries as never[])
  })
}

export async function createMapSave(name: string, kind: GlobalSaveSnapshot['kind'] = 'manual') {
  const [map, locations, state, edges] = await Promise.all([db.worldMaps.get('active'), db.locations.toArray(), db.locationModuleState.get('active'), db.acousticEdges.toArray()])
  if (!map) throw new Error('当前还没有地图')
  await db.globalSaveSnapshots.add({ id: uuid(), resourceType: 'map', resourceId: 'active', name: name.trim() || '地图存档', kind, createdAt: now(), snapshot: structuredClone({ map, locations, state, edges }) })
}

export async function restoreMapSave(snapshotId: string) {
  const saved = await db.globalSaveSnapshots.get(snapshotId)
  if (!saved || saved.resourceType !== 'map') throw new Error('该地图存档不存在')
  const data = saved.snapshot as { map: Record<string, unknown>; locations: Array<Record<string, unknown>>; state?: Record<string, unknown>; edges: Array<Record<string, unknown>> }
  resetAllGroupChatTurns()
  await db.transaction('rw', db.worldMaps, db.locations, db.locationModuleState, db.acousticEdges, async () => {
    await db.worldMaps.put(data.map as never)
    await db.locations.clear(); if (data.locations.length) await db.locations.bulkPut(data.locations as never[])
    await db.locationModuleState.clear(); if (data.state) await db.locationModuleState.put(data.state as never)
    await db.acousticEdges.clear(); if (data.edges.length) await db.acousticEdges.bulkPut(data.edges as never[])
  })
}

export async function deleteScopedSave(id: string, scope: 'contact' | 'global') {
  if (scope === 'contact') await db.contactSaveSnapshots.delete(id)
  else await db.globalSaveSnapshots.delete(id)
}
