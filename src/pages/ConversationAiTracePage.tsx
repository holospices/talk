import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { AiTraceStep, groupAiTraces, orderedTraceSteps, traceStageLabel } from '../components/AiTraceView'
import { db } from '../db/db'
import { displayName } from '../lib/contact'
import { isAiTestId } from '../lib/aiTestIsolation'
import type { AdminAiTrace } from '../types'

const EMPTY_TRACES: AdminAiTrace[] = []

export function ConversationAiTracePage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const [openTurn, setOpenTurn] = useState<string>('latest')
  const conversation = useLiveQuery(
    () => (conversationId ? db.conversations.get(conversationId) : undefined),
    [conversationId],
  )
  const contact = useLiveQuery(
    () => (conversation?.contactId ? db.contacts.get(conversation.contactId) : undefined),
    [conversation?.contactId],
  )
  const group = useLiveQuery(
    () => (conversation?.groupId ? db.groups.get(conversation.groupId) : undefined),
    [conversation?.groupId],
  )
  const traces = useLiveQuery(async () => {
    if (!conversationId) return EMPTY_TRACES
    const rows = await db.adminAiTraces.toArray()
    return rows
      .filter((trace) => trace.conversationId === conversationId && !isAiTestId(trace.conversationId))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [conversationId]) ?? EMPTY_TRACES
  const turns = useMemo(() => groupAiTraces(traces), [traces])
  const title = contact ? displayName(contact) : group?.name ?? 'AI 请求记录'

  useEffect(() => {
    if (openTurn === 'latest' && turns.length > 0) setOpenTurn(turns[0].id)
  }, [openTurn, turns])

  return (
    <div className="ui-page relative">
      <TopBar title="AI 请求记录" showBack />
      <div className="ui-page-scroll">
        <header className="ui-page-intro">
          <p className="ui-page-kicker">{contact ? '私聊' : group ? '群聊' : '会话'} · {title}</p>
          <h1 className="ui-page-title">每一次发送与返回</h1>
          <p className="ui-page-summary">
            按回合列出发送给模型的完整消息、模型输出、token 和耗时。展开 system 消息即可看到这一轮真正生效的提示词；主动私聊的请求也会出现在这里。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { if (conversationId) void navigate(`/chat/${conversationId}`); else void navigate(-1) }} className="ui-secondary-action inline-flex w-auto items-center gap-1.5 px-3 py-2 text-xs">
              <ArrowLeft size={14} />回到聊天
            </button>
            {conversation?.contactId && (
              <button type="button" onClick={() => void navigate(`/contact/${conversation.contactId}/prompts`)} className="ui-secondary-action inline-flex w-auto items-center gap-1.5 px-3 py-2 text-xs">
                <SlidersHorizontal size={14} />私聊回复提示词
              </button>
            )}
            <button type="button" onClick={() => void navigate('/ai-requests?purpose=proactive')} className="ui-secondary-action inline-flex w-auto items-center gap-1.5 px-3 py-2 text-xs">
              查看全部主动私聊
            </button>
          </div>
        </header>

        <h2 className="ui-section-label">{turns.length} 个回合</h2>
        <div className="mx-4 space-y-2 pb-6">
          {turns.length === 0 && (
            <div className="ui-empty-state">
              <p>这个会话还没有可追踪的请求。</p>
              <p className="mt-1 text-xs text-[var(--ui-text-3)]">先发一条消息；如果刚刚清空过浏览器数据，旧记录也会一起消失。</p>
            </div>
          )}
          {turns.map((turn, index) => {
            const open = openTurn === turn.id || (openTurn === 'latest' && index === 0)
            const ordered = orderedTraceSteps(turn.traces)
            const failed = ordered.find((trace) => trace.error)
            const proactive = ordered.some((trace) => trace.purpose === 'proactive')
            return (
              <section key={turn.id} className="overflow-hidden rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow)]">
                <button type="button" onClick={() => setOpenTurn(open ? '' : turn.id)} aria-expanded={open} className="w-full px-4 py-3 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ui-text)]">第 {turns.length - index} 轮 · {ordered.length} 次调用{proactive ? ' · 主动私聊' : ''}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ordered.map((trace) => (
                          <span key={trace.id} className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--ui-text-2)]">
                            {traceStageLabel(trace)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] text-[var(--ui-text-3)]">{new Date(turn.createdAt).toLocaleString()}</p>
                      {failed && <p className="mt-1 text-[11px] text-[var(--ui-danger)]">有调用失败</p>}
                    </div>
                  </div>
                </button>
                {open && (
                  <div className="space-y-3 border-t border-[var(--ui-border-soft)] bg-[var(--ui-surface-2)] p-3">
                    {ordered.map((trace, traceIndex) => <AiTraceStep key={trace.id} trace={trace} index={traceIndex} />)}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
