import type { AdminAiTrace, AdminAiTraceStage } from '../types'

export const AI_TRACE_STAGE_LABEL: Record<AdminAiTraceStage, string> = {
  original_generation: '原文生成',
  tool_call: '工具调用',
  review_and_repair: '审核及 JSON 修复',
  json_translation: 'JSON 格式翻译',
  image_generation: '图片生成',
  sticker_lookup: '表情包获取',
  schedule_change: '日程变更执行',
  location_change: '地点变更执行',
  clothing_change: '衣物变更执行',
  first_chat: '原文生成（旧记录）',
  first_quality: '审核及修改（旧记录）',
  second_chat: '二次生成（旧记录）',
  other: '其他',
  second_quality: '二次审核（旧记录）',
}

const TRACE_ORDER: AdminAiTraceStage[] = [
  'original_generation', 'tool_call', 'review_and_repair', 'json_translation',
  'second_chat', 'second_quality', 'image_generation', 'sticker_lookup',
  'schedule_change', 'location_change', 'clothing_change',
  'first_chat', 'first_quality', 'other',
]

export interface AiTraceTurn {
  id: string
  traces: AdminAiTrace[]
  createdAt: number
  conversationId?: string
}

export function groupAiTraces(traces: AdminAiTrace[]): AiTraceTurn[] {
  const groups = new Map<string, AiTraceTurn>()
  for (const trace of traces) {
    const id = trace.turnId || `legacy:${trace.id}`
    const existing = groups.get(id)
    if (existing) {
      existing.traces.push(trace)
      existing.createdAt = Math.max(existing.createdAt, trace.createdAt)
    } else {
      groups.set(id, { id, traces: [trace], createdAt: trace.createdAt, conversationId: trace.conversationId })
    }
  }
  return [...groups.values()].sort((a, b) => b.createdAt - a.createdAt)
}

export function orderedTraceSteps(traces: AdminAiTrace[]): AdminAiTrace[] {
  return [...traces].sort((a, b) => {
    const left = a.stage ? TRACE_ORDER.indexOf(a.stage) : 99
    const right = b.stage ? TRACE_ORDER.indexOf(b.stage) : 99
    return left - right || a.createdAt - b.createdAt
  })
}

export function formatTraceDuration(durationMs?: number): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return '耗时未知'
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))} ms`
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 2 : 1)} s`
}

export function traceStageLabel(trace: AdminAiTrace): string {
  return trace.stage ? AI_TRACE_STAGE_LABEL[trace.stage] : trace.purpose
}

/** One expandable request/response step, shared by Sky Eye, conversation and global trace pages. */
export function AiTraceStep({ trace, index }: { trace: AdminAiTrace; index: number }) {
  return (
    <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[var(--ui-text)]">{index + 1}. {traceStageLabel(trace)} <span className="font-normal text-[var(--ui-text-3)]">· {trace.model}</span></p>
        <span className={`shrink-0 text-[10px] ${trace.purpose === 'proactive' ? 'text-[var(--ui-warning-ink)]' : 'text-[var(--ui-text-3)]'}`}>{trace.purpose === 'proactive' ? '主动私聊' : trace.purpose}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {trace.messages.map((message, messageIndex) => (
          <details key={`${trace.id}-${messageIndex}`} open={message.role === 'system' && messageIndex === 0} className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] text-[var(--ui-text-2)]">
              [{message.role}] {message.content.length} 字
            </summary>
            <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--ui-text)]">{message.content}</pre>
          </details>
        ))}
      </div>
      <details open className="mt-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] px-2 py-1.5">
        <summary className="cursor-pointer text-[11px] text-[var(--ui-text-2)]">{trace.error ? '错误' : '模型输出'}</summary>
        <pre className={`mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed ${trace.error ? 'text-[var(--ui-danger)]' : 'text-[var(--ui-text)]'}`}>{trace.output || trace.error || '（无输出）'}</pre>
      </details>
      <p className="mt-2 text-right text-[10px] text-[var(--ui-text-3)]">输入 {trace.inputTokens} · 输出 {trace.outputTokens} tokens · {formatTraceDuration(trace.durationMs)}</p>
    </div>
  )
}
