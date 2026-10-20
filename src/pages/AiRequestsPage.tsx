import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { AiTraceStep, groupAiTraces, orderedTraceSteps, traceStageLabel } from '../components/AiTraceView'
import { db } from '../db/db'
import { displayName } from '../lib/contact'
import { isAiTestId } from '../lib/aiTestIsolation'
import type { AdminAiTrace, Contact, Conversation, Group } from '../types'

const EMPTY_TRACES: AdminAiTrace[] = []
const EMPTY_CONVERSATIONS: Conversation[] = []
const EMPTY_CONTACTS: Contact[] = []
const EMPTY_GROUPS: Group[] = []
type PurposeFilter = 'proactive' | 'chat' | 'all'

export function AiRequestsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<PurposeFilter>(() => searchParams.get('purpose') === 'proactive' ? 'proactive' : searchParams.get('purpose') === 'chat' ? 'chat' : 'all')
  const [query, setQuery] = useState('')
  const [openTurn, setOpenTurn] = useState<string>('latest')

  const traces = useLiveQuery(async () => {
    const rows = await db.adminAiTraces.toArray()
    return rows.filter((trace) => !isAiTestId(trace.conversationId)).sort((a, b) => b.createdAt - a.createdAt)
  }, []) ?? EMPTY_TRACES
  const conversations = useLiveQuery(() => db.conversations.toArray(), []) ?? EMPTY_CONVERSATIONS
  const contacts = useLiveQuery(() => db.contacts.toArray(), []) ?? EMPTY_CONTACTS
  const groups = useLiveQuery(() => db.groups.toArray(), []) ?? EMPTY_GROUPS

  const conversationLabel = useMemo(() => {
    const contactById = new Map(contacts.map((contact) => [contact.id, contact]))
    const groupById = new Map(groups.map((group) => [group.id, group]))
    const labels = new Map<string, string>()
    for (const conversation of conversations) {
      if (conversation.contactId) {
        const contact = contactById.get(conversation.contactId)
        labels.set(conversation.id, contact ? displayName(contact) : '已删除联系人')
      } else if (conversation.groupId) {
        labels.set(conversation.id, groupById.get(conversation.groupId)?.name ?? '已删除群聊')
      }
    }
    return labels
  }, [conversations, contacts, groups])

  const turns = useMemo(() => {
    const grouped = groupAiTraces(traces)
    return grouped.filter((turn) => {
      const proactive = turn.traces.some((trace) => trace.purpose === 'proactive')
      const chat = turn.traces.some((trace) => trace.purpose === 'chat')
      if (filter === 'proactive' && !proactive) return false
      if (filter === 'chat' && !chat) return false
      if (!query.trim()) return true
      const label = turn.conversationId ? conversationLabel.get(turn.conversationId) ?? '' : ''
      return label.toLowerCase().includes(query.trim().toLowerCase())
    })
  }, [traces, filter, query, conversationLabel])

  useEffect(() => {
    if (openTurn === 'latest' && turns.length > 0) setOpenTurn(turns[0].id)
  }, [openTurn, turns])

  function changeFilter(next: PurposeFilter) {
    setFilter(next)
    setOpenTurn('latest')
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('purpose')
    else params.set('purpose', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="ui-page relative">
      <TopBar title="AI 请求记录" showBack />
      <div className="ui-page-scroll">
        <header className="ui-page-intro">
          <p className="ui-page-kicker">全部会话 · 最近 {traces.length} 条调用</p>
          <h1 className="ui-page-title">AI 到底收到了什么</h1>
          <p className="ui-page-summary">
            不经过功能管理或天眼，直接看每一次请求的完整 system/user 消息与模型返回。主动私聊的单轮请求也会带「主动私聊」标记。记录只保留最近 500 条调用。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {([['proactive', '主动私聊'], ['chat', '对话回复'], ['all', '全部']] as Array<[PurposeFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeFilter(value)}
                className={`rounded-full px-3 py-1.5 text-xs ${filter === value ? 'bg-[var(--ui-action)] text-[var(--ui-on-action)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-2)]'}`}
              >
                {label}
              </button>
            ))}
            <label className="ml-auto flex min-w-0 items-center gap-1.5 rounded-full bg-[var(--ui-surface-2)] px-2.5 py-1.5">
              <Search size={13} className="text-[var(--ui-text-3)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按联系人筛选" className="w-24 bg-transparent text-xs text-[var(--ui-text)] outline-none" />
            </label>
          </div>
          <button type="button" onClick={() => void navigate('/proactive-settings')} className="ui-secondary-action mt-3 inline-flex w-auto items-center px-3 py-2 text-xs">
            调整主动私聊提示词 ›
          </button>
        </header>

        <h2 className="ui-section-label">{turns.length} 个回合</h2>
        <div className="mx-4 space-y-2 pb-6">
          {turns.length === 0 && (
            <div className="ui-empty-state">
              <p>{filter === 'proactive' ? '还没有主动私聊的记录。' : '还没有可显示的请求记录。'}</p>
              <p className="mt-1 text-xs text-[var(--ui-text-3)]">让联系人主动发一条消息，或打开任意聊天发一条消息后再回来。</p>
            </div>
          )}
          {turns.map((turn, index) => {
            const open = openTurn === turn.id || (openTurn === 'latest' && index === 0)
            const ordered = orderedTraceSteps(turn.traces)
            const proactive = ordered.some((trace) => trace.purpose === 'proactive')
            const failed = ordered.find((trace) => trace.error)
            const label = turn.conversationId ? conversationLabel.get(turn.conversationId) ?? '未知会话' : '未知会话'
            return (
              <section key={turn.id} className="overflow-hidden rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow)]">
                <button type="button" onClick={() => setOpenTurn(open ? '' : turn.id)} aria-expanded={open} className="w-full px-4 py-3 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ui-text)]">{label}{proactive ? ' · 主动私聊' : ''}</p>
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
                  <div className="border-t border-[var(--ui-border-soft)] bg-[var(--ui-surface-2)] p-3">
                    {turn.conversationId && (
                      <div className="mb-2 flex justify-end">
                        <button type="button" onClick={() => void navigate(`/chat/${turn.conversationId}/ai-trace`)} className="text-[11px] text-[var(--ui-special-ink)]">在会话中查看 ›</button>
                      </div>
                    )}
                    <div className="space-y-3">
                      {ordered.map((trace, traceIndex) => <AiTraceStep key={trace.id} trace={trace} index={traceIndex} />)}
                    </div>
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
