import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles } from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { Avatar } from '../components/Avatar'
import { ActionSheet } from '../components/ActionSheet'
import { db } from '../db/db'
import { useSettingsStore } from '../store/useSettingsStore'
import { displayName } from '../lib/contact'
import { toDateKey } from '../lib/time'
import { isAiTestId } from '../lib/aiTestIsolation'
import {
  ASSISTANT_DIARY_HOUR,
  ASSISTANT_DIARY_MINUTE,
  DEFAULT_ASSISTANT_DIARY_PROMPT,
} from '../lib/assistantDefaults'
import {
  clearAssistantContact,
  confirmAssistantDiary,
  formatAssistantDate,
  generateAssistantDiary,
  saveAssistantDiaryDraft,
  setAssistantContact,
} from '../lib/assistant'
import type { AssistantDiary } from '../types'

const EMPTY_DIARIES: AssistantDiary[] = []

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function isDateKey(value: string | null): value is string {
  if (!value) return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function AssistantDiaryPage() {
  const settings = useSettingsStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const todayKey = toDateKey(new Date())
  const [selectedDate, setSelectedDate] = useState(() => {
    const requested = searchParams.get('date')
    return isDateKey(requested) ? requested : todayKey
  })
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(dateFromKey(selectedDate)))
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [changeAssistantOpen, setChangeAssistantOpen] = useState(false)
  const [diaryPromptDraft, setDiaryPromptDraft] = useState(settings.assistantDiaryPrompt)

  const diaries = useLiveQuery(() => db.assistantDiaries.orderBy('date').reverse().toArray(), []) ?? EMPTY_DIARIES
  const contacts = (useLiveQuery(() => db.contacts.toArray(), []) ?? []).filter((contact) => !isAiTestId(contact.id))
  const assistant = contacts.find((contact) => contact.id === settings.assistantContactId)
  const diary = diaries.find((entry) => entry.date === selectedDate)
  const diaryByDate = useMemo(() => new Map(diaries.map((entry) => [entry.date, entry])), [diaries])

  useEffect(() => {
    setDraft(diary?.content ?? '')
    setEditing(diary?.status === 'draft')
  }, [diary?.id, diary?.content, diary?.status])

  useEffect(() => {
    if (searchParams.get('changeAssistant') === '1') setChangeAssistantOpen(true)
  }, [searchParams])

  // Notification banners navigate with `?date=...`; HashRouter keeps the page
  // mounted, so the initial-state read alone would leave the old day selected.
  useEffect(() => {
    const requested = searchParams.get('date')
    if (!isDateKey(requested) || requested === selectedDate) return
    setSelectedDate(requested)
    setMonthCursor(startOfMonth(dateFromKey(requested)))
  }, [searchParams, selectedDate])

  const cells = useMemo(() => {
    const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()
    const result: Array<Date | null> = []
    for (let index = 0; index < first.getDay(); index++) result.push(null)
    for (let day = 1; day <= daysInMonth; day++) {
      result.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day))
    }
    while (result.length % 7 !== 0) result.push(null)
    return result
  }, [monthCursor])

  function writeParams(dateKey: string, removeChangeAssistant = false) {
    const next = new URLSearchParams(searchParams)
    next.set('date', dateKey)
    if (removeChangeAssistant) next.delete('changeAssistant')
    setSearchParams(next, { replace: true })
  }

  function selectDate(date: Date) {
    const key = toDateKey(date)
    setSelectedDate(key)
    setError('')
    setNotice('')
    if (date.getFullYear() !== monthCursor.getFullYear() || date.getMonth() !== monthCursor.getMonth()) {
      setMonthCursor(startOfMonth(date))
    }
    writeParams(key)
  }

  function goToday() {
    const today = dateFromKey(todayKey)
    setSelectedDate(todayKey)
    setMonthCursor(startOfMonth(today))
    setError('')
    setNotice('')
    writeParams(todayKey)
  }

  function shiftMonth(delta: number) {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  function closeAssistantPicker() {
    setChangeAssistantOpen(false)
    if (searchParams.get('changeAssistant') === '1') writeParams(selectedDate, true)
  }

  async function generate(force = false) {
    if (selectedDate > todayKey) {
      setError('未来的日期还没有发生，不能写日记')
      return
    }
    if (!settings.assistantContactId) {
      setError('请先在联系人名片里设置一位小助理')
      return
    }
    if (force && diary?.status === 'confirmed' && !window.confirm('重新生成会覆盖已确认的日记，确定继续？')) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await generateAssistantDiary(selectedDate, settings, { force })
      setNotice('日记草稿已生成，可以修改后确认')
      setEditing(true)
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError))
    } finally {
      setBusy(false)
    }
  }

  async function saveDraftOnly() {
    if (!diary) return
    setBusy(true)
    setError('')
    try {
      await saveAssistantDiaryDraft(diary.id, draft)
      setNotice('草稿已保存')
      setEditing(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDiary() {
    if (!diary) return
    setBusy(true)
    setError('')
    try {
      await confirmAssistantDiary(diary.id, draft)
      setEditing(false)
      setNotice('日记已确认')
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : String(confirmError))
    } finally {
      setBusy(false)
    }
  }

  function chooseAssistant(contactId?: string) {
    if (contactId) setAssistantContact(contactId)
    else clearAssistantContact()
    closeAssistantPicker()
    setNotice(contactId ? '已更换小助理' : '已取消小助理')
    setError('')
  }

  function saveDiaryPrompt() {
    settings.setSettings({ assistantDiaryPrompt: diaryPromptDraft })
    setNotice('日记提示词已保存')
  }

  function resetDiaryPrompt() {
    setDiaryPromptDraft(DEFAULT_ASSISTANT_DIARY_PROMPT)
    settings.setSettings({ assistantDiaryPrompt: DEFAULT_ASSISTANT_DIARY_PROMPT })
    setNotice('已恢复默认日记提示词')
  }

  const isFuture = selectedDate > todayKey
  const canGenerate = Boolean(settings.assistantContactId) && !isFuture

  return (
    <div className="ui-page relative">
      <TopBar title="小助理日记" showBack />
      <div className="ui-page-scroll">
        <header className="ui-page-intro">
          <p className="ui-page-kicker">每晚 {String(ASSISTANT_DIARY_HOUR).padStart(2, '0')}:{String(ASSISTANT_DIARY_MINUTE).padStart(2, '0')}</p>
          <h1 className="ui-page-title">小助理替你记下这一天</h1>
          <p className="ui-page-summary">
            小助理会以自己的视角，结合当天的日程和聊天写一篇日记。确认前可以随意修改；点日历里的任意一天可以回看。
          </p>
        </header>

        <section className="ui-section-card ui-section-spaced">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {assistant ? (
                <Avatar avatar={assistant.avatar} color={assistant.avatarColor} size={44} />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] text-[var(--ui-text-3)]">
                  <Sparkles size={20} />
                </span>
              )}
              <div className="min-w-0">
                <p className="ui-section-title truncate">{assistant ? displayName(assistant) : '还没有小助理'}</p>
                <p className="ui-section-summary">
                  {assistant ? '负责今晚的日记与明天的提醒' : '先到联系人名片里设置一位小助理'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setChangeAssistantOpen(true)}
              className="shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-3 py-2 text-xs text-[var(--ui-text-2)]"
            >
              更换
            </button>
          </div>
        </section>

        <section className="mx-4 mt-3 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="上个月" className="flex h-9 w-9 items-center justify-center text-[var(--ui-text-2)]">
              <ChevronLeft size={18} />
            </button>
            <p className="ui-font-display text-[15px] font-semibold text-[var(--ui-text)]">{monthCursor.getFullYear()}年{monthCursor.getMonth() + 1}月</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={goToday} className="rounded-full bg-[var(--ui-surface-2)] px-2.5 py-1 text-[11px] text-[var(--ui-text-2)]">今天</button>
              <button type="button" onClick={() => shiftMonth(1)} aria-label="下个月" className="flex h-9 w-9 items-center justify-center text-[var(--ui-text-2)]">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-[var(--ui-text-3)]">
            {['日', '一', '二', '三', '四', '五', '六'].map((label) => <span key={label} className="py-1">{label}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {cells.map((date, index) => {
              if (!date) return <span key={`empty-${index}`} />
              const key = toDateKey(date)
              const entry = diaryByDate.get(key)
              const selected = key === selectedDate
              const today = key === todayKey
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDate(date)}
                  aria-label={`${date.getMonth() + 1}月${date.getDate()}日${entry ? entry.status === 'confirmed' ? '，已确认日记' : '，待确认日记' : ''}`}
                  className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm ${
                    selected
                      ? 'bg-[var(--ui-action)] text-[var(--ui-on-action)]'
                      : today
                        ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-action)]'
                        : 'text-[var(--ui-text)]'
                  }`}
                >
                  <span className="leading-none">{date.getDate()}</span>
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full ${
                    entry
                      ? entry.status === 'confirmed'
                        ? selected ? 'bg-[var(--ui-on-action)]' : 'bg-[var(--ui-action)]'
                        : 'bg-[var(--ui-warning)]'
                      : 'bg-transparent'
                  }`} />
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] text-[var(--ui-text-3)]">圆点：实心为已确认，黄色为待确认。点日期查看当天日记。</p>
        </section>

        <h2 className="ui-section-label">{formatAssistantDate(selectedDate)}</h2>
        <section className="mx-4 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
          {diary ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--ui-text-3)]">
                  {diary.assistantName} · {diary.status === 'confirmed' ? '已确认' : '待确认'}
                </p>
                {!editing && <button type="button" onClick={() => setEditing(true)} className="text-xs text-[var(--ui-special-ink)]">编辑</button>}
              </div>

              {editing ? (
                <>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={12}
                    className="mt-3 w-full resize-y rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm leading-7 text-[var(--ui-text)]"
                  />
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void confirmDiary()} disabled={busy || !draft.trim()} className="ui-primary-action flex-1 py-2.5 text-sm font-medium disabled:opacity-50">
                      {busy ? '处理中…' : diary.status === 'confirmed' ? '保存修改' : '确认日记'}
                    </button>
                    {diary.status === 'draft' && (
                      <button type="button" onClick={() => void saveDraftOnly()} disabled={busy} className="ui-secondary-action flex-1 py-2.5 text-sm">保存草稿</button>
                    )}
                    <button type="button" onClick={() => { setEditing(false); setDraft(diary.content) }} disabled={busy} className="ui-secondary-action flex-1 py-2.5 text-sm">取消</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--ui-text)]">{diary.content}</p>
                  <button
                    type="button"
                    onClick={() => void generate(true)}
                    disabled={busy || !canGenerate}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--ui-text-3)] disabled:opacity-50"
                  >
                    <RefreshCw size={13} />重新生成
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-[var(--ui-text-2)]">{isFuture ? '这一天还没有到来。' : '这一天还没有日记。'}</p>
              {!settings.assistantContactId && <p className="mt-1 text-xs text-[var(--ui-text-3)]">先在联系人名片里设置一位小助理。</p>}
              {canGenerate && (
                <button type="button" onClick={() => void generate()} disabled={busy} className="ui-primary-action mt-4 px-4 py-2.5 text-sm font-medium disabled:opacity-50">
                  {busy ? '正在写…' : '补写这天的日记'}
                </button>
              )}
            </div>
          )}

          {error && <p role="alert" className="mt-3 text-xs leading-5 text-[var(--ui-danger-ink)]">{error}</p>}
          {notice && <p role="status" className="mt-3 text-xs leading-5 text-[var(--ui-text-2)]">{notice}</p>}
        </section>

        <section className="mx-4 mt-4 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
          <h3 className="ui-section-title">小助理</h3>
          <p className="ui-section-summary">
            {assistant ? `当前由「${displayName(assistant)}」负责提醒和日记。` : '还没有设置小助理。'}
            确认日记后也会收到“是否更改明日助理”的提醒。
          </p>
          <button type="button" onClick={() => setChangeAssistantOpen(true)} className="ui-secondary-action mt-3 py-2.5 text-sm">
            {assistant ? '更换小助理' : '选择一位小助理'}
          </button>
        </section>

        <details className="mx-4 mt-4 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
          <summary className="cursor-pointer text-sm font-medium text-[var(--ui-text)]">日记提示词</summary>
          <p className="mt-2 text-[11px] leading-5 text-[var(--ui-text-3)]">
            小助理写日记时使用。可用占位符：{'{{assistant}}'} {'{{user}}'} {'{{date}}'} {'{{schedule}}'} {'{{chats}}'}
          </p>
          <textarea
            value={diaryPromptDraft}
            onChange={(event) => setDiaryPromptDraft(event.target.value)}
            rows={9}
            className="mt-3 w-full resize-y rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm leading-6 text-[var(--ui-text)]"
          />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={saveDiaryPrompt} className="ui-primary-action flex-1 py-2.5 text-sm font-medium">保存提示词</button>
            <button type="button" onClick={resetDiaryPrompt} className="ui-secondary-action flex-1 py-2.5 text-sm">恢复默认</button>
          </div>
        </details>
      </div>

      {changeAssistantOpen && (
        <ActionSheet
          title="选择小助理（只有一位）"
          onClose={closeAssistantPicker}
          options={[
            ...contacts
              .slice()
              .sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh-CN'))
              .map((contact) => ({
                label: `${displayName(contact)}${contact.id === settings.assistantContactId ? '（当前）' : ''}`,
                onSelect: () => chooseAssistant(contact.id),
              })),
            ...(settings.assistantContactId
              ? [{ label: '取消小助理', onSelect: () => chooseAssistant(), danger: true }]
              : []),
          ]}
        />
      )}
    </div>
  )
}
