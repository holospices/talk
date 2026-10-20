import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { v4 as uuid } from 'uuid'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { Avatar } from '../components/Avatar'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { db } from '../db/db'
import { useSettingsStore } from '../store/useSettingsStore'
import { useModuleEnabled } from '../features'
import { displayName } from '../lib/contact'
import { toDateKey } from '../lib/time'
import { DEFAULT_ASSISTANT_REMINDER_PROMPT } from '../lib/assistantDefaults'
import {
  clockToMinute,
  isUserInDndNow,
  minuteToClock,
  nextAssistantReminder,
  personalScheduleDurationMinutes,
  personalScheduleItemAt,
  replacePersonalSchedule,
} from '../lib/assistant'
import type { PersonalScheduleItem } from '../types'

interface ScheduleDraft {
  key: string
  id: string
  start: string
  end: string
  activity: string
  remind: boolean
  remindMinutes: number
  dnd: boolean
  createdAt: number
}

function toDraft(item: PersonalScheduleItem): ScheduleDraft {
  return {
    key: item.id,
    id: item.id,
    start: minuteToClock(item.startMinute),
    end: minuteToClock(item.endMinute),
    activity: item.activity,
    remind: item.remind,
    remindMinutes: item.remindMinutes,
    dnd: item.dnd,
    createdAt: item.createdAt,
  }
}

function isOvernightDraft(row: ScheduleDraft): boolean {
  const start = clockToMinute(row.start)
  const end = clockToMinute(row.end)
  return start !== null && end !== null && end <= start
}

export function MySchedulePage() {
  const navigate = useNavigate()
  const settings = useSettingsStore()
  const proactiveEnabled = useModuleEnabled('proactiveChat')
  const stored = useLiveQuery(() => db.personalScheduleItems.toArray(), [])
  const assistant = useLiveQuery(
    () => (settings.assistantContactId ? db.contacts.get(settings.assistantContactId) : undefined),
    [settings.assistantContactId],
  )
  const [rows, setRows] = useState<ScheduleDraft[] | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [promptDraft, setPromptDraft] = useState(settings.assistantReminderPrompt)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (loaded || !stored) return
    setRows([...stored].sort((a, b) => a.startMinute - b.startMinute).map(toDraft))
    setLoaded(true)
  }, [stored, loaded])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const savedItems = stored ?? []
  const current = personalScheduleItemAt(savedItems, now)
  const dnd = isUserInDndNow(savedItems, now)
  const nextReminder = nextAssistantReminder(savedItems, now)
  const nextReminderLabel = nextReminder
    ? `${toDateKey(new Date(nextReminder.dueAt)) === toDateKey(now) ? '' : '明天 '}${minuteToClock(new Date(nextReminder.dueAt).getHours() * 60 + new Date(nextReminder.dueAt).getMinutes())}`
    : ''

  function addRow() {
    setLoaded(true)
    setRows((currentRows) => {
      const list = currentRows ?? []
      const last = list[list.length - 1]
      const startMinute = last ? ((clockToMinute(last.end) ?? 540) + 1440) % 1440 : 9 * 60
      const endMinute = (startMinute + 60) % 1440
      return [...list, {
        key: uuid(),
        id: uuid(),
        start: minuteToClock(startMinute),
        end: minuteToClock(endMinute),
        activity: '',
        remind: false,
        remindMinutes: settings.assistantDefaultRemindMinutes,
        dnd: false,
        createdAt: Date.now(),
      }]
    })
    setError('')
    setMessage('')
  }

  function updateRow(key: string, patch: Partial<ScheduleDraft>) {
    setRows((currentRows) => currentRows?.map((row) => row.key === key ? { ...row, ...patch } : row) ?? null)
    setMessage('')
  }

  function removeRow(key: string) {
    if (!window.confirm('删除这项日程？')) return
    setRows((currentRows) => currentRows?.filter((row) => row.key !== key) ?? null)
    setError('')
    setMessage('')
  }

  async function save() {
    if (!rows) return
    setError('')
    setMessage('')
    const items: PersonalScheduleItem[] = []
    for (const [index, row] of rows.entries()) {
      const start = clockToMinute(row.start)
      const end = clockToMinute(row.end)
      const activity = row.activity.trim()
      if (start === null || end === null) {
        setError(`第 ${index + 1} 项的时间格式不正确`)
        return
      }
      if (start === end) {
        setError(`第 ${index + 1} 项的开始和结束时间不能相同`)
        return
      }
      if (!activity) {
        setError(`第 ${index + 1} 项还没有填写活动内容`)
        return
      }
      items.push({
        id: row.id,
        startMinute: start,
        endMinute: end,
        activity: activity.slice(0, 40),
        remind: row.remind,
        remindMinutes: Math.max(0, Math.min(180, Math.round(row.remindMinutes))),
        dnd: row.dnd,
        createdAt: row.createdAt,
        updatedAt: Date.now(),
      })
    }
    setSaving(true)
    try {
      await replacePersonalSchedule(items)
      setRows(items.sort((a, b) => a.startMinute - b.startMinute).map(toDraft))
      setMessage('日程已保存，每天默认按这张表执行')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  function saveReminderPrompt() {
    settings.setSettings({ assistantReminderPrompt: promptDraft })
    setMessage('提醒提示词已保存')
    setError('')
  }

  function resetReminderPrompt() {
    setPromptDraft(DEFAULT_ASSISTANT_REMINDER_PROMPT)
    settings.setSettings({ assistantReminderPrompt: DEFAULT_ASSISTANT_REMINDER_PROMPT })
    setMessage('已恢复默认提醒提示词')
    setError('')
  }

  return (
    <div className="ui-page relative">
      <TopBar title="我的日程" showBack />
      <div className="ui-page-scroll">
        <header className="ui-page-intro">
          <p className="ui-page-kicker">每天重复的作息表</p>
          <h1 className="ui-page-title">把一天安排成你想要的样子</h1>
          <p className="ui-page-summary">
            这里填写的是每天默认执行的日程。需要提醒时由小助理提前通知你；免打扰时段里其他联系人不能主动发消息，但小助理的提醒仍会送达。
          </p>
        </header>

        <section className="ui-section-card ui-section-spaced">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {assistant ? (
                <Avatar avatar={assistant.avatar} color={assistant.avatarColor} size={44} />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] text-[var(--ui-text-3)]">
                  <CalendarDays size={20} />
                </span>
              )}
              <div className="min-w-0">
                <p className="ui-section-title truncate">{assistant ? displayName(assistant) : '还没有小助理'}</p>
                <p className="ui-section-summary">{assistant ? '负责定时提醒和每晚写日记' : '打开联系人名片，点「设为小助理」'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(assistant ? `/contact/${assistant.id}` : '/contacts')}
              className="shrink-0 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] px-3 py-2 text-xs text-[var(--ui-text-2)]"
            >
              {assistant ? '查看' : '去设置'}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] px-3 py-2.5">
              <p className="text-[11px] text-[var(--ui-text-3)]">现在</p>
              <p className="mt-1 text-[var(--ui-text-2)]">{current?.activity || '空闲'}</p>
            </div>
            <div className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] px-3 py-2.5">
              <p className="text-[11px] text-[var(--ui-text-3)]">状态</p>
              <p className="mt-1 text-[var(--ui-text-2)]">
                {dnd
                  ? '免打扰中'
                  : nextReminder
                    ? `下次提醒 ${nextReminderLabel}`
                    : '暂无提醒'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--ui-border-soft)] pt-3">
            <div>
              <p className="text-xs font-medium text-[var(--ui-text-2)]">任命时发送感想</p>
              <p className="mt-0.5 text-[11px] leading-5 text-[var(--ui-text-3)]">开启后，新任命的小助理会在私聊里发一条感想。</p>
            </div>
            <ToggleSwitch
              checked={settings.assistantReactionEnabled}
              onChange={(checked) => settings.setSettings({ assistantReactionEnabled: checked })}
              ariaLabel="任命小助理时发送感想"
            />
          </div>
        </section>

        <h2 className="ui-section-label">每日日程</h2>
        {!proactiveEnabled && (
          <p className="mx-4 mb-2 text-[11px] leading-5 text-[var(--ui-text-3)]">
            免打扰之外，联系人是否主动发消息仍由「AI自主行为」模块控制。
            <button type="button" onClick={() => navigate('/modules')} className="ml-1 text-[var(--ui-special-ink)]">去设置 ›</button>
          </p>
        )}
        <div className="mx-4 space-y-2">
          {(rows ?? []).map((row, index) => {
            const overnight = isOvernightDraft(row)
            return (
              <section key={row.key} className="rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-3 shadow-[var(--ui-shadow)]">
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={row.start}
                    step={300}
                    aria-label={`第 ${index + 1} 项开始时间`}
                    onChange={(event) => updateRow(row.key, { start: event.target.value })}
                    className="w-[94px] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-2 text-sm text-[var(--ui-text)]"
                  />
                  <span className="text-xs text-[var(--ui-text-3)]">至</span>
                  <input
                    type="time"
                    value={row.end}
                    step={300}
                    aria-label={`第 ${index + 1} 项结束时间`}
                    onChange={(event) => updateRow(row.key, { end: event.target.value })}
                    className="w-[94px] rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-2 text-sm text-[var(--ui-text)]"
                  />
                  {overnight && <span className="rounded-full bg-[var(--ui-accent-soft)] px-2 py-0.5 text-[10px] text-[var(--ui-action)]">次日</span>}
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    aria-label={`删除第 ${index + 1} 项`}
                    className="ml-auto flex h-8 w-8 items-center justify-center text-[var(--ui-text-3)]"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <input
                  value={row.activity}
                  onChange={(event) => updateRow(row.key, { activity: event.target.value })}
                  maxLength={40}
                  placeholder="这段时间做什么？例如：上班、午休、健身"
                  className="mt-2 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm text-[var(--ui-text)]"
                />

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2 text-xs text-[var(--ui-text-2)]">
                    需要提醒
                    <ToggleSwitch
                      size="sm"
                      checked={row.remind}
                      onChange={(checked) => updateRow(row.key, { remind: checked })}
                      ariaLabel={`第 ${index + 1} 项需要提醒`}
                    />
                  </label>
                  {row.remind && (
                    <label className="flex items-center gap-1.5 text-xs text-[var(--ui-text-2)]">
                      提前
                      <input
                        type="number"
                        min={0}
                        max={180}
                        step={5}
                        value={row.remindMinutes}
                        onChange={(event) => updateRow(row.key, { remindMinutes: Number(event.target.value) })}
                        className="w-16 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1.5 text-center text-sm text-[var(--ui-text)]"
                      />
                      分钟
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs text-[var(--ui-text-2)]">
                    免打扰
                    <ToggleSwitch
                      size="sm"
                      checked={row.dnd}
                      onChange={(checked) => updateRow(row.key, { dnd: checked })}
                      ariaLabel={`第 ${index + 1} 项免打扰`}
                    />
                  </label>
                  <span className="ml-auto text-[11px] text-[var(--ui-text-3)]">共 {personalScheduleDurationMinutes({ startMinute: clockToMinute(row.start) ?? 0, endMinute: clockToMinute(row.end) ?? 0 })} 分钟</span>
                </div>
              </section>
            )
          })}

          {(rows ?? []).length === 0 && (
            <div className="ui-empty-state">
              <p>还没有日程。先添加一项，比如 09:00-12:00 上班。</p>
            </div>
          )}

          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--ui-radius-card)] border border-dashed border-[var(--ui-border)] bg-[var(--ui-surface)] py-3 text-sm text-[var(--ui-text-2)]"
          >
            <Plus size={16} />添加一项
          </button>
        </div>

        <h2 className="ui-section-label">提醒设置</h2>
        <div className="ui-list-card">
          <div className="ui-list-row">
            <span className="ui-list-label">新日程默认提前</span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={180}
                step={5}
                value={settings.assistantDefaultRemindMinutes}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  settings.setSettings({ assistantDefaultRemindMinutes: Number.isFinite(value) ? Math.max(0, Math.min(180, value)) : 0 })
                }}
                className="w-16 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-2 py-1.5 text-center text-sm text-[var(--ui-text)]"
              />
              <span className="text-xs text-[var(--ui-text-3)]">分钟</span>
            </span>
          </div>
        </div>

        <section className="ui-section-card ui-section-spaced">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="ui-section-title">提醒提示词</h3>
              <p className="ui-section-summary">小助理生成提醒文案时使用，可以按你的喜好改。</p>
            </div>
            <button type="button" onClick={resetReminderPrompt} className="shrink-0 text-xs text-[var(--ui-special-ink)]">恢复默认</button>
          </div>
          <textarea
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            rows={7}
            className="mt-3 w-full resize-y rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm leading-6 text-[var(--ui-text)]"
          />
          <p className="mt-2 text-[11px] leading-5 text-[var(--ui-text-3)]">
            可用占位符：{'{{assistant}}'} {'{{user}}'} {'{{activity}}'} {'{{start}}'} {'{{end}}'} {'{{minutes}}'} {'{{minutesText}}'} {'{{time}}'} {'{{date}}'}
          </p>
          <button type="button" onClick={saveReminderPrompt} className="ui-primary-action mt-3 w-full py-2.5 text-sm font-medium">保存提示词</button>
        </section>

        <div className="mx-4 mt-4">
          <button type="button" onClick={() => navigate('/diary')} className="ui-secondary-action">查看小助理日记 ›</button>
        </div>
      </div>

      <div className="border-t border-[var(--ui-border-soft)] bg-[var(--ui-surface)] p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
        {error && <p role="alert" className="mb-2 text-xs text-[var(--ui-danger-ink)]">{error}</p>}
        {message && <p role="status" className="mb-2 text-xs text-[var(--ui-text-2)]">{message}</p>}
        <button type="button" onClick={() => void save()} disabled={saving || !rows} className="ui-primary-action w-full py-3 text-sm font-medium disabled:opacity-50">
          {saving ? '保存中…' : '保存日程'}
        </button>
      </div>
    </div>
  )
}
