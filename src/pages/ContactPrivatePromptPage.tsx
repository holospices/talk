import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, MessageSquareText } from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { ProactivePromptEditor } from '../components/ProactivePromptEditor'
import { db } from '../db/db'
import { useSettingsStore } from '../store/useSettingsStore'
import { PROMPT_MODULE_DEFINITIONS, unknownPromptPlaceholders } from '../lib/promptModules'
import { clonePromptModules, promptModulesForContact } from '../lib/promptPresets'
import { displayName } from '../lib/contact'
import { activeUpcomingPlans } from '../lib/memory'
import type { PromptModuleId, PromptModuleSettings } from '../types'

const PRIVATE_MODULE_IDS: PromptModuleId[] = ['chat', 'relationship', 'memory', 'worldview']
const PRIVATE_DEFINITIONS = PROMPT_MODULE_DEFINITIONS.filter((definition) => PRIVATE_MODULE_IDS.includes(definition.id))

type PromptTab = 'reply' | 'proactive'

export function ContactPrivatePromptPage() {
  const { contactId } = useParams()
  const navigate = useNavigate()
  const settings = useSettingsStore()
  const contact = useLiveQuery(() => (contactId ? db.contacts.get(contactId) : undefined), [contactId])
  const [tab, setTab] = useState<PromptTab>('reply')
  const [draft, setDraft] = useState<PromptModuleSettings | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!contact) return
    setDraft(clonePromptModules(promptModulesForContact(contact, settings)))
    // The snapshot is the source of truth for this contact; don't reset on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, contact?.promptSnapshotUpdatedAt])

  const activePlans = contact ? activeUpcomingPlans(contact.upcomingPlans ?? [], new Date()) : []

  function updateTemplate(moduleId: PromptModuleId, templateId: string, value: string) {
    setDraft((current) => current ? {
      ...current,
      [moduleId]: {
        ...current[moduleId],
        templates: { ...current[moduleId].templates, [templateId]: value },
      },
    } : current)
    setNotice('')
    setError('')
  }

  function setModuleEnabled(moduleId: PromptModuleId, enabled: boolean) {
    setDraft((current) => current ? { ...current, [moduleId]: { ...current[moduleId], enabled } } : current)
    setNotice('')
  }

  function validate(): string {
    if (!draft) return '提示词还没有载入'
    for (const definition of PRIVATE_DEFINITIONS) {
      for (const template of definition.templates) {
        const unknown = unknownPromptPlaceholders(definition.id, template.id, draft[definition.id]?.templates?.[template.id] ?? '')
        if (unknown.length) return `${definition.name}／${template.name} 含未知占位符：${unknown.map((key) => `{{${key}}}`).join('、')}`
      }
    }
    return ''
  }

  async function save() {
    if (!contact) return
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError('')
    try {
      await db.contacts.update(contact.id, {
        promptModulesSnapshot: clonePromptModules(draft!),
        promptPresetSourceName: '私聊提示词手动调整',
        promptSnapshotUpdatedAt: Date.now(),
      })
      setNotice('已保存为这位联系人的独立提示词快照，下一轮私聊立即生效')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  function loadGlobalPrompt() {
    setDraft(clonePromptModules(settings.promptModules))
    setNotice('已载入全局当前提示词；点击底部保存后才会覆盖这位联系人')
    setError('')
  }

  if (contact === undefined) return null
  if (contact === null || !contactId) {
    return (
      <div className="ui-page">
        <TopBar title="私聊提示词" showBack />
        <p className="px-4 py-10 text-center text-sm text-[var(--ui-text-3)]">该联系人已被删除</p>
      </div>
    )
  }
  if (!draft) return null

  return (
    <div className="ui-page relative">
      <TopBar title="私聊提示词" showBack />
      <div className="ui-page-scroll">
        <header className="ui-page-intro">
          <p className="ui-page-kicker">{displayName(contact)} · {tab === 'reply' ? '回复结构' : '主动消息结构'}</p>
          <h1 className="ui-page-title">{tab === 'reply' ? '哪些提示词在影响 TA 的回复' : 'AI 为什么会主动找你'}</h1>
          <p className="ui-page-summary">
            {tab === 'reply'
              ? '这里看的是你发消息后 TA 的回复。人物设定和运行时上下文是硬事实；可编辑的模块只影响表达、逻辑和记忆注入方式。'
              : '这里控制 AI 主动发来的消息，所有联系人共用一套设置；和上面的回复提示词分开生效。'}
          </p>
          <div className="mt-3 flex rounded-full bg-[var(--ui-surface-2)] p-1">
            <button
              type="button"
              onClick={() => setTab('reply')}
              className={`flex-1 rounded-full px-3 py-2 text-xs ${tab === 'reply' ? 'bg-[var(--ui-surface)] font-medium text-[var(--ui-text)] shadow-[var(--ui-shadow)]' : 'text-[var(--ui-text-3)]'}`}
            >
              回复提示词
            </button>
            <button
              type="button"
              onClick={() => setTab('proactive')}
              className={`flex-1 rounded-full px-3 py-2 text-xs ${tab === 'proactive' ? 'bg-[var(--ui-surface)] font-medium text-[var(--ui-text)] shadow-[var(--ui-shadow)]' : 'text-[var(--ui-text-3)]'}`}
            >
              主动私聊提示词
            </button>
          </div>
        </header>

        {tab === 'proactive' ? (
          <div className="pb-8">
            <ProactivePromptEditor />
            <div className="mx-4 mt-3">
              <button type="button" onClick={() => void navigate('/ai-requests')} className="ui-secondary-action">查看 AI 请求记录›</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="ui-section-label">影响私聊回复的内容</h2>
            <section className="ui-section-card ui-section-spaced space-y-2.5">
              <StructureRow index="01" title="人物设定" tag="固定" note={contact.systemPrompt.length ? `${contact.systemPrompt.length} 字` : '未填写'} defaultOpen>
                <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--ui-text-2)]">{contact.systemPrompt || '（空）'}</p>
                {settings.adminModeEnabled && <button type="button" onClick={() => navigate(`/contact/${contact.id}/admin`)} className="mt-2 text-[11px] text-[var(--ui-special-ink)]">管理员模式可在这里彻底改写人物设定 ›</button>}
              </StructureRow>
              <StructureRow index="02" title="关系定位与好感度" tag="运行时" note={contact.relationshipBase || '朋友'}>
                <p className="text-xs leading-6 text-[var(--ui-text-2)]">
                  关系定位：{contact.relationshipBase || '朋友'}；动态：{contact.relationshipDynamic || '暂无'}；好感度：{contact.warmth ?? 0}。
                  这些值每轮由关系模块和记忆更新注入，改这里不会直接改数值。
                </p>
              </StructureRow>
              <StructureRow index="03" title="当前情境" tag="运行时" note="时间 / 日程 / 心情 / 最近事件 / 衣着">
                <p className="text-xs leading-6 text-[var(--ui-text-2)]">
                  当前时间、用户资料、TA 的日程、心情、最近社交事件、衣着和约定会在每次请求时重新生成。它们保证角色知道“现在是什么时候、在哪里、刚刚发生了什么”。
                </p>
              </StructureRow>
              <StructureRow index="04" title="记忆" tag="需确认" note={`${contact.memoryFacts ? '有事实记忆' : '暂无事实记忆'} · ${activePlans.length} 个有效约定`}>
                <p className="text-xs leading-6 text-[var(--ui-text-2)]">了解到的信息：{contact.memoryFacts || '（空）'}</p>
                <p className="mt-1 text-xs leading-6 text-[var(--ui-text-2)]">相处状态：{contact.memoryStyle || '（空）'}</p>
                {activePlans.length > 0 && <p className="mt-1 text-xs leading-6 text-[var(--ui-text-2)]">约定：{activePlans.map((plan) => plan.text).join('；')}</p>}
                <button type="button" onClick={() => navigate(`/contact/${contact.id}`)} className="mt-2 text-[11px] text-[var(--ui-special-ink)]">回到名片查看/确认记忆 ›</button>
              </StructureRow>
              <StructureRow index="05" title="世界书" tag="只读" note={contact.worldbookEntryIds?.length ? `绑定 ${contact.worldbookEntryIds.length} 条` : '未单独绑定'}>
                <p className="text-xs leading-6 text-[var(--ui-text-2)]">命中世界观和绑定世界书时，相关内容会作为硬事实插入；调整入口在世界观/资料库页面。</p>
                <button type="button" onClick={() => navigate('/library')} className="mt-2 text-[11px] text-[var(--ui-special-ink)]">打开资料库 ›</button>
              </StructureRow>
              <StructureRow index="06" title="说话风格与逻辑层" tag="可编辑" note="在下方模块中调整">
                <p className="text-xs leading-6 text-[var(--ui-text-2)]">包括身份模板、当前情境模板、全局聊天风格、私聊逻辑层、私聊表达层和媒体提示。它们决定 TA 怎么想、怎么组织句子、语气有多冷或多黏。</p>
              </StructureRow>
              <StructureRow index="07" title="输出协议与工具" tag="固定" note="不可编辑">
                <p className="text-xs leading-6 text-[var(--ui-text-2)]">submit_turn 的 JSON/原生工具协议、分句、心情、表情包和资金/日程等结构由系统固定。改这里会破坏解析，所以不开放编辑。</p>
              </StructureRow>
            </section>

            <h2 className="ui-section-label">可编辑的私聊回复提示词</h2>
            <div className="mx-4 space-y-3">
              {PRIVATE_DEFINITIONS.map((definition) => {
                const config = draft[definition.id]
                return (
                  <section key={definition.id} className="rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] p-4 shadow-[var(--ui-shadow)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="ui-section-title">{definition.name}</p>
                        <p className="ui-section-summary">{definition.description}</p>
                      </div>
                      <ToggleSwitch
                        checked={config.enabled}
                        onChange={(checked) => setModuleEnabled(definition.id, checked)}
                        ariaLabel={`${definition.name}模块开关`}
                      />
                    </div>
                    {definition.id === 'chat' && !config.enabled && (
                      <p className="mt-2 rounded-[var(--ui-radius-control)] bg-[var(--ui-danger-soft)] px-3 py-2 text-[11px] leading-5 text-[var(--ui-danger)]">关闭「对话核心」后私聊请求会直接失败。除非你确定在调试，否则保持开启。</p>
                    )}
                    <div className="mt-3 space-y-2">
                      {definition.templates.map((template) => (
                        <details key={template.id} className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] px-3 py-2">
                          <summary className="cursor-pointer text-xs text-[var(--ui-text-2)]">{template.name} <span className="text-[var(--ui-text-3)]">· {template.placeholders.length ? template.placeholders.map((key) => `{{${key}}}`).join(' ') : '无占位符'}</span></summary>
                          {template.defaultTemplate && (
                            <p className="mt-2 text-[10px] leading-4 text-[var(--ui-text-3)]">默认模板：{template.defaultTemplate.slice(0, 160)}{template.defaultTemplate.length > 160 ? '…' : ''}</p>
                          )}
                          <textarea
                            value={config.templates[template.id] ?? ''}
                            onChange={(event) => updateTemplate(definition.id, template.id, event.target.value)}
                            rows={Math.min(12, Math.max(4, (config.templates[template.id] ?? '').split('\n').length))}
                            className="mt-2 w-full resize-y rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--ui-text)]"
                          />
                        </details>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>

            <div className="mx-4 mt-4 rounded-[var(--ui-radius-card)] bg-[var(--ui-surface-2)] px-4 py-3 text-[11px] leading-5 text-[var(--ui-text-3)]">
              <MessageSquareText size={14} className="mr-1 inline" />
              保存后只会覆盖「{displayName(contact)}」的回复提示词快照，不影响其他联系人。想恢复成全局版本，点下方「载入全局当前提示词」再保存。
            </div>
            <div className="h-20" />
          </>
        )}
      </div>

      {tab === 'reply' && (
        <div className="border-t border-[var(--ui-border-soft)] bg-[var(--ui-surface)] p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
          {error && <p role="alert" className="mb-2 text-xs text-[var(--ui-danger-ink)]">{error}</p>}
          {notice && <p role="status" className="mb-2 text-xs text-[var(--ui-text-2)]">{notice}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={loadGlobalPrompt} className="ui-secondary-action flex-1 py-2.5 text-sm">载入全局当前提示词</button>
            <button type="button" onClick={() => void save()} disabled={saving} className="ui-primary-action flex-1 py-2.5 text-sm font-medium disabled:opacity-50">
              {saving ? '保存中…' : '保存到这位联系人'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StructureRow({
  index,
  title,
  tag,
  note,
  defaultOpen,
  children,
}: {
  index: string
  title: string
  tag: string
  note: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details open={defaultOpen} className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] px-3 py-2.5">
      <summary className="flex cursor-pointer items-center gap-2">
        <span className="font-mono text-[10px] text-[var(--ui-text-3)]">{index}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--ui-text)]">{title}</span>
        <span className="shrink-0 rounded-full bg-[var(--ui-surface)] px-1.5 py-0.5 text-[10px] text-[var(--ui-text-3)]">{tag}</span>
        <span className="hidden shrink-0 text-[10px] text-[var(--ui-text-3)] sm:inline">{note}</span>
        <ChevronRight size={14} className="shrink-0 text-[var(--ui-text-3)]" />
      </summary>
      <div className="mt-2 border-t border-[var(--ui-border-soft)] pt-2">{children}</div>
    </details>
  )
}
