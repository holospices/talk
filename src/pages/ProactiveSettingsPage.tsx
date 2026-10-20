import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { useSettingsStore } from '../store/useSettingsStore'
import { DEFAULT_PROACTIVE_CONTEXT_PROMPT, DEFAULT_PROACTIVE_EXTRA_INSTRUCTION, DEFAULT_PROACTIVE_TOPIC_SOURCES } from '../lib/proactiveDefaults'
import type { ProactiveTopicSources } from '../lib/proactiveDefaults'

const DAILY_CAP_MAX = 16 // slider position: 1-15 = real, 16 = ∞
const STORED_INFINITE = 999 // stored value for "infinite"

function SliderRow({
  label,
  desc,
  value,
  min,
  max,
  step,
  unit,
  infiniteAtMax,
  displayValue: customDisplay,
  onChange,
}: {
  label: string
  desc?: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  infiniteAtMax?: boolean
  displayValue?: string
  onChange: (v: number) => void
}) {
  const displayValue = customDisplay ?? (infiniteAtMax && value >= max ? '∞' : `${value}${unit}`)
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium text-gray-800">{label}</span>
        <span className="text-sm text-gray-500">{displayValue}</span>
      </div>
      {desc && <p className="mt-0.5 text-[11px] text-gray-400">{desc}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value > max ? max : value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-[var(--ui-special)]"
      />
    </div>
  )
}

export function ProactiveSettingsPage() {
  const settings = useSettingsStore()
  const navigate = useNavigate()
  const [contextDraft, setContextDraft] = useState(settings.proactiveContextPrompt)
  const [extraDraft, setExtraDraft] = useState(settings.proactiveExtraInstruction)
  const [promptNotice, setPromptNotice] = useState('')
  const {
    proactiveDailyCap,
    proactiveProbability,
    proactiveSilenceThresholdMs,
    proactiveCooldownMs,
    proactiveMomentsMax,
    proactiveTickIntervalMs,
    momentsRefreshIntervalMs,
    momentsCooldownMs,
    moodExpiryMs,
    setSettings,
  } = settings
  const sources = settings.proactiveTopicSources ?? DEFAULT_PROACTIVE_TOPIC_SOURCES
  const sourceLabels: Array<[keyof ProactiveTopicSources, string]> = [
    ['events', '最近发生的事'],
    ['memories', '记忆与未接话题'],
    ['plans', '约定/计划'],
    ['schedule', '当前日程'],
    ['career', '职业日常'],
    ['casual', '轻量日常'],
  ]

  function toggleSource(key: keyof ProactiveTopicSources) {
    setSettings({ proactiveTopicSources: { ...sources, [key]: !sources[key] } })
  }

  function saveProactivePrompts() {
    setSettings({ proactiveContextPrompt: contextDraft, proactiveExtraInstruction: extraDraft })
    setPromptNotice('主动私聊提示词已保存，下一轮主动消息生效')
  }

  function resetProactivePrompts() {
    setContextDraft(DEFAULT_PROACTIVE_CONTEXT_PROMPT)
    setExtraDraft(DEFAULT_PROACTIVE_EXTRA_INSTRUCTION)
    setSettings({ proactiveContextPrompt: DEFAULT_PROACTIVE_CONTEXT_PROMPT, proactiveExtraInstruction: DEFAULT_PROACTIVE_EXTRA_INSTRUCTION })
    setPromptNotice('已恢复默认主动私聊提示词')
  }

  return (
    <div className="ui-page relative">
      <TopBar title="自主行为设置" showBack />
      <div className="ui-page-scroll">
        <header className="ui-page-intro">
          <p className="ui-page-kicker">后台节奏</p>
          <h1 className="ui-page-title">控制主动联系的频率</h1>
          <p className="ui-page-summary">先调整聊天触发与刷新节奏，心情持续时间作为独立的状态配置放在后面。</p>
        </header>
        <p className="ui-section-label">主动聊天与朋友圈</p>
        <div className="ui-list-card">
          <SliderRow
            label="每天主动聊天次数上限"
            desc="1~15次，拉到最右为∞不限制（会产生较多API费用）"
            value={proactiveDailyCap >= STORED_INFINITE ? DAILY_CAP_MAX : proactiveDailyCap}
            min={1}
            max={DAILY_CAP_MAX}
            step={1}
            unit="次"
            infiniteAtMax
            onChange={(v) => setSettings({ proactiveDailyCap: v >= DAILY_CAP_MAX ? STORED_INFINITE : v })}
          />
          <div className="border-t border-gray-50" />
          <SliderRow
            label="触发概率"
            desc="每次后台检查时 触发主动聊天的概率"
            value={Math.round(proactiveProbability * 100)}
            min={5}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => setSettings({ proactiveProbability: v / 100 })}
          />
          <div className="border-t border-gray-50" />
          <SliderRow
            label="沉默阈值"
            desc="至少沉默多久才会考虑主动找你"
            value={Math.round(proactiveSilenceThresholdMs / (60 * 1000))}
            min={5}
            max={120}
            step={5}
            unit="分钟"
            onChange={(v) => setSettings({ proactiveSilenceThresholdMs: v * 60 * 1000 })}
          />
          <div className="border-t border-gray-50" />
          <SliderRow
            label="单人冷却时间"
            desc="同一个联系人多久内不会重复主动找你"
            value={Math.round(proactiveCooldownMs / (60 * 1000))}
            min={10}
            max={2880}
            step={10}
            unit="分钟"
            displayValue={`${Math.round(proactiveCooldownMs / (60 * 60 * 1000) * 10) / 10} 小时`}
            onChange={(v) => setSettings({ proactiveCooldownMs: v * 60 * 1000 })}
          />
          <div className="border-t border-gray-50" />
          <SliderRow
            label="每次朋友圈刷新数量"
            desc="后台定时刷新时 最多让几个联系人发朋友圈"
            value={proactiveMomentsMax}
            min={1}
            max={10}
            step={1}
            unit="人"
            onChange={(v) => setSettings({ proactiveMomentsMax: v })}
          />
          <div className="border-t border-gray-50" />
          <SliderRow
            label="朋友圈自动刷新间隔"
            desc="后台每隔多久尝试刷新一次朋友圈；手动刷新不受此限制"
            value={Math.round(momentsRefreshIntervalMs / (60 * 1000))}
            min={30}
            max={720}
            step={30}
            unit="分钟"
            displayValue={`${Math.round(momentsRefreshIntervalMs / (60 * 60 * 1000) * 10) / 10} 小时`}
            onChange={(v) => setSettings({ momentsRefreshIntervalMs: v * 60 * 1000 })}
          />
          <div className="border-t border-gray-50" />
          <SliderRow
            label="单人朋友圈冷却"
            desc="同一个联系人发过朋友圈后，至少多久内不会再次发圈"
            value={Math.round(momentsCooldownMs / (60 * 1000))}
            min={30}
            max={1440}
            step={30}
            unit="分钟"
            displayValue={`${Math.round(momentsCooldownMs / (60 * 60 * 1000) * 10) / 10} 小时`}
            onChange={(v) => setSettings({ momentsCooldownMs: v * 60 * 1000 })}
          />
          <div className="border-t border-gray-50" />
          <SliderRow
            label="后台检查间隔"
            desc="后台定时器多久检查一次（影响主动聊天和朋友圈刷新的响应速度）"
            value={Math.round(proactiveTickIntervalMs / (60 * 1000))}
            min={1}
            max={30}
            step={1}
            unit="分钟"
            onChange={(v) => setSettings({ proactiveTickIntervalMs: v * 60 * 1000 })}
          />
        </div>

        <p className="ui-section-label">主动私聊提示词</p>
        <div className="ui-list-card">
          <div className="px-4 py-3">
            <p className="text-sm font-medium text-gray-800">素材来源</p>
            <p className="mt-0.5 text-[11px] text-gray-400">关闭的来源不会用于主动开启对话；至少保留一个来源，否则不会产生主动消息。</p>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {sourceLabels.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-2 text-xs text-gray-700">
                  {label}
                  <ToggleSwitch
                    size="sm"
                    checked={sources[key]}
                    onChange={() => toggleSource(key)}
                    ariaLabel={`主动私聊素材：${label}`}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

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

        <div className="mx-4 mt-3">
          <button type="button" onClick={() => navigate('/ai-requests')} className="ui-secondary-action">查看 AI 请求记录（可筛选主动私聊）›</button>
        </div>

        <p className="ui-section-label">状态持续时间</p>
        <div className="ui-list-card">
          <SliderRow
            label="心情持续时间"
            desc="AI表达的心情（如开心、吃醋、生气）持续多久后自动消失"
            value={Math.round(moodExpiryMs / (60 * 1000))}
            min={5}
            max={120}
            step={5}
            unit="分钟"
            onChange={(v) => setSettings({ moodExpiryMs: v * 60 * 1000 })}
          />
        </div>

        <div className="mx-4 mb-2 mt-6">
          <button
            onClick={() =>
              setSettings({
                proactiveDailyCap: 3,
                proactiveProbability: 0.25,
                proactiveSilenceThresholdMs: 45 * 60 * 1000,
                proactiveCooldownMs: 6 * 60 * 60 * 1000,
                proactiveMomentsMax: 3,
                proactiveTickIntervalMs: 5 * 60 * 1000,
                momentsRefreshIntervalMs: 3 * 60 * 60 * 1000,
                momentsCooldownMs: 3 * 60 * 60 * 1000,
              })
            }
            className="ui-secondary-action"
          >
            恢复默认
          </button>
        </div>
      </div>
    </div>
  )
}
