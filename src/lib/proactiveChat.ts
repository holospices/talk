import { db } from '../db/db'
import { isAiTestId } from './aiTestIsolation'
import { triggerAiTurn } from './chatEngine'
import { weightedSampleWithoutReplacement } from './groupChat'
import { describeCurrentSchedule, isPhoneAvailable } from './schedule'
import { getPersonalSchedule, isUserInDndNow } from './assistant'
import { useSettingsStore } from '../store/useSettingsStore'
import { toDateKey } from './time'
import { DEFAULT_PROACTIVE_TOPIC_SOURCES } from './proactiveDefaults'
import { buildProactiveContext } from './proactivePrompt'
import type { AppSettings, Contact, ProactiveTopicRecord } from '../types'

export const AUTONOMOUS_TICK_INTERVAL_MS = 5 * 60 * 1000

function canSendToday() {
  const { proactiveMessageLog, proactiveDailyCap } = useSettingsStore.getState()
  const today = toDateKey(new Date())
  return !proactiveMessageLog || proactiveMessageLog.date !== today || proactiveMessageLog.count < proactiveDailyCap
}

function recordSent() {
  const { proactiveMessageLog, setSettings } = useSettingsStore.getState()
  const date = toDateKey(new Date())
  setSettings({ proactiveMessageLog: { date, count: proactiveMessageLog?.date === date ? proactiveMessageLog.count + 1 : 1 } })
}

async function chooseTopic(contact: Contact, settings: AppSettings): Promise<ProactiveTopicRecord | undefined> {
  const sources = settings.proactiveTopicSources ?? DEFAULT_PROACTIVE_TOPIC_SOURCES
  const used = new Set((contact.proactiveTopicHistory ?? []).filter((x) => Date.now() - x.createdAt < 7 * 86400000).map((x) => x.topic))
  const candidates: Omit<ProactiveTopicRecord, 'createdAt'>[] = []
  if (sources.events) for (const event of contact.pendingEvents ?? []) candidates.push({ topic: event, source: 'event' })
  if (sources.memories) {
    const memories = await db.contactMemories.where('contactId').equals(contact.id).reverse().sortBy('createdAt')
    for (const memory of memories.slice(0, 20)) {
      if (memory.kind === 'open_thread') candidates.push({ topic: memory.content, source: 'open_thread' })
      else if (memory.importance >= 0.65) candidates.push({ topic: memory.content, source: 'memory' })
    }
  }
  if (sources.plans) {
    const today = toDateKey(new Date())
    for (const plan of contact.upcomingPlans ?? []) {
      if (!plan.date || plan.date >= today) candidates.push({ topic: plan.text, source: 'plan' })
    }
  }
  if (sources.schedule) {
    const schedule = describeCurrentSchedule(contact, new Date())
    if (schedule) candidates.push({ topic: schedule, source: 'schedule' })
  }
  if (sources.career && contact.occupation) candidates.push({ topic: `${contact.occupation}相关的真实日常`, source: 'career' })
  if (sources.casual) candidates.push({ topic: '结合当前时间和自己的生活状态，发一句符合性格的轻量日常消息', source: 'casual' })
  const chosen = candidates.find((item) => !used.has(item.topic))
  return chosen ? { ...chosen, createdAt: Date.now() } : undefined
}

export async function maybeTriggerProactiveMessage(settings: AppSettings): Promise<void> {
  try {
    if (!settings.apiKey || !canSendToday() || Math.random() > settings.proactiveProbability) return
    // The user's own 免打扰 activities block contact-initiated chats. This does
    // not block replies inside an already-open conversation.
    if (isUserInDndNow(await getPersonalSchedule())) return
    const now = Date.now()
    const contacts = (await db.contacts.toArray()).filter((item) => !isAiTestId(item.id))
    const conversations = (await db.conversations.toArray()).filter((item) => !isAiTestId(item.id))
    const byContact = new Map(conversations.filter((c) => c.contactId).map((c) => [c.contactId!, c]))
    const eligible = contacts.filter((c) => {
      const conv = byContact.get(c.id)
      return !!conv && now - conv.updatedAt >= settings.proactiveSilenceThresholdMs && (!c.lastProactiveMessageAt || now - c.lastProactiveMessageAt >= settings.proactiveCooldownMs) && isPhoneAvailable(c, new Date(now))
    })
    const [contact] = weightedSampleWithoutReplacement(eligible, 1)
    if (!contact) return
    const topic = await chooseTopic(contact, settings)
    const conv = byContact.get(contact.id)
    if (!topic || !conv) return
    const context = buildProactiveContext(contact, topic, settings, now)
    const before = await db.aiTurns.where('conversationId').equals(conv.id).count()
    await triggerAiTurn(conv.id, contact, settings, await db.stickers.toArray(), context)
    const after = await db.aiTurns.where('conversationId').equals(conv.id).count()
    if (after <= before) return
    const history = [...(contact.proactiveTopicHistory ?? []), topic].slice(-12)
    await db.contacts.update(contact.id, { lastProactiveMessageAt: now, proactiveTopicHistory: history })
    recordSent()
  } catch (error) {
    console.warn('[proactive] 主动聊天跳过:', error)
  }
}
