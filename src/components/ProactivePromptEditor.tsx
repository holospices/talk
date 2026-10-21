import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ToggleSwitch } from './ToggleSwitch'
import { db } from '../db/db'
import { displayName } from '../lib/contact'
import { useSettingsStore } from '../store/useSettingsStore'
import { buildProactiveContext } from '../lib/proactivePrompt'
import {
  DEFAULT_PROACTIVE_CONTEXT_PROMPT,
  DEFAULT_PROACTIVE_EXTRA_INSTRUCTION,
  DEFAULT_PROACTIVE_TOPIC_SOURCES,
  PROACTIVE_SOURCE_DEFINITIONS,
} from '../lib/proactiveDefaults'
import type { Contact } from '../types'
import type { ProactiveTopicSources } from '../lib/proactiveDefaults'

/** Global AI-initiated message prompt editor, shared by Proactive settings and the contact prompt page. */
export function ProactivePromptEditor() {
  const settings = useSettingsStore()
  const [contextDraft, setContextDraft] = useState(settings.proactiveContextPrompt)
  const [extraDraft, setExtraDraft] = useState(settings.proactiveExtraInstruction)
  const [promptNotice, setPromptNotice] = useState('')
  const [previewContactId, setPreviewContactId] = useState('')
  const [previewSourceKey, setPreviewSourceKey] = useState<keyof ProactiveTopicSources>('casual')
  const [previewNow] = useState(() => Date.now())
  const contacts = useLiveQuery(() => db.contacts.orderBy('createdAt').toArray(), []) ?? []
  const sources = settings.proactiveTopicSources ?? DEFAULT_PROACTIVE_TOPIC_SOURCES
  const previewContact = contacts.find((contact) => contact.id === previewContactId) ?? contacts[0]
  const previewDefinition = PROACTIVE_SOURCE_DEFINITIONS.find((definition) => definition.key === previewSourceKey) ?? PROACTIVE_SOURCE_DEFINITIONS[PROACTIVE_SOURCE_DEFINITIONS.length - 1]
  const previewContext = buildProactiveContext(
    previewContact ?? ({ name: '示例联系人', proactiveTopicHistory: [] } as unknown as Contact),
    { topic: previewDefinition.exampleTopic, source: previewDefinition.source, createdAt: previewNow },
    { proactiveContextPrompt: contextDraft, proactiveExtraInstruction: extraDraft, userNickname: settings.userNickname },
    previewNow,
  )

  function toggleSource(key: keyof ProactiveTopicSources) {
    settings.setSettings({ proactiveTopicSources: { ...sources, [key]: !sources[key] } })
  }

  function saveProactivePrompts() {
    settings.setSettings({ proactiveContextPrompt: contextDraft, proactiveExtraInstruction: extraDraft })
    setPromptNotice('主动私聊提示词已保存，下一轮主动消息生效')
  }

  function resetProactivePrompts() {
    setContextDraft(DEFAULT_PROACTIVE_CONTEXT_PROMPT)
    setExtraDraft(DEFAULT_PROACTIVE_EXTRA_INSTRUCTION)
    settings.setSettings({ proactiveContextPrompt: DEFAULT_PROACTIVE_CONTEXT_PROMPT, proactiveExtraInstruction: DEFAULT_PROACTIVE_EXTRA_INSTRUCTION })
    setPromptNotice('已恢复默认主动私聊提示词')
  }

  return (
    <div className="space-y-3">
      <p className="ui-section-label">主动私聊提示词（所有联系人共用）</p>
      <div className="ui-list-card">
        <div className="px-4 py-3">
          <p className="text-sm font-medium text-gray-800">素材来源</p>
          <p className="mt-0.5 text-[11px] text-gray-400">关闭的来源不会用于主动开启对话；至少保留一个来源，否则不会产生主动消息。</p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
            {PROACTIVE_SOURCE_DEFINITIONS.map((definition) => (
              <label key={definition.key} className="flex items-center justify-between gap-2 text-xs text-gray-700">
                {definition.label}
                <ToggleSwitch
                  size="sm"
                  checked={sources[definition.key]}
                  onChange={() => toggleSource(definition.key)}
                  ariaLabel={`主动私聊素材：${definition.label}`}
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      <section className="ui-section-card ui-section-spaced">
        <h3 className="ui-section-title">每个来源具体提供什么</h3>
        <p className="ui-section-summary">这些开关不是六段独立的提示词，只决定 <code>{'{{topic}}'}</code> 里填入什么素材。最终文字 = 下面的「主动消息上下文」+ 素材 + 「额外要求」。</p>
        <div className="mt-3 space-y-2">
          {PROACTIVE_SOURCE_DEFINITIONS.map((definition) => (
            <details key={definition.key} className="rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] px-3 py-2">
              <summary className="flex cursor-pointer items-center gap-2">
                <span className="min-w-0 flex-1 text-xs font-medium text-[var(--ui-text)]">{definition.label}</span>
                <span className="shrink-0 text-[10px] text-[var(--ui-text-3)]">{'{{source}}'} = {definition.sourceLabel ?? definition.source}</span>
              </summary>
              <p className="mt-2 text-xs leading-5 text-[var(--ui-text-2)]">{definition.description}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--ui-text-2)]"><span className="text-[var(--ui-text-3)]">素材示例：</span>{definition.exampleTopic}</p>
              <button
                type="button"
                onClick={() => {
                  setPreviewSourceKey(definition.key)
                  document.getElementById('proactive-preview')?.scrollIntoView({ block: 'start' })
                }}
                className="mt-2 text-[11px] text-[var(--ui-special-ink)]"
              >
                用这个来源预览最终提示词 ›
              </button>
            </details>
          ))}
        </div>
      </section>

      <section className="ui-section-card ui-section-spaced">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="ui-section-title">主动消息上下文</h3>
            <p className="ui-section-summary">决定 AI 为什么、以什么素材主动找你。可用占位符：{'{{topic}}'} {'{{source}}'} {'{{recentTopics}}'} {'{{contactName}}'} {'{{userName}}'} {'{{time}}'}。</p>
          </div>
          <button type="button" onClick={() => setContextDraft(DEFAULT_PROACTIVE_CONTEXT_PROMPT)} className="shrink-0 text-xs text-[var(--ui-special-ink)]">恢复默认</button>
        </div>
        <textarea
          value={contextDraft}
          onChange={(event) => { setContextDraft(event.target.value); setPromptNotice('') }}
          rows={7}
          className="mt-3 w-full resize-y rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[var(--ui-text)]"
        />
      </section>

      <section className="ui-section-card ui-section-spaced">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="ui-section-title">额外要求（只对主动消息）</h3>
            <p className="ui-section-summary">这段会追加在主动消息上下文之后，用来约束开场方式、长度和语气；不会影响你主动发消息后的正常回复。</p>
          </div>
          <button type="button" onClick={() => setExtraDraft(DEFAULT_PROACTIVE_EXTRA_INSTRUCTION)} className="shrink-0 text-xs text-[var(--ui-special-ink)]">恢复默认</button>
        </div>
        <textarea
          value={extraDraft}
          onChange={(event) => { setExtraDraft(event.target.value); setPromptNotice('') }}
          rows={5}
          className="mt-3 w-full resize-y rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm leading-6 text-[var(--ui-text)]"
        />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={saveProactivePrompts} className="ui-primary-action flex-1 py-2.5 text-sm font-medium">保存主动私聊提示词</button>
          <button type="button" onClick={resetProactivePrompts} className="ui-secondary-action flex-1 py-2.5 text-sm">全部恢复默认</button>
        </div>
        {promptNotice && <p role="status" className="mt-2 text-xs text-[var(--ui-text-2)]">{promptNotice}</p>}
      </section>

      <section id="proactive-preview" className="ui-section-card ui-section-spaced">
        <h3 className="ui-section-title">最终提示词预览</h3>
        <p className="ui-section-summary">用当前草稿、选中的来源和真实联系人的最近主动话题渲染；这里只是预览，不会真的发送。改上面的上下文或额外要求会立即反映在这里。</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-[var(--ui-text-3)]">预览来源
            <select
              value={previewSourceKey}
              onChange={(event) => setPreviewSourceKey(event.target.value as keyof ProactiveTopicSources)}
              className="mt-1 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)]"
            >
              {PROACTIVE_SOURCE_DEFINITIONS.map((definition) => <option key={definition.key} value={definition.key}>{definition.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-[var(--ui-text-3)]">预览联系人
            <select
              value={previewContactId || contacts[0]?.id || ''}
              onChange={(event) => setPreviewContactId(event.target.value)}
              className="mt-1 w-full rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)]"
            >
              {contacts.length === 0 && <option value="">示例联系人</option>}
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{displayName(contact)}</option>)}
            </select>
          </label>
        </div>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-[var(--ui-radius-control)] bg-[var(--ui-surface-2)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ui-text)]">{previewContext}</pre>
      </section>
    </div>
  )
}
