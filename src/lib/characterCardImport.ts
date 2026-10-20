import { extractCharacterCardJsonFromPng } from './worldbookImport'

type JsonObject = Record<string, unknown>
const object = (value: unknown): JsonObject | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export interface ParsedCharacterCard {
  name: string
  description: string
  personality: string
  scenario: string
  firstMessage: string
  messageExamples: string
  systemPrompt: string
  postHistoryInstructions: string
  creatorNotes: string
  tags: string[]
  avatarDataUrl?: string
  raw: JsonObject
}

function replaceMacros(value: string, name: string, userName: string) {
  return value.replace(/{{char}}/gi, name).replace(/{{user}}/gi, userName)
}

export async function parseSillyTavernCharacterCard(file: File, userName = '用户'): Promise<ParsedCharacterCard> {
  const isPng = file.name.toLowerCase().endsWith('.png')
  const parsed = isPng ? extractCharacterCardJsonFromPng(await file.arrayBuffer()) : JSON.parse(await file.text())
  const root = object(parsed)
  if (!root) throw new Error('角色卡内容不是有效 JSON 对象')
  const data = object(root.data) ?? root
  const name = text(data.name) || text(root.name)
  if (!name) throw new Error('角色卡缺少角色名称')
  const read = (key: string) => replaceMacros(text(data[key]) || text(root[key]), name, userName)
  const tags = Array.isArray(data.tags) ? data.tags.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : []
  let avatarDataUrl: string | undefined
  if (isPng) avatarDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('角色卡头像格式不正确'))
    reader.onerror = () => reject(new Error('无法读取角色卡头像'))
    reader.readAsDataURL(file)
  })
  return {
    name,
    description: read('description'),
    personality: read('personality'),
    scenario: read('scenario'),
    firstMessage: read('first_mes'),
    messageExamples: read('mes_example'),
    systemPrompt: read('system_prompt'),
    postHistoryInstructions: read('post_history_instructions'),
    creatorNotes: read('creator_notes'),
    tags,
    avatarDataUrl,
    raw: root,
  }
}

export function characterCardPersonaText(card: ParsedCharacterCard): string {
  return [
    card.description && `角色描述：${card.description}`,
    card.personality && `性格：${card.personality}`,
    card.scenario && `场景与既有关系：${card.scenario}`,
    card.systemPrompt && `角色卡系统设定：${card.systemPrompt}`,
    card.postHistoryInstructions && `角色卡后置约束：${card.postHistoryInstructions}`,
    card.messageExamples && `说话示例：\n${card.messageExamples}`,
    card.creatorNotes && `作者说明：${card.creatorNotes}`,
  ].filter(Boolean).join('\n\n')
}
