import { describeCurrentTime } from './time'
import { DEFAULT_PROACTIVE_CONTEXT_PROMPT } from './proactiveDefaults'
import type { AppSettings, Contact, ProactiveTopicRecord } from '../types'

function fillProactiveTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '')
}

/** Pure builder so the settings page can preview the exact proactive request context. */
export function buildProactiveContext(
  contact: Contact,
  topic: ProactiveTopicRecord,
  settings: Pick<AppSettings, 'proactiveContextPrompt' | 'proactiveExtraInstruction' | 'userNickname'>,
  now = Date.now(),
): string {
  const recentTopics = (contact.proactiveTopicHistory ?? []).slice(-4).map((x) => x.topic).join('；') || '无'
  const template = settings.proactiveContextPrompt?.trim() || DEFAULT_PROACTIVE_CONTEXT_PROMPT
  const vars = {
    topic: topic.topic,
    source: topic.source,
    recentTopics,
    contactName: contact.name,
    userName: settings.userNickname || '我',
    time: describeCurrentTime(new Date(now)),
  }
  let context = fillProactiveTemplate(template, vars)
  // Keep the chosen material visible even if the user edits the placeholder away.
  if (!template.includes('{{topic}}')) context += `\n（本轮素材：${topic.topic}；来源：${topic.source}）`
  if (settings.proactiveExtraInstruction?.trim()) context += `\n\n${settings.proactiveExtraInstruction.trim()}`
  return context
}
