import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { v4 as uuid } from 'uuid'
import { Plus, Trash2, Users } from 'lucide-react'
import { TopBar } from '../components/TopBar'
import { Avatar } from '../components/Avatar'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { db } from '../db/db'
import { displayName } from '../lib/contact'
import { isAiTestId } from '../lib/aiTestIsolation'
import type { ContactGroup } from '../types'

const EMPTY_LIST: never[] = []

export function ContactGroupsPage() {
  const groups = useLiveQuery(() => db.contactGroups.orderBy('createdAt').toArray(), []) ?? EMPTY_LIST
  const contactsRaw = useLiveQuery(() => db.contacts.toArray(), []) ?? EMPTY_LIST
  const contacts = useMemo(
    () => contactsRaw.filter((contact) => !isAiTestId(contact.id)).sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh')),
    [contactsRaw],
  )
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function createGroup() {
    const value = name.trim()
    if (!value) {
      setError('先给分组起一个名字')
      return
    }
    if (groups.some((group) => group.name === value)) {
      setError('已经有同名分组了')
      return
    }
    const now = Date.now()
    await db.contactGroups.add({ id: uuid(), name: value, contactIds: [], createdAt: now, updatedAt: now })
    setName('')
    setError('')
  }

  async function toggleMember(group: ContactGroup, contactId: string) {
    const next = group.contactIds.includes(contactId)
      ? group.contactIds.filter((id) => id !== contactId)
      : [...group.contactIds, contactId]
    await db.contactGroups.update(group.id, { contactIds: next, updatedAt: Date.now() })
  }

  async function renameGroup(group: ContactGroup) {
    const value = window.prompt('新的分组名称', group.name)?.trim()
    if (!value || value === group.name) return
    if (groups.some((item) => item.id !== group.id && item.name === value)) {
      setError('已经有同名分组了')
      return
    }
    await db.contactGroups.update(group.id, { name: value, updatedAt: Date.now() })
    setError('')
  }

  async function removeGroup(group: ContactGroup) {
    if (!window.confirm(`删除分组「${group.name}」？联系人不会被删除。`)) return
    await db.contactGroups.delete(group.id)
    if (editingId === group.id) setEditingId(null)
  }

  return (
    <div className="ui-page relative">
      <TopBar title="联系人分组" showBack />
      <div className="ui-page-scroll">
        <header className="ui-page-intro">
          <p className="ui-page-kicker">自己定义的联系人组织方式</p>
          <h1 className="ui-page-title">给联系人分组</h1>
          <p className="ui-page-summary">一个联系人可以同时在多个分组里。分组只影响联系人页的筛选，不会改变聊天或记忆。</p>
        </header>

        <h2 className="ui-section-label">新建分组</h2>
        <section className="ui-section-card">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(event) => { setName(event.target.value); setError('') }}
              onKeyDown={(event) => { if (event.key === 'Enter') void createGroup() }}
              maxLength={20}
              placeholder="例如：家人、同事、老朋友"
              className="min-w-0 flex-1 rounded-[var(--ui-radius-control)] border border-[var(--ui-border)] bg-[var(--ui-surface-2)] px-3 py-2.5 text-sm text-[var(--ui-text)]"
            />
            <button type="button" onClick={() => void createGroup()} className="ui-primary-action flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-sm font-medium">
              <Plus size={16} />创建
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-[var(--ui-danger-ink)]">{error}</p>}
        </section>

        <h2 className="ui-section-label">已有分组</h2>
        <div className="mx-4 space-y-3">
          {groups.length === 0 && <div className="ui-empty-state ui-section-flush">还没有分组。先在上面创建一个，再从联系人里多选成员。</div>}
          {groups.map((group) => {
            const open = editingId === group.id
            const members = contacts.filter((contact) => group.contactIds.includes(contact.id))
            return (
              <section key={group.id} className="overflow-hidden rounded-[var(--ui-radius-card)] bg-[var(--ui-surface)] shadow-[var(--ui-shadow)]">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-control)] bg-[var(--ui-accent-soft)] text-[var(--ui-action)]"><Users size={18} /></span>
                  <button type="button" onClick={() => setEditingId(open ? null : group.id)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[15px] font-medium text-[var(--ui-text)]">{group.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--ui-text-3)]">{members.length} 人 · {open ? '点击收起' : '点击编辑成员'}</p>
                  </button>
                  <button type="button" onClick={() => void renameGroup(group)} className="shrink-0 text-xs text-[var(--ui-text-3)]">重命名</button>
                  <button type="button" onClick={() => void removeGroup(group)} aria-label={`删除分组${group.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--ui-text-3)]"><Trash2 size={16} /></button>
                </div>

                {open && (
                  <div className="border-t border-[var(--ui-border-soft)] px-4 py-2">
                    {contacts.length === 0 ? <p className="py-3 text-sm text-[var(--ui-text-3)]">还没有联系人</p> : contacts.map((contact) => (
                      <div key={contact.id} className="flex items-center gap-3 border-b border-[var(--ui-border-soft)] py-2.5 last:border-b-0">
                        <Avatar avatar={contact.avatar} color={contact.avatarColor} size={36} />
                        <span className="min-w-0 flex-1 truncate text-sm text-[var(--ui-text)]">{displayName(contact)}</span>
                        <ToggleSwitch
                          size="sm"
                          checked={group.contactIds.includes(contact.id)}
                          onChange={() => void toggleMember(group, contact.id)}
                          ariaLabel={`${group.name}：${group.contactIds.includes(contact.id) ? '移出' : '加入'}${displayName(contact)}`}
                        />
                      </div>
                    ))}
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
