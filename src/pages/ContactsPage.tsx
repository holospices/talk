import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { db } from '../db/db'
import { TopBar } from '../components/TopBar'
import { Avatar } from '../components/Avatar'
import { SearchOverlay } from '../components/SearchOverlay'
import { displayName } from '../lib/contact'
import { isAiTestId } from '../lib/aiTestIsolation'

const EMPTY_ARRAY: never[] = []

export function ContactsPage() {
  const [searching, setSearching] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const navigate = useNavigate()
  const contactsRaw = useLiveQuery(() => db.contacts.toArray(), []) ?? EMPTY_ARRAY
  const groups = useLiveQuery(() => db.contactGroups.orderBy('createdAt').toArray(), []) ?? EMPTY_ARRAY
  const generationTasks = useLiveQuery(() => db.contactGenerationTasks.orderBy('createdAt').toArray(), []) ?? EMPTY_ARRAY
  const contacts = useMemo(
    () => contactsRaw.filter((contact) => !isAiTestId(contact.id)).sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh')),
    [contactsRaw],
  )
  const selectedGroup = groups.find((group) => group.id === selectedGroupId)
  const visibleContacts = selectedGroup
    ? contacts.filter((contact) => selectedGroup.contactIds.includes(contact.id))
    : contacts

  return (
    <div className="relative min-h-full bg-[var(--ui-bg)]">
      <TopBar
        title="联系人"
        showSearch
        onSearchClick={() => setSearching(true)}
        right={
          <div className="flex items-center">
            <button
              onClick={() => navigate('/contact-groups')}
              aria-label="联系人分组"
              className="flex h-9 w-9 items-center justify-center text-gray-700"
            >
              <Users size={19} />
            </button>
            <button
              onClick={() => navigate('/contact/new')}
              aria-label="添加联系人"
              className="flex h-9 w-9 items-center justify-center text-gray-700"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        }
      />

      <div className="bg-[var(--ui-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--ui-border-soft)] px-4 py-2 text-xs text-[var(--ui-text-3)]"><span>{selectedGroup ? `分组：${selectedGroup.name}` : '我的联系人'}</span><span>{visibleContacts.length} 人</span></div>
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--ui-border-soft)] px-3 py-2">
          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${selectedGroupId === null ? 'bg-[var(--ui-action)] text-[var(--ui-on-action)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-2)]'}`}
          >
            全部
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setSelectedGroupId(group.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${selectedGroupId === group.id ? 'bg-[var(--ui-action)] text-[var(--ui-on-action)]' : 'bg-[var(--ui-surface-2)] text-[var(--ui-text-2)]'}`}
            >
              {group.name}
            </button>
          ))}
          <button type="button" onClick={() => navigate('/contact-groups')} className="shrink-0 rounded-full border border-dashed border-[var(--ui-border)] px-3 py-1.5 text-xs text-[var(--ui-text-3)]">管理分组</button>
        </div>
        <button
          onClick={() => navigate('/contact/new')}
          className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left active:bg-gray-50"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ui-special-soft)] text-[var(--ui-special-ink)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="text-[15px] text-gray-900">添加联系人</span>
        </button>

        {generationTasks.filter((task) => !['cancelled', 'completed'].includes(task.status)).map((task) => (
          <button
            key={task.id}
            onClick={() => navigate(`/contact-generation/${task.id}`)}
            className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-left active:bg-gray-50"
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${task.status === 'failed' ? 'bg-red-50 text-red-500' : task.status === 'awaiting_review' ? 'bg-green-50 text-green-600' : 'bg-[var(--ui-special-soft)] text-[var(--ui-special-ink)]'}`}>
              {task.status === 'failed' ? '!' : task.status === 'awaiting_review' ? '✓' : '◌'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] text-gray-900">{task.experienceMode === 'immersive' ? '正在寻找联系人' : task.method === 'precision' ? '精细创建 · 女娲模式' : '正在生成联系人'}</p>
              <p className={`truncate text-xs ${task.status === 'failed' ? 'text-red-500' : task.status === 'awaiting_review' ? 'text-green-600' : 'text-gray-400'}`}>{task.stageLabel}</p>
            </div>
          </button>
        ))}

        {visibleContacts.length === 0 && generationTasks.filter((task) => !['cancelled', 'completed'].includes(task.status)).length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--ui-text-3)]">{selectedGroup ? '这个分组还没有联系人' : '还没有联系人'}</p>
        ) : (
          visibleContacts.map((c) => (
            <button
              key={c.id}
              onClick={() => navigate(`/contact/${c.id}`)}
              className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-left active:bg-gray-50"
            >
              <Avatar avatar={c.avatar} color={c.avatarColor} size={44} />
              <span className="ui-font-display text-[15px] text-gray-900">{displayName(c)}</span>
            </button>
          ))
        )}
      </div>

      {searching && <SearchOverlay onClose={() => setSearching(false)} />}
    </div>
  )
}
