import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { searchLibraryItems } from '../lib/library'
import { estimateTokens } from '../lib/aiUsage'
import { formatEstimatedTokens } from '../lib/worldbookTokens'

interface Props { open: boolean; selectedIds: string[]; onChange: (ids: string[]) => void; onClose: () => void }
const EMPTY_ITEMS: never[] = []

/** Kept under the legacy component name to avoid breaking persisted creator tasks. */
export function WorldbookEntrySelector({ open, selectedIds, onChange, onClose }: Props) {
  const items = useLiveQuery(() => db.libraryItems.toArray(), []) ?? EMPTY_ITEMS
  const [query, setQuery] = useState('')
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const visible = useMemo(() => searchLibraryItems(items, query), [items, query])
  const selectedTokens = items.filter((item) => selected.has(item.id)).reduce((sum, item) => sum + estimateTokens(item.content), 0)
  if (!open) return null
  const toggle = (id: string) => onChange(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id])
  return <div className="absolute inset-0 z-40 flex flex-col bg-[#f4f4f6]">
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-4"><button type="button" onClick={onClose} className="text-sm text-gray-500">取消</button><h2 className="font-medium text-gray-900">选择参考资料</h2><button type="button" onClick={onClose} className="text-sm font-medium text-[var(--ui-special-ink)]">完成</button></div>
    <div className="flex-1 overflow-y-auto px-4 pb-6"><div className="sticky top-0 z-10 -mx-4 bg-[#f4f4f6] px-4 py-3"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资料名、关键词、来源或正文" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"/><p className="mt-2 text-xs text-gray-400">已选择 {selectedIds.length} 条 · {formatEstimatedTokens(selectedTokens)}。资料只用于本次人物生成，不会自动写入世界正史。</p></div><div className="space-y-2">{visible.map((item) => <label key={item.id} className="flex items-start gap-3 rounded-xl bg-white p-4"><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="mt-1"/><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-800">{item.title}</span><span className="mt-1 line-clamp-3 block text-xs leading-relaxed text-gray-400">{item.content}</span><span className="mt-2 block text-[10px] text-gray-400">{item.sourceLabel || item.sourceType}{'matchPercent' in item && query.trim() ? ` · ${item.matchPercent}%匹配` : ''}</span></span></label>)}{!visible.length && <p className="py-12 text-center text-sm text-gray-400">资料库中没有符合条件的内容</p>}</div></div>
  </div>
}
