import { v4 as uuid } from 'uuid'
import { db } from '../db/db'
import { useSettingsStore } from '../store/useSettingsStore'
import { useChatUiStore } from '../store/useChatUiStore'
import { chatCompletionText } from './deepseek'
import { parseJsonLoose } from './aiProtocol'
import { nextMessageTimestamp, triggerAiTurn } from './chatEngine'
import { displayName } from './contact'
import { isAiTestId } from './aiTestIsolation'
import { previewForMessage } from './messagePreview'
import { toDateKey, WEEKDAYS } from './time'
import {
  ASSISTANT_DIARY_HOUR,
  ASSISTANT_DIARY_MINUTE,
  ASSISTANT_REMINDER_GRACE_MS,
  DEFAULT_ASSISTANT_DIARY_PROMPT,
  DEFAULT_ASSISTANT_REMINDER_PROMPT,
} from './assistantDefaults'
import type {
  AppSettings,
  AssistantDiary,
  AssistantDiarySections,
  Contact,
  Conversation,
  Message,
  PersonalScheduleItem,
  SpecialDay,
} from '../types'

const MINUTES_PER_DAY = 24 * 60
const MAX_DIARY_CHAT_LINES = 120
const MAX_DIARY_CHAT_LINE_CHARS = 160

export const DIARY_SECTION_FIELDS: Array<{ key: keyof AssistantDiarySections; label: string }> = [
  { key: 'events', label: '今日事件' },
  { key: 'emotion', label: '今日情绪' },
  { key: 'growth', label: '今日成长' },
  { key: 'didWell', label: '做的不错' },
  { key: 'canAdjust', label: '可以调整的地方' },
  { key: 'tomorrowAction', label: '明日最小行动' },
  { key: 'assistantNotes', label: '小助理碎碎念' },
]

export function emptyDiarySections(): AssistantDiarySections {
  return {
    events: '',
    emotion: '',
    growth: '',
    didWell: '',
    canAdjust: '',
    tomorrowAction: '',
    assistantNotes: '',
  }
}

const DIARY_SECTION_ALIASES: Record<string, keyof AssistantDiarySections> = {
  events: 'events', 今日事件: 'events',
  emotion: 'emotion', 今日情绪: 'emotion',
  growth: 'growth', 今日成长: 'growth',
  didWell: 'didWell', 做的不错: 'didWell',
  canAdjust: 'canAdjust', 可以调整的地方: 'canAdjust',
  tomorrowAction: 'tomorrowAction', 明日最小行动: 'tomorrowAction',
  assistantNotes: 'assistantNotes', 小助理碎碎念: 'assistantNotes',
}

/** Normalize a model/user supplied section object; returns undefined when every section is empty. */
export function normalizeDiarySections(raw: unknown): AssistantDiarySections | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const sections = emptyDiarySections()
  for (const [rawKey, value] of Object.entries(record)) {
    const key = DIARY_SECTION_ALIASES[rawKey]
    if (key && typeof value === 'string') sections[key] = value.trim().slice(0, 4000)
  }
  return DIARY_SECTION_FIELDS.some((field) => sections[field.key].trim()) ? sections : undefined
}

/** Legacy rows stored one flat `content` string; show that under 今日事件. */
export function diarySectionsFor(diary: Pick<AssistantDiary, 'content' | 'sections'>): AssistantDiarySections {
  if (diary.sections) return { ...emptyDiarySections(), ...diary.sections }
  return { ...emptyDiarySections(), events: diary.content }
}

export function diarySectionsToText(sections: AssistantDiarySections): string {
  return DIARY_SECTION_FIELDS
    .filter((field) => sections[field.key].trim())
    .map((field) => `${field.label}：\n${sections[field.key].trim()}`)
    .join('\n\n')
    .slice(0, 8000)
}

export interface DueAssistantReminder {
  /** The day the activity belongs to, YYYY-MM-DD. */
  date: string
  item: PersonalScheduleItem
  startsAt: number
  dueAt: number
}

export interface NextAssistantReminder {
  item: PersonalScheduleItem
  date: string
  startsAt: number
  dueAt: number
}

// ---------------------------------------------------------------------------
// Pure time / schedule helpers (kept free of DB access so they are testable)
// ---------------------------------------------------------------------------

/** "HH:MM" for a minute-of-day value. Values outside a day wrap. */
export function minuteToClock(minute: number): string {
  const normalized = ((Math.round(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

/** Parse an "HH:MM" input into minutes from midnight; null when malformed. */
export function clockToMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export function personalScheduleDurationMinutes(item: Pick<PersonalScheduleItem, 'startMinute' | 'endMinute'>): number {
  const raw = item.endMinute - item.startMinute
  return raw > 0 ? raw : raw + MINUTES_PER_DAY
}

/** Whether a daily item covers a minute-of-day, including overnight ranges. */
export function personalScheduleCoversMinute(
  item: Pick<PersonalScheduleItem, 'startMinute' | 'endMinute'>,
  minute: number,
): boolean {
  if (item.startMinute < item.endMinute) return minute >= item.startMinute && minute < item.endMinute
  return minute >= item.startMinute || minute < item.endMinute
}

/** The most specific (latest-starting) activity covering `date`, if any. */
export function personalScheduleItemAt(
  items: PersonalScheduleItem[],
  date: Date = new Date(),
): PersonalScheduleItem | undefined {
  const minute = date.getHours() * 60 + date.getMinutes()
  return items
    .filter((item) => personalScheduleCoversMinute(item, minute))
    .sort((a, b) => b.startMinute - a.startMinute || a.createdAt - b.createdAt)[0]
}

/** True when any covering activity blocks contact-initiated messages. */
export function isUserInDndNow(items: PersonalScheduleItem[], date: Date = new Date()): boolean {
  const minute = date.getHours() * 60 + date.getMinutes()
  return items.some((item) => item.dnd && personalScheduleCoversMinute(item, minute))
}

/** Human/model-facing daily routine. Empty string when the user has no routine. */
export function describePersonalScheduleDay(items: PersonalScheduleItem[]): string {
  if (!items.length) return ''
  return [...items]
    .sort((a, b) => a.startMinute - b.startMinute || a.createdAt - b.createdAt)
    .map((item) => {
      const overnight = item.endMinute <= item.startMinute
      const end = `${minuteToClock(item.endMinute)}${overnight ? '（次日）' : ''}`
      const flags = [item.remind ? '需要提醒' : '', item.dnd ? '免打扰' : ''].filter(Boolean)
      return `${minuteToClock(item.startMinute)}-${end} ${item.activity}${flags.length ? `（${flags.join('、')}）` : ''}`
    })
    .join('\n')
}

/** Reminders whose due time has arrived and that have not been logged yet. */
export function dueAssistantReminders(
  items: PersonalScheduleItem[],
  now: Date = new Date(),
  sentKeys: ReadonlySet<string> = new Set(),
): DueAssistantReminder[] {
  const nowMs = now.getTime()
  const result: DueAssistantReminder[] = []
  // Look at yesterday/today/tomorrow so an activity just after midnight can
  // still be reminded late in the previous evening.
  for (const offset of [-1, 0, 1]) {
    const day = new Date(now)
    day.setDate(day.getDate() + offset)
    day.setHours(0, 0, 0, 0)
    const dateKey = toDateKey(day)
    for (const item of items) {
      if (!item.remind) continue
      const startsAt = day.getTime() + item.startMinute * 60 * 1000
      const dueAt = startsAt - Math.max(0, item.remindMinutes) * 60 * 1000
      if (nowMs < dueAt || nowMs > startsAt + ASSISTANT_REMINDER_GRACE_MS) continue
      if (sentKeys.has(`${dateKey}:${item.id}`)) continue
      result.push({ date: dateKey, item, startsAt, dueAt })
    }
  }
  return result.sort((a, b) => a.dueAt - b.dueAt)
}

/** The next upcoming reminder for status display (does not include already-due ones). */
export function nextAssistantReminder(
  items: PersonalScheduleItem[],
  now: Date = new Date(),
): NextAssistantReminder | undefined {
  const nowMs = now.getTime()
  let best: NextAssistantReminder | undefined
  for (const offset of [-1, 0, 1]) {
    const day = new Date(now)
    day.setDate(day.getDate() + offset)
    day.setHours(0, 0, 0, 0)
    const dateKey = toDateKey(day)
    for (const item of items) {
      if (!item.remind) continue
      const startsAt = day.getTime() + item.startMinute * 60 * 1000
      const dueAt = startsAt - Math.max(0, item.remindMinutes) * 60 * 1000
      if (dueAt < nowMs) continue
      if (!best || dueAt < best.dueAt) best = { item, date: dateKey, startsAt, dueAt }
    }
  }
  return best
}

/** Fill `{{placeholder}}` tokens. Unknown placeholders become empty strings. */
export function fillAssistantTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '')
}

function dateKeyToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatAssistantDate(dateKey: string): string {
  const date = dateKeyToLocalDate(dateKey)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`
}

function localDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

export async function getPersonalSchedule(): Promise<PersonalScheduleItem[]> {
  const items = await db.personalScheduleItems.toArray()
  return items.sort((a, b) => a.startMinute - b.startMinute || a.createdAt - b.createdAt)
}

/** Replace the whole routine atomically — the editor saves one daily table. */
export async function replacePersonalSchedule(items: PersonalScheduleItem[]): Promise<void> {
  await db.transaction('rw', db.personalScheduleItems, async () => {
    await db.personalScheduleItems.clear()
    if (items.length) await db.personalScheduleItems.bulkPut(items)
  })
}

export async function getAssistantContact(settings: AppSettings = useSettingsStore.getState()): Promise<Contact | undefined> {
  if (!settings.assistantContactId) return undefined
  return db.contacts.get(settings.assistantContactId)
}

export function setAssistantContact(contactId: string): void {
  const current = useSettingsStore.getState()
  current.setSettings({
    assistantContactId: contactId,
    assistantSince: current.assistantContactId === contactId ? current.assistantSince : Date.now(),
  })
}

/**
 * Makes a contact the small assistant and lets them react in their own voice.
 * The reaction is a normal assistant message, so it lands in the chat history
 * and benefits from the same persona/tool pipeline as any other turn.
 */
export async function appointAssistant(contactId: string): Promise<void> {
  const current = useSettingsStore.getState()
  if (current.assistantContactId === contactId) return
  setAssistantContact(contactId)
  const contact = await db.contacts.get(contactId)
  if (!contact) return
  const settings = useSettingsStore.getState()
  if (!settings.assistantReactionEnabled) return
  const conversation = await ensureAssistantConversation(contact)
  const context = '【本轮类型：被任命为小助理】用户刚刚把你设为 TA 的小助理。今后你负责在日程开始前提醒 TA，并在每晚帮 TA 写日记。请用你自己的口吻发一条简短的感想，表达你愿意做这件事、你会怎么提醒 TA。不要提“系统”“AI”“提示词”，不要写旁白，不要输出 JSON。'
  if (settings.apiKey) {
    await triggerAiTurn(conversation.id, contact, settings, await db.stickers.toArray(), context)
    return
  }
  const createdAt = await nextMessageTimestamp(conversation.id)
  const message: Message = {
    id: uuid(),
    conversationId: conversation.id,
    role: 'assistant',
    type: 'text',
    content: '以后每天的提醒和日记就交给我吧。我会记得的。',
    createdAt,
  }
  await db.messages.add(message)
  await db.conversations.update(conversation.id, { updatedAt: createdAt })
  if (useChatUiStore.getState().activeConversationId !== conversation.id) {
    useChatUiStore.getState().showNotification({
      id: uuid(),
      conversationId: conversation.id,
      contactName: displayName(contact),
      contactAvatar: contact.avatar,
      contactAvatarColor: contact.avatarColor,
      preview: message.content,
    })
  }
}

export function clearAssistantContact(): void {
  useSettingsStore.getState().setSettings({ assistantContactId: '', assistantSince: 0 })
}

// ---------------------------------------------------------------------------
// Special days / holiday greetings
// ---------------------------------------------------------------------------

export function specialDayMatchesDate(day: Pick<SpecialDay, 'date' | 'repeatYearly'>, dateKey: string): boolean {
  return day.repeatYearly ? day.date.slice(5) === dateKey.slice(5) : day.date === dateKey
}

export function specialDaysForDate(days: SpecialDay[], dateKey: string): SpecialDay[] {
  return days.filter((day) => specialDayMatchesDate(day, dateKey))
}

export async function getSpecialDays(): Promise<SpecialDay[]> {
  return db.specialDays.orderBy('date').toArray()
}

export async function addSpecialDay(input: { date: string; name: string; repeatYearly: boolean }): Promise<void> {
  const now = Date.now()
  await db.specialDays.add({
    id: uuid(),
    date: input.date,
    name: input.name.trim().slice(0, 30),
    repeatYearly: input.repeatYearly,
    createdAt: now,
    updatedAt: now,
  })
}

export async function deleteSpecialDay(id: string): Promise<void> {
  await db.specialDays.delete(id)
}

const HOLIDAY_GREETING_HOUR = 9

/**
 * On a saved special day, a bounded number of contacts proactively send a
 * greeting. Existing chat tools already know how to attach a red packet,
 * transfer or gift, so the context simply invites them to do what fits.
 */
async function runHolidayGreetings(settings: AppSettings): Promise<void> {
  if (!settings.holidayGreetingEnabled || !settings.apiKey) return
  const now = new Date()
  if (now.getHours() < HOLIDAY_GREETING_HOUR) return
  if (isUserInDndNow(await getPersonalSchedule(), now)) return
  const dateKey = toDateKey(now)
  const days = specialDaysForDate(await getSpecialDays(), dateKey)
  if (days.length === 0) return

  const logs = await db.holidayGreetingLogs.where('date').equals(dateKey).toArray()
  const greeted = new Set(logs.map((log) => `${log.specialDayId}:${log.contactId}`))
  const [contacts, conversations, stickers] = await Promise.all([
    db.contacts.toArray(),
    db.conversations.toArray(),
    db.stickers.toArray(),
  ])
  const conversationByContact = new Map(
    conversations.filter((conversation) => conversation.contactId && !isAiTestId(conversation.id)).map((conversation) => [conversation.contactId!, conversation]),
  )
  const candidates = contacts
    .filter((contact) => !isAiTestId(contact.id) && conversationByContact.has(contact.id))
    .filter((contact) => days.some((day) => !greeted.has(`${day.id}:${contact.id}`)))
  if (candidates.length === 0) return

  const max = Math.max(1, Math.min(10, settings.holidayGreetingMaxContacts || 3))
  const selected = [...candidates].sort(() => Math.random() - 0.5).slice(0, max)
  const holidayNames = days.map((day) => day.name).join('、')
  const context = `【本轮类型：特殊节日问候】今天是「${holidayNames}」。请结合你与用户的关系，主动发一条节日的祝福。可以自然地附带红包、转账或礼物（如果符合你们的关系和你的经济情况），不需要每样都发；不要提“系统”“安排”“提示词”，不要写旁白。`
  for (const contact of selected) {
    const conversation = conversationByContact.get(contact.id)
    if (!conversation) continue
    await triggerAiTurn(conversation.id, contact, settings, stickers, context)
    for (const day of days) {
      await db.holidayGreetingLogs.put({
        id: uuid(),
        date: dateKey,
        specialDayId: day.id,
        contactId: contact.id,
        sentAt: Date.now(),
      })
    }
  }
}

function assistantWasActiveOn(settings: AppSettings, dateKey: string): boolean {
  if (!settings.assistantSince) return true
  const end = dateKeyToLocalDate(dateKey)
  end.setHours(23, 59, 59, 999)
  return settings.assistantSince <= end.getTime()
}

export async function ensureAssistantConversation(contact: Contact): Promise<Conversation> {
  const existing = await db.conversations.where('contactId').equals(contact.id).first()
  if (existing) return existing
  const now = Date.now()
  const conversation: Conversation = {
    id: uuid(),
    contactId: contact.id,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.conversations.add(conversation)
  return conversation
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

let schedulerRunning = false
const diaryAttempted = new Set<string>()

/**
 * Foreground scheduler tick. Safe to call often: it only does work when a
 * reminder is due or a diary is missing at/after 23:00 (or yesterday's diary
 * needs a one-day catch-up).
 */
export async function runAssistantSchedule(settings: AppSettings = useSettingsStore.getState()): Promise<void> {
  if (schedulerRunning) return
  schedulerRunning = true
  try {
    const schedule = await getPersonalSchedule()
    await deliverDueAssistantReminders(schedule, settings)
    await maybeGenerateAssistantDiary(settings)
    await maybePromptAssistantChangeAtNight(settings)
    await runHolidayGreetings(settings)
  } catch (error) {
    console.warn('[assistant] 日程调度跳过:', error)
  } finally {
    schedulerRunning = false
  }
}

async function deliverDueAssistantReminders(items: PersonalScheduleItem[], settings: AppSettings): Promise<void> {
  if (!settings.assistantContactId || items.length === 0) return
  const due = dueAssistantReminders(items)
  if (due.length === 0) return
  const dates = [...new Set(due.map((reminder) => reminder.date))]
  const logs = await db.assistantReminderLogs.where('date').anyOf(dates).toArray()
  const sent = new Set(logs.map((log) => `${log.date}:${log.itemId}`))
  for (const reminder of due) {
    const key = `${reminder.date}:${reminder.item.id}`
    if (sent.has(key)) continue
    await sendAssistantReminder(reminder, settings)
    sent.add(key)
  }
}

async function sendAssistantReminder(reminder: DueAssistantReminder, settings: AppSettings): Promise<void> {
  const assistant = await getAssistantContact(settings)
  if (!assistant) return
  const conversation = await ensureAssistantConversation(assistant)
  const content = await composeAssistantReminder(reminder, settings, assistant)
  const createdAt = await nextMessageTimestamp(conversation.id)
  const message: Message = {
    id: uuid(),
    conversationId: conversation.id,
    role: 'assistant',
    type: 'text',
    content,
    createdAt,
  }
  await db.messages.add(message)
  await db.conversations.update(conversation.id, { updatedAt: createdAt })
  if (useChatUiStore.getState().activeConversationId !== conversation.id) {
    useChatUiStore.getState().showNotification({
      id: uuid(),
      conversationId: conversation.id,
      contactName: displayName(assistant),
      contactAvatar: assistant.avatar,
      contactAvatarColor: assistant.avatarColor,
      preview: previewForMessage(message),
    })
  }
  await db.assistantReminderLogs.put({
    id: uuid(),
    date: reminder.date,
    itemId: reminder.item.id,
    sentAt: Date.now(),
  })
}

async function composeAssistantReminder(
  reminder: DueAssistantReminder,
  settings: AppSettings,
  assistant: Contact,
): Promise<string> {
  const start = minuteToClock(reminder.item.startMinute)
  const end = minuteToClock(reminder.item.endMinute)
  const minutes = Math.max(0, Math.round(reminder.item.remindMinutes))
  const now = new Date()
  const vars = {
    assistant: displayName(assistant),
    user: settings.userNickname || '我',
    activity: reminder.item.activity,
    start,
    end,
    minutes: String(minutes),
    minutesText: minutes > 0 ? `距离开始还有 ${minutes} 分钟` : '现在正是开始时间',
    time: minuteToClock(now.getHours() * 60 + now.getMinutes()),
    date: formatAssistantDate(toDateKey(now)),
  }
  const fallback = minutes > 0
    ? `${minutes} 分钟后是「${reminder.item.activity}」，别忘了。`
    : `现在是「${reminder.item.activity}」的时间，别忘了。`
  if (!settings.apiKey) return fallback
  const template = settings.assistantReminderPrompt.trim() || DEFAULT_ASSISTANT_REMINDER_PROMPT
  try {
    const raw = await chatCompletionText({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.utilityModel || settings.model,
      provider: settings.aiProvider,
      messages: [
        {
          role: 'system',
          content: `你是${vars.assistant}。以下是你的人物设定，提醒时也要保持这个人的口吻：\n${assistant.systemPrompt.slice(0, 1600)}\n\n你同时是${vars.user}的小助理。本轮提醒信息：${vars.activity}，${start}-${end}，${vars.minutesText}。只输出要发送的消息正文。`,
        },
        { role: 'user', content: fillAssistantTemplate(template, vars) },
      ],
      temperature: 0.7,
      maxTokens: 180,
      thinking: 'disabled',
      purpose: 'other',
      automatic: true,
      trace: { turnId: `reminder-${uuid()}`, stage: 'other', label: '提醒生成' },
    })
    return cleanAssistantReminder(raw) || fallback
  } catch (error) {
    console.warn('[assistant] 提醒生成失败，使用默认文案:', error)
    return fallback
  }
}

function cleanAssistantReminder(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^(提醒|消息)[:：]\s*/, '')
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')
    .trim()
    .slice(0, 200)
}

// ---------------------------------------------------------------------------
// Diary
// ---------------------------------------------------------------------------

async function maybeGenerateAssistantDiary(settings: AppSettings): Promise<void> {
  const assistant = await getAssistantContact(settings)
  if (!assistant) return
  const now = new Date()
  const todayKey = toDateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  if (nowMinutes >= ASSISTANT_DIARY_HOUR * 60 + ASSISTANT_DIARY_MINUTE) {
    const existing = await db.assistantDiaries.where('date').equals(todayKey).first()
    if (existing || diaryAttempted.has(todayKey)) return
    await attemptDiaryGeneration(todayKey, settings)
    return
  }

  // One-day catch-up only, and never for a day before this assistant started.
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = toDateKey(yesterday)
  const existing = await db.assistantDiaries.where('date').equals(yesterdayKey).first()
  if (existing || diaryAttempted.has(yesterdayKey) || !assistantWasActiveOn(settings, yesterdayKey)) return
  await attemptDiaryGeneration(yesterdayKey, settings)
}

async function attemptDiaryGeneration(dateKey: string, settings: AppSettings): Promise<void> {
  diaryAttempted.add(dateKey)
  try {
    await generateAssistantDiary(dateKey, settings)
  } catch (error) {
    console.warn(`[assistant] ${dateKey} 日记生成失败:`, error)
  }
}

interface DayChatDigest {
  text: string
  messageCount: number
}

async function collectDayChats(dateKey: string): Promise<DayChatDigest> {
  const start = localDayStart(dateKeyToLocalDate(dateKey))
  const end = start + 24 * 60 * 60 * 1000
  const messages = await db.messages.where('createdAt').between(start, end, true, false).toArray()
  if (messages.length === 0) return { text: '', messageCount: 0 }

  const [conversations, contacts, groups] = await Promise.all([
    db.conversations.toArray(),
    db.contacts.toArray(),
    db.groups.toArray(),
  ])
  const conversationById = new Map(conversations.map((conversation) => [conversation.id, conversation]))
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]))
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const userName = useSettingsStore.getState().userNickname || '我'

  const lines: string[] = []
  for (const message of messages.sort((a, b) => a.createdAt - b.createdAt)) {
    const conversation = conversationById.get(message.conversationId)
    if (!conversation) continue
    if (isAiTestId(conversation.id) || (conversation.contactId && isAiTestId(conversation.contactId))) continue

    let speaker: string
    if (conversation.groupId) {
      const group = groupById.get(conversation.groupId)
      if (!group) continue
      if (message.role === 'user') {
        speaker = `${userName}（群「${group.name}」）`
      } else {
        const speakerContact = message.speakerContactId ? contactById.get(message.speakerContactId) : undefined
        speaker = `${speakerContact ? displayName(speakerContact) : '群成员'}（群「${group.name}」）`
      }
    } else if (conversation.contactId) {
      const contact = contactById.get(conversation.contactId)
      speaker = message.role === 'user' ? userName : contact ? displayName(contact) : '对方'
    } else {
      continue
    }

    const body = previewForMessage(message).trim().replace(/\s+/g, ' ')
    if (!body) continue
    lines.push(
      `${minuteToClock(new Date(message.createdAt).getHours() * 60 + new Date(message.createdAt).getMinutes())} ${speaker}：${body.slice(0, MAX_DIARY_CHAT_LINE_CHARS)}`,
    )
  }

  const total = lines.length
  if (total === 0) return { text: '', messageCount: 0 }
  const kept = lines.slice(-MAX_DIARY_CHAT_LINES)
  const omitted = total - kept.length
  return {
    text: `${omitted > 0 ? `（更早的 ${omitted} 条已省略）\n` : ''}${kept.join('\n')}`.slice(0, 18_000),
    messageCount: total,
  }
}

/**
 * Generate (or regenerate) one day's diary and save it as a draft. A
 * confirmed diary is left alone unless `force` is passed.
 */
export async function generateAssistantDiary(
  dateKey: string,
  settings: AppSettings = useSettingsStore.getState(),
  opts: { force?: boolean } = {},
): Promise<AssistantDiary> {
  const assistant = await getAssistantContact(settings)
  if (!assistant) throw new Error('还没有设置小助理，先在联系人名片里设置一位')
  if (!settings.apiKey) throw new Error('还没有填写 AI Key，暂时不能写日记')

  const existing = await db.assistantDiaries.where('date').equals(dateKey).first()
  if (existing?.status === 'confirmed' && !opts.force) return existing

  const schedule = await getPersonalSchedule()
  const scheduleText = describePersonalScheduleDay(schedule)
  const chats = await collectDayChats(dateKey)
  if (!scheduleText && chats.messageCount === 0) {
    throw new Error('这一天没有日程也没有聊天，暂时写不出日记')
  }

  const userName = settings.userNickname || '我'
  const assistantName = displayName(assistant)
  const vars = {
    assistant: assistantName,
    user: userName,
    date: formatAssistantDate(dateKey),
    schedule: scheduleText || '（今天没有设置日程）',
    chats: chats.text || '（今天没有聊天记录）',
  }
  const template = settings.assistantDiaryPrompt.trim() || DEFAULT_ASSISTANT_DIARY_PROMPT
  let prompt = fillAssistantTemplate(template, vars)
  // Data must reach the model even if the user edits the placeholders away.
  if (!template.includes('{{schedule}}')) prompt += `\n\n${userName}今天的日程：\n${vars.schedule}`
  if (!template.includes('{{chats}}')) prompt += `\n\n今天的聊天记录：\n${vars.chats}`

  prompt += `\n\n请严格只输出一个 JSON 对象，不要 Markdown 代码块，不要额外解释。字段必须全部存在，字符串可以为空，但不要添加其他字段：
{"events":"今日事件……","emotion":"今日情绪……","growth":"今日成长……","didWell":"做的不错……","canAdjust":"可以调整的地方……","tomorrowAction":"明日最小行动……","assistantNotes":"小助理碎碎念……"}`

  const system = [
    `你是${assistantName}。以下是你的人物设定，写日记时必须保持这个人的性格、口吻和视角：`,
    assistant.systemPrompt.slice(0, 2200),
    assistant.relationshipBase ? `你们的关系定位：${assistant.relationshipBase}。` : '',
    assistant.memoryFacts ? `你记得的事情：${assistant.memoryFacts}` : '',
    assistant.memoryStyle ? `你们相处的方式：${assistant.memoryStyle}` : '',
    settings.globalSystemPrompt ? `你的表达风格：${settings.globalSystemPrompt.slice(0, 1200)}` : '',
    '这是一篇只给你自己看的日记，不是聊天回复，也不是给对方看的汇报。',
  ].filter(Boolean).join('\n')

  const raw = await chatCompletionText({
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    provider: settings.aiProvider,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    jsonMode: true,
    temperature: 0.85,
    maxTokens: 1800,
    purpose: 'other',
    automatic: true,
    trace: { turnId: `diary-${uuid()}`, stage: 'other', label: '日记生成' },
  })
  const parsed = parseJsonLoose<Record<string, unknown>>(raw)
  const parsedSections = normalizeDiarySections(parsed)
    ?? normalizeDiarySections(parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).sections : undefined)
  const fallbackContent = parsedSections ? '' : cleanDiaryContent(raw)
  if (!parsedSections && !fallbackContent) throw new Error('模型没有写出内容，请稍后重试')
  const sections = parsedSections ?? { ...emptyDiarySections(), events: fallbackContent }
  const content = diarySectionsToText(sections)

  const now = Date.now()
  const diary: AssistantDiary = {
    id: existing?.id ?? uuid(),
    date: dateKey,
    assistantContactId: assistant.id,
    assistantName,
    content,
    sections,
    userReflection: existing?.userReflection ?? '',
    status: 'draft',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await db.assistantDiaries.put(diary)
  useChatUiStore.getState().showNotification({
    id: uuid(),
    to: `/diary?date=${dateKey}`,
    contactName: `${assistantName}的日记`,
    contactAvatar: assistant.avatar,
    contactAvatarColor: assistant.avatarColor,
    preview: dateKey === toDateKey(new Date())
      ? '今天的日记写好了，点击查看并确认'
      : `${formatAssistantDate(dateKey)}的日记补好了，点击查看`,
  })
  return diary
}

function cleanDiaryContent(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:markdown|text|json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/^(日记|今日日记)[:：]\s*/, '')
    .trim()
    .slice(0, 4000)
}

export interface AssistantDiaryPatch {
  sections?: AssistantDiarySections
  userReflection?: string
}

export async function saveAssistantDiaryDraft(diaryId: string, patch: AssistantDiaryPatch): Promise<void> {
  const diary = await db.assistantDiaries.get(diaryId)
  if (!diary) return
  const sections = patch.sections ?? diarySectionsFor(diary)
  if (!DIARY_SECTION_FIELDS.some((field) => sections[field.key].trim())) throw new Error('日记不能为空')
  await db.assistantDiaries.update(diaryId, {
    sections,
    content: diarySectionsToText(sections),
    userReflection: patch.userReflection ?? diary.userReflection ?? '',
    updatedAt: Date.now(),
  })
}

export async function saveAssistantDiaryReflection(diaryId: string, userReflection: string): Promise<void> {
  await db.assistantDiaries.update(diaryId, {
    userReflection: userReflection.trim().slice(0, 4000),
    updatedAt: Date.now(),
  })
}

export async function confirmAssistantDiary(diaryId: string, patch: AssistantDiaryPatch = {}): Promise<AssistantDiary | undefined> {
  const diary = await db.assistantDiaries.get(diaryId)
  if (!diary) return undefined
  const sections = patch.sections ?? diarySectionsFor(diary)
  if (!DIARY_SECTION_FIELDS.some((field) => sections[field.key].trim())) throw new Error('日记不能为空')
  const now = Date.now()
  const content = diarySectionsToText(sections)
  const userReflection = (patch.userReflection ?? diary.userReflection ?? '').trim().slice(0, 4000)
  await db.assistantDiaries.update(diaryId, {
    sections,
    content,
    userReflection,
    status: 'confirmed',
    confirmedAt: now,
    updatedAt: now,
  })
  void maybeNotifyAssistantChange(diary.date)
  return { ...diary, sections, content, userReflection, status: 'confirmed', confirmedAt: now, updatedAt: now }
}

/** At/after 23:00, a confirmed diary triggers the "change tomorrow's assistant?" prompt. */
async function maybePromptAssistantChangeAtNight(settings: AppSettings): Promise<void> {
  if (!settings.assistantContactId) return
  const now = new Date()
  if (now.getHours() * 60 + now.getMinutes() < ASSISTANT_DIARY_HOUR * 60 + ASSISTANT_DIARY_MINUTE) return
  const todayKey = toDateKey(now)
  if (settings.assistantChangePromptDate === todayKey) return
  const diary = await db.assistantDiaries.where('date').equals(todayKey).first()
  if (diary?.status !== 'confirmed') return
  await maybeNotifyAssistantChange(todayKey)
}

/** After a diary is confirmed, ask once that day whether tomorrow's assistant should change. */
export async function maybeNotifyAssistantChange(dateKey: string): Promise<void> {
  const settings = useSettingsStore.getState()
  if (!settings.assistantContactId) return
  // "Tomorrow's assistant" only makes sense right after today's diary, at night.
  const now = new Date()
  if (dateKey !== toDateKey(now)) return
  if (now.getHours() * 60 + now.getMinutes() < ASSISTANT_DIARY_HOUR * 60 + ASSISTANT_DIARY_MINUTE) return
  if (settings.assistantChangePromptDate === dateKey) return
  settings.setSettings({ assistantChangePromptDate: dateKey })
  const assistant = await getAssistantContact(settings)
  useChatUiStore.getState().showNotification({
    id: uuid(),
    to: '/diary?changeAssistant=1',
    contactName: '小助理',
    contactAvatar: assistant?.avatar ?? '🔔',
    contactAvatarColor: assistant?.avatarColor ?? '#07c160',
    preview: '今天的日记已确认。要更改明天的助理吗？',
  })
}
