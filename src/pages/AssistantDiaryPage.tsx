import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, Download, RefreshCw, Sparkles, Star, Trash2 } from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { Avatar } from '../components/Avatar'
import { ActionSheet } from '../components/ActionSheet'
import { ToggleSwitch } from '../components/ToggleSwitch'
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
  addSpecialDay,
  appointAssistant,
  clearAssistantContact,
  confirmAssistantDiary,
  deleteSpecialDay,
  diarySectionsFor,
  DIARY_SECTION_FIELDS,
  emptyDiarySections,
  formatAssistantDate,
  generateAssistantDiary,
  saveAssistantDiaryDraft,
  saveAssistantDiaryReflection,
  specialDaysForDate,
} from '../lib/assistant'
import { diariesToMarkdown, diaryToMarkdown, saveMarkdownFile } from '../lib/diaryExport'
import type { AssistantDiary, AssistantDiarySections, SpecialDay } from '../types'

const EMPTY_DIARIES: AssistantDiary[] = []
const EMPTY_SPECIAL_DAYS: SpecialDay[] = []

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
  const [editing, setEditing] = useState(false)
  const [draftSections, setDraftSections] = useState<AssistantDiarySections>(emptyDiarySections)
  const [reflectionDraft, setReflectionDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [changeAssistantOpen, setChangeAssistantOpen] = useState(false)
  const [diaryPromptDraft, setDiaryPromptDraft] = useState(settings.assistantDiaryPrompt)
  const [holidayName, setHolidayName] = useState('')
  const [holidayDate, setHolidayDate] = useState(selectedDate)
  const [holidayRepeat, setHolidayRepeat] = useState(true)
  const [holidayError, setHolidayError] = useState('')

  const diaries = useLiveQuery(() => db.assistantDiaries.orderBy('date').reverse().toArray(), []) ?? EMPTY_DIARIES
  const specialDays = useLiveQuery(() => db.specialDays.orderBy('date').toArray(), []) ?? EMPTY_SPECIAL_DAYS
  const contacts = (useLiveQuery(() => db.contacts.toArray(), []) ?? []).filter((contact) => !isAiTestId(contact.id))
  const assistant = contacts.find((contact) => contact.id === settings.assistantContactId)
  const diary = diaries.find((entry) => entry.date === selectedDate)
  const diaryByDate = useMemo(() => new Map(diaries.map((entry) => [entry.date, entry])), [diaries])
  const holidaysOnSelected = specialDaysForDate(specialDays, selectedDate)
  const loadedDiaryRef = useRef('')

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

  useEffect(() => {
    setHolidayDate(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    const signature = `${diary?.id ?? ''}:${diary?.updatedAt ?? 0}`
    if (loadedDiaryRef.current === signature) return
    loadedDiaryRef.current = signature
    if (!diary) {
      setDraftSections(emptyDiarySections())
      setReflectionDraft('')
      return
    }
    setDraftSections(diarySectionsFor(diary))
    setReflectionDraft(diary.userReflection ?? '')
  }, [diary])

  useEffect(() => {
    setEditing(diary?.status === 'draft')
  }, [diary?.id, diary?.status])

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

  function updateSection(key: keyof AssistantDiarySections, value: string) {
    setDraftSections((current) => ({ ...current, [key]: value }))
    setNotice('')
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
      await saveAssistantDiaryDraft(diary.id, { sections: draftSections, userReflection: reflectionDraft })
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
      await confirmAssistantDiary(diary.id, { sections: draftSections, userReflection: reflectionDraft })
      setEditing(false)
      setNotice('日记已确认')
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : String(confirmError))
    } finally {
      setBusy(false)
    }
  }

  async function saveReflectionOnly() {
    if (!diary) return
    setBusy(true)
    setError('')
    try {
      await saveAssistantDiaryReflection(diary.id, reflectionDraft)
      setNotice('我的感想已保存')
    } catch (reflectionError) {
      setError(reflectionError instanceof Error ? reflectionError.message : String(reflectionError))
    } finally {
      setBusy(false)
    }
  }

  async function chooseAssistant(contactId?: string) {
    if (contactId) await appointAssistant(contactId)
    else clearAssistantContact()
    closeAssistantPicker()
    setNotice(contactId
      ? settings.assistantReactionEnabled
        ? '已更换小助理，TA 的感想已发到私聊'
        : '已更换小助理（任命感想已关闭）'
      : '已取消小助理')
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

  async function addHoliday() {
    if (!isDateKey(holidayDate)) {
      setHolidayError('请选择有效日期')
      return
    }
    if (!holidayName.trim()) {
      setHolidayError('请填写节日名称')
      return
    }
    await addSpecialDay({ date: holidayDate, name: holidayName, repeatYearly: holidayRepeat })
    setHolidayName('')
    setHolidayError('')
    setNotice('节日已添加')
  }

  async function removeHoliday(day: SpecialDay) {
    if (!window.confirm(`删除节日「${day.name}」？`)) return
    await deleteSpecialDay(day.id)
    setNotice('节日已删除')
  }

  async function exportOne() {
    if (!diary) return
    setBusy(true)
    setError('')
    try {
      const result = await saveMarkdownFile(`Talk-日记-${diary.date}.md`, diaryToMarkdown(diary))
      setNotice(result === 'saved' ? '日记已导出' : '日记已下载')
    } catch (exportError) {
      if (exportError instanceof DOMException && exportError.name === 'AbortError') return
      setError(exportError instanceof Error ? exportError.message : String(exportError))
    } finally {
      setBusy(false)
    }
  }

  async function exportAll() {
    if (diaries.length === 0) return
    setBusy(true)
    setError('')
    try {
      const result = await saveMarkdownFile(`Talk-日记合集-${todayKey}.md`, diariesToMarkdown(diaries))
      setNotice(result === 'saved' ? '全部日记已导出' : '全部日记已下载')
    } catch (exportError) {
      if (exportError instanceof DOMException && exportError.name === 'AbortError') return
      setError(exportError instanceof Error ? exportError.message : String(exportError))
    } finally {
      setBusy(false)
    }
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
            小助理会以自己的视角，结合当天的日程和聊天写下七个栏目。确认前可以修改；点日历里的任意一天可以回看，也可以导出成 Markdown。
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
                  {assistant ? '负责今晚的日记、提醒和节日问候' : '先到联系人名片里设置一位小助理'}
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
              const dayHolidays = specialDaysForDate(specialDays, key)
              const selected = key === selectedDate
              const today = key === todayKey
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectDate(date)}
                  aria-label={`${date.getMonth() + 1}月${date.getDate()}日${entry ? entry.status === 'confirmed' ? '，已确认日记' : '，待确认日记' : ''}${dayHolidays.length ? `，节日${dayHolidays.map((day) => day.name).join('、')}` : ''}`}
                  className="mx-auto flex w-10 flex-col items-center"
                >
                  <span className={`flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm ${
                    selected
                      ? 'bg-[var(--ui-action)] text-[var(--ui-on-action)]'
                      : today
                        ? 'bg-[var(--ui-accent-soft)] text-[var(--ui-action)]'
                        : 'text-[var(--ui-text)]'
                  }`}>
                    <span className="leading-none">{date.getDate()}</span>
                    <span className="mt-1 flex h-1.5 items-center gap-0.5">
                      {entry && <span className={`h-1.5 w-1.5 rounded-full ${entry.status === 'confirmed' ? selected ? 'bg-[var(--ui-on-action)]' : 'bg-[var(--ui-action)]' : 'bg-[var(--ui-warning)]'}`} />}
                      {dayHolidays.length > 0 && <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-[var(--ui-on-action)]' : 'bg-[var(--ui-warning)]'}`} />}
                    </span>
                  </span>
                  <span className={`mt-0.5 w-full truncate text-center text-[10px] leading-3 ${selected ? 'text-[var(--ui-action)]' : 'text-[var(--ui-warning-ink)]'}`}>
                    {dayHolidays.length > 0 ? dayHolidays.map((day) => day.name).join('·') : '\u00A0'}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[var(--ui-text-3)]">圆点：日记（实心已确认，黄色待确认）；日期下方的文字是特殊节日。点日期查看当天日记。</p>
        </section>

        <h2 className="ui-section-label">{formatAssistantDate(selectedDate)}</h2>
        {holidaysOnSelected.length > 0 && (
          <div className="mx-4 mb-2 flex flex-wrap gap-1.5">
            {holidaysOnSelected.map((day) => <span key={day.id} className="rounded-full bg-[var(--ui-warning-soft)] px-2.5 py-1 text-[11px] text-[var(--ui-warning-ink)]">★ {day.name}</span>)}
          </div>
        )}
        <section className="mx-4 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
          {diary ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--ui-text-3)]">
                  {diary.assistantName} · {diary.status === 'confirmed' ? '已确认' : '待确认'}
                </p>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => void exportOne()} disabled={busy} className="inline-flex items-center gap-1 text-xs text-[var(--ui-text-3)] disabled:opacity-50"><Download size={13} />导出</button>
                  {!editing && <button type="button" onClick={() => setEditing(true)} className="text-xs text-[var(--ui-special-ink)]">编辑</button>}
                </div>
              </div>

              {editing ? (
                <>
                  <div className="mt-3 space-y-3">
                    {DIARY_SECTION_FIELDS.map((field) => (
                      <label key={field.key} className="block">
                        <span className="text-xs font-medium text-[var(--ui-text-2)]">{field.label}</span>
                        <textarea
                          value={draftSections[field.key]}
                          onChange={(event) => updateSection(field.key, event.target.value)}
                          rows={field.key === 'events' || field.key === 'assistantNotes' ? 4 : 3}
                          className="mt-1 w-full resize-y rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm leading-6 text-[var(--ui-text)]"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void confirmDiary()} disabled={busy} className="ui-primary-action flex-1 py-2.5 text-sm font-medium disabled:opacity-50">
                      {busy ? '处理中…' : diary.status === 'confirmed' ? '保存修改' : '确认日记'}
                    </button>
                    {diary.status === 'draft' && (
                      <button type="button" onClick={() => void saveDraftOnly()} disabled={busy} className="ui-secondary-action flex-1 py-2.5 text-sm">保存草稿</button>
                    )}
                    <button type="button" onClick={() => { setEditing(false); setDraftSections(diarySectionsFor(diary)); setReflectionDraft(diary.userReflection ?? '') }} disabled={busy} className="ui-secondary-action flex-1 py-2.5 text-sm">取消</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-3 space-y-3">
                    {DIARY_SECTION_FIELDS.map((field) => (
                      <div key={field.key}>
                        <p className="text-xs font-semibold text-[var(--ui-text-2)]">{field.label}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-[var(--ui-text)]">{diarySectionsFor(diary)[field.key].trim() || '（这次没有写）'}</p>
                      </div>
                    ))}
                  </div>
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

              <div className="mt-4 border-t border-[var(--ui-border-soft)] pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--ui-text-2)]">我的感想</p>
                  {!editing && <button type="button" onClick={() => void saveReflectionOnly()} disabled={busy} className="text-xs text-[var(--ui-special-ink)] disabled:opacity-50">保存感想</button>}
                </div>
                <textarea
                  value={reflectionDraft}
                  onChange={(event) => setReflectionDraft(event.target.value)}
                  rows={3}
                  placeholder="写下你自己的感想，会作为日记的一部分保存。"
                  className="mt-1 w-full resize-y rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm leading-6 text-[var(--ui-text)]"
                />
                {editing && <p className="mt-1 text-[11px] text-[var(--ui-text-3)]">确认或保存草稿时，会和上面的栏目一起保存。</p>}
              </div>
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

        <div className="mx-4 mt-3 flex gap-2">
          <button type="button" onClick={() => void exportOne()} disabled={!diary || busy} className="ui-secondary-action flex-1 py-2.5 text-sm disabled:opacity-50">导出这天的日记</button>
          <button type="button" onClick={() => void exportAll()} disabled={diaries.length === 0 || busy} className="ui-secondary-action flex-1 py-2.5 text-sm disabled:opacity-50">导出全部日记</button>
        </div>

        <section className="mx-4 mt-4 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="ui-section-title">特殊节日</h3>
              <p className="ui-section-summary">节日当天 09:00 后，少量联系人会主动送祝福，可能附带红包、转账或礼物。</p>
            </div>
            <Star size={18} className="shrink-0 text-[var(--ui-warning-ink)]" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              type="date"
              value={holidayDate}
              onChange={(event) => { setHolidayDate(event.target.value); setHolidayError('') }}
              className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm text-[var(--ui-text)]"
            />
            <input
              value={holidayName}
              onChange={(event) => { setHolidayName(event.target.value); setHolidayError('') }}
              maxLength={30}
              placeholder="节日名称，例如：生日"
              className="rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm text-[var(--ui-text)]"
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-[var(--ui-text-2)]">
              <input type="checkbox" checked={holidayRepeat} onChange={(event) => setHolidayRepeat(event.target.checked)} />
              每年重复
            </label>
            <button type="button" onClick={() => void addHoliday()} className="ui-primary-action px-4 py-2 text-xs font-medium">添加节日</button>
          </div>
          {holidayError && <p role="alert" className="mt-2 text-xs text-[var(--ui-danger-ink)]">{holidayError}</p>}

          {specialDays.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {specialDays.map((day) => (
                <div key={day.id} className="flex items-center gap-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--ui-text)]">{day.name}</span>
                  <span className="shrink-0 text-[11px] text-[var(--ui-text-3)]">{formatAssistantDate(day.date)}{day.repeatYearly ? ' · 每年' : ''}</span>
                  <button type="button" onClick={() => void removeHoliday(day)} aria-label={`删除节日${day.name}`} className="flex h-7 w-7 shrink-0 items-center justify-center text-[var(--ui-text-3)]"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-[var(--ui-border-soft)] pt-3">
            <div>
              <p className="text-xs font-medium text-[var(--ui-text-2)]">节日问候</p>
              <p className="mt-0.5 text-[11px] text-[var(--ui-text-3)]">关闭后不会自动发祝福，节日仍会显示在日历上。</p>
            </div>
            <ToggleSwitch
              checked={settings.holidayGreetingEnabled}
              onChange={(checked) => settings.setSettings({ holidayGreetingEnabled: checked })}
              ariaLabel="节日问候开关"
            />
          </div>
          <label className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--ui-text-2)]">
            每次最多几位联系人送祝福
            <input
              type="number"
              min={1}
              max={10}
              value={settings.holidayGreetingMaxContacts}
              onChange={(event) => {
                const value = Number(event.target.value)
                settings.setSettings({ holidayGreetingMaxContacts: Number.isFinite(value) ? Math.max(1, Math.min(10, Math.round(value))) : 3 })
              }}
              className="w-16 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1.5 text-center text-sm text-[var(--ui-text)]"
            />
          </label>
        </section>

        <section className="mx-4 mt-4 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
          <h3 className="ui-section-title">小助理</h3>
          <p className="ui-section-summary">
            {assistant ? `当前由「${displayName(assistant)}」负责提醒和日记。` : '还没有设置小助理。'}
            确认日记后也会收到“是否更改明日助理”的提醒。
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--ui-border-soft)] pt-3">
            <div>
              <p className="text-xs font-medium text-[var(--ui-text-2)]">任命时发送感想</p>
              <p className="mt-0.5 text-[11px] leading-5 text-[var(--ui-text-3)]">开启后，新任命的小助理会在私聊里发一条自己的感想。</p>
            </div>
            <ToggleSwitch
              checked={settings.assistantReactionEnabled}
              onChange={(checked) => settings.setSettings({ assistantReactionEnabled: checked })}
              ariaLabel="任命小助理时发送感想"
            />
          </div>
          <button type="button" onClick={() => setChangeAssistantOpen(true)} className="ui-secondary-action mt-3 py-2.5 text-sm">
            {assistant ? '更换小助理' : '选择一位小助理'}
          </button>
        </section>

        <details className="mx-4 mt-4 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
          <summary className="cursor-pointer text-sm font-medium text-[var(--ui-text)]">日记提示词</summary>
          <p className="mt-2 text-[11px] leading-5 text-[var(--ui-text-3)]">
            小助理写日记时使用。可用占位符：{'{{assistant}}'} {'{{user}}'} {'{{date}}'} {'{{schedule}}'} {'{{chats}}'}。七个栏目的输出格式由系统固定，不需要写进提示词。
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
                onSelect: () => void chooseAssistant(contact.id),
              })),
            ...(settings.assistantContactId
              ? [{ label: '取消小助理', onSelect: () => void chooseAssistant(), danger: true }]
              : []),
          ]}
        />
      )}
    </div>
  )
}
