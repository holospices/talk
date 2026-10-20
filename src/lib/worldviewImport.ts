import { v4 as uuid } from 'uuid'
import type { AppSettings, LibraryItem, WorldbookEntry } from '../types'
import { estimateTokens } from './aiUsage'
import { chatCompletionText } from './deepseek'
import { parseJsonLoose } from './aiProtocol'

function cleanKeywords(values: unknown) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))].slice(0, 30)
}

export interface MaterializedLibraryItem {
  entry: WorldbookEntry
  compressed: boolean
  originalTokens: number
  finalTokens: number
}

/** Convert reference material into an independent canon snapshot. */
export async function materializeLibraryItem(item: LibraryItem, collectionId: string, settings: AppSettings): Promise<MaterializedLibraryItem> {
  const originalTokens = estimateTokens(`【${item.title}】\n${item.content}`)
  const threshold = Math.max(200, settings.libraryCompressionThresholdTokens ?? 2000)
  const shouldCompress = settings.autoCompressLibraryImports !== false && originalTokens > threshold
  let title = item.title
  let content = item.content
  let suggestedKeywords: string[] = []
  if (shouldCompress) {
    if (!settings.apiKey) throw new Error('资料超过自动压缩阈值，但还没有配置 AI API Key。请配置后重试，或关闭自动压缩后原样加入。')
    const raw = await chatCompletionText({
      apiKey: settings.apiKey, baseUrl: settings.baseUrl, model: settings.utilityModel || settings.model,
      purpose: 'worldbook', jsonMode: true, thinking: 'disabled', temperature: 0.1, maxTokens: 2200,
      messages: [
        { role: 'system', content: `你把参考资料整理成简洁但不丢失正史约束的世界观条目。删除重复、文学修饰、示例堆叠和外部工具语法；必须保留专有名词、人物组织地点关系、数字时间、能力边界、禁止事项、因果规则、例外、已发生事实与原文不确定性。不能编造。只输出JSON：{"title":"标题","content":"整理后正文","suggestedKeywords":["建议触发词"]}` },
        { role: 'user', content: `原关键词：${item.keywords.join('、') || '无（原资料为常驻）'}\n原资料：\n【${item.title}】\n${item.content}` },
      ],
    })
    const parsed = parseJsonLoose<{ title?: unknown; content?: unknown; suggestedKeywords?: unknown }>(raw)
    if (!parsed || typeof parsed.content !== 'string' || !parsed.content.trim()) throw new Error('AI整理结果无效。资料没有原样加入，请重试或关闭自动压缩。')
    title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : title
    content = parsed.content.trim()
    suggestedKeywords = cleanKeywords(parsed.suggestedKeywords)
  }
  // Explicit source keywords are authoritative. Missing source keywords stay
  // empty (permanent) even when AI suggests terms; suggestions are retained
  // in provenance for later user review, never silently changing activation.
  const keywords = [...new Set(item.keywords.map((value) => value.trim()).filter(Boolean))]
  const now = Date.now()
  const entry: WorldbookEntry = {
    id: uuid(), collectionId, title, content, keywords, enabled: true, foundationalWorldview: false,
    priority: 50, createdAt: now, updatedAt: now,
    rawData: { libraryItemId: item.id, librarySourceType: item.sourceType, originalTitle: item.title, suggestedKeywords, compressed: shouldCompress },
  }
  return { entry, compressed: shouldCompress, originalTokens, finalTokens: estimateTokens(`【${title}】\n${content}`) }
}
