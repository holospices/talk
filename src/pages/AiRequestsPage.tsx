import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router-dom'
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

type CategoryKey = 'privateChat' | 'memory' | 'diary' | 'reminder' | 'moments' | 'persona' | 'worldbook' | 'offlineState' | 'quality' | 'other'
type FilterKey = 'all' | 'chat' | 'memory' | 'generation' | 'system'

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  privateChat: '私聊',
  memory: '记忆更新',
  diary: '日记生成',
  reminder: '提醒生成',
  moments: '朋友圈',
  persona: '人物生成',
  worldbook: '世界书',
  offlineState: '离线经历',
  quality: '质量检查',
  other: '其他',
}

const FILTER_LABELS: Record<Exclude<FilterKey, 'all'>, string> = {
  chat: '私聊',
  memory: '记忆',
  generation: '生成',
  system: '系统',
}

const FILTERS: Array<Exclude<FilterKey, 'all'>> = ['chat', 'memory', 'generation', 'system']

function filterGroupForCategory(category: CategoryKey): Exclude<FilterKey, 'all'> {
  if (category === 'privateChat') return 'chat'
  if (category === 'memory') return 'memory'
  if (category === 'diary' || category === 'reminder' || category === 'moments' || category === 'persona') return 'generation'
  return 'system'
}

function categoryForTrace(trace: AdminAiTrace): CategoryKey {
  if (trace.label === '日记生成') return 'diary'
  if (trace.label === '提醒生成') return 'reminder'
  if (trace.purpose === 'chat' || trace.purpose === 'proactive') return 'privateChat'
  return trace.purpose as CategoryKey
}

function categoryForTurn(traces: AdminAiTrace[]): CategoryKey {
  return traces.map(categoryForTrace)[0] ?? 'other'
}

function isFilterKey(value: string | null): value is FilterKey {
  return value === 'all' || value === 'chat' || value === 'memory' || value === 'generation' || value === 'system'
}

export function AiRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<FilterKey>(() => {
    const purpose = searchParams.get('purpose')
    return isFilterKey(purpose) ? purpose : 'all'
  })
  const [query, setQuery] = useState('')
  const [openTurn, setOpenTurn] = useState<string>('latest')

  const traces = useLiveQuery(async () => {
    const rows = await db.adminAiTraces.toArray()
    return rows
      .filter((trace) => !isAiTestId(trace.conversationId) && trace.model !== '本地执行')
      .sort((a, b) => b.createdAt - a.createdAt)
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
      const category = categoryForTurn(turn.traces)
      if (filter !== 'all' && filterGroupForCategory(category) !== filter) return false
      if (!query.trim()) return true
      const label = turn.conversationId ? conversationLabel.get(turn.conversationId) ?? '' : ''
      const searchable = `${label} ${CATEGORY_LABELS[category]} ${turn.traces.map((trace) => trace.label ?? '').join(' ')}`
      return searchable.toLowerCase().includes(query.trim().toLowerCase())
    })
  }, [traces, filter, query, conversationLabel])

  useEffect(() => {
    if (openTurn === 'latest' && turns.length > 0) setOpenTurn(turns[0].id)
  }, [openTurn, turns])

  function changeFilter(next: FilterKey) {
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
          <p className="ui-page-kicker">全部模型调用 · 最近 {traces.length} 条</p>
          <h1 className="ui-page-title">AI 到底收到了什么</h1>
          <p className="ui-page-summary">
            所有模型请求都在这里，筛选只保留五类：全部、私聊（含对话回复和主动私聊）、记忆、生成（日记/提醒/朋友圈/人物生成）、系统（世界书/离线经历/质量检查等）。每条仍按具体类型命名；展开可看完整 system/user 消息与返回。本地执行事件不计入；记录保留最近 500 条调用。
          </p>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => changeFilter('all')}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${filter === 'all' ? 'bg-[var(--ui-action)] text-[var(--ui-on-action)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-2)]'}`}
            >
              全部
            </button>
            {FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => changeFilter(key)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${filter === key ? 'bg-[var(--ui-action)] text-[var(--ui-on-action)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-2)]'}`}
              >
                {FILTER_LABELS[key]}
              </button>
            ))}
          </div>
          <label className="mt-2 flex w-full items-center gap-1.5 rounded-full bg-[var(--ui-surface-2)] px-3 py-2">
            <Search size={13} className="shrink-0 text-[var(--ui-text-3)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按联系人 / 类型筛选" className="min-w-0 flex-1 bg-transparent text-xs text-[var(--ui-text)] outline-none" />
          </label>
        </header>

        <h2 className="ui-section-label">{turns.length} 个回合</h2>
        <div className="mx-4 space-y-2 pb-6">
          {turns.length === 0 && (
            <div className="ui-empty-state">
              <p>{filter === 'all' ? '还没有可显示的请求记录。' : `还没有「${FILTER_LABELS[filter]}」的记录。`}</p>
              <p className="mt-1 text-xs text-[var(--ui-text-3)]">聊天、主动私聊、记忆整理或日记生成后，再回来看看。</p>
            </div>
          )}
          {turns.map((turn, index) => {
            const open = openTurn === turn.id || (openTurn === 'latest' && index === 0)
            const ordered = orderedTraceSteps(turn.traces)
            const category = categoryForTurn(ordered)
            const categoryLabel = CATEGORY_LABELS[category]
            const privateDetail = ordered.some((trace) => trace.purpose === 'proactive')
              ? '主动私聊'
              : ordered.some((trace) => trace.purpose === 'chat') ? '对话回复' : '私聊'
            const contactLabel = turn.conversationId ? conversationLabel.get(turn.conversationId) : undefined
            const title = contactLabel
              ? `${contactLabel} · ${category === 'privateChat' ? privateDetail : categoryLabel}`
              : category === 'diary' || category === 'reminder'
                ? `小助理 · ${categoryLabel}`
                : category === 'privateChat'
                  ? `系统 · ${privateDetail}`
                  : `系统 · ${categoryLabel}`
            const failed = ordered.find((trace) => trace.error)
            return (
              <section key={turn.id} className="overflow-hidden rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow)]">
                <button type="button" onClick={() => setOpenTurn(open ? '' : turn.id)} aria-expanded={open} className="w-full px-4 py-3 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ui-text)]">{title}</p>
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
