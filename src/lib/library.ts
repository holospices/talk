import { v4 as uuid } from 'uuid'
import { db } from '../db/db'
import type { LibraryItem, WorldbookCollection, WorldbookEntry } from '../types'

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().normalize('NFKC')
}

function queryTerms(value: string) {
  const text = normalize(value)
  const latin = text.match(/[a-z0-9_-]{2,}/g) ?? []
  const hanRuns = text.match(/[\u3400-\u9fff]+/g) ?? []
  const pairs = hanRuns.flatMap((run) => run.length <= 2 ? [run] : Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2)))
  return [...new Set([text, ...latin, ...hanRuns, ...pairs].filter(Boolean))]
}

function countOccurrences(text: string, term: string) {
  if (!term) return 0
  let count = 0
  let offset = 0
  while ((offset = text.indexOf(term, offset)) >= 0) { count += 1; offset += term.length }
  return count
}

/** Field-weighted BM25-style local ranking with strong exact-match bonuses. */
export function scoreLibraryItem(item: LibraryItem, query: string): number {
  const phrase = normalize(query)
  if (!phrase) return 0
  const title = normalize(item.title)
  const keywords = item.keywords.map(normalize).filter(Boolean)
  const source = normalize([item.sourceLabel, item.sourceFileName].filter(Boolean).join(' '))
  const body = normalize(item.content)
  let score = 0
  if (title === phrase) score += 1000
  if (keywords.includes(phrase)) score += 700
  if (title.startsWith(phrase)) score += 400
  else if (title.includes(phrase)) score += 250
  if (keywords.some((keyword) => keyword.includes(phrase) || phrase.includes(keyword))) score += 180

  const terms = queryTerms(query)
  let covered = 0
  for (const term of terms) {
    let termScore = 0
    termScore += Math.min(3, countOccurrences(title, term)) * 8
    termScore += Math.min(3, keywords.reduce((sum, keyword) => sum + countOccurrences(keyword, term), 0)) * 10
    termScore += Math.min(2, countOccurrences(source, term)) * 3
    // Logarithmic saturation and length normalization keep huge documents
    // from outranking concise, clearly targeted material.
    const bodyHits = countOccurrences(body, term)
    if (bodyHits) termScore += (1 + Math.log2(bodyHits)) / (1 + Math.log2(Math.max(1, body.length / 400)))
    if (termScore > 0) covered += 1
    score += termScore
  }
  if (terms.length && covered === terms.length) score += 120
  else if (terms.length) score += 60 * (covered / terms.length)
  return score
}

export function searchLibraryItems(items: LibraryItem[], query: string) {
  const trimmed = query.trim()
  if (!trimmed) return [...items].sort((a, b) => b.updatedAt - a.updatedAt)
  const scored = items.map((item) => ({ item, score: scoreLibraryItem(item, trimmed) })).filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (b.item.lastUsedAt ?? 0) - (a.item.lastUsedAt ?? 0) || b.item.updatedAt - a.item.updatedAt)
  const top = scored[0]?.score || 1
  return scored.map(({ item, score }) => ({ ...item, matchScore: score, matchPercent: Math.max(1, Math.round(score / top * 100)) }))
}

export async function storeWorldbookInLibrary(collection: WorldbookCollection, entries: WorldbookEntry[]) {
  const packageId = uuid()
  const now = Date.now()
  const rows: LibraryItem[] = entries.map((entry) => ({
    id: uuid(), packageId, sourceType: 'worldbook', title: entry.title, content: entry.content,
    keywords: [...entry.keywords], sourceLabel: collection.sourceLabel || collection.name,
    sourceFileName: collection.sourceFileName, rawData: entry.rawData,
    createdAt: now, updatedAt: now,
  }))
  await db.libraryItems.bulkAdd(rows)
  return rows
}

export async function storeCharacterCardInLibrary(card: {
  name: string; content: string; keywords: string[]; rawData?: Record<string, unknown>; sourceFileName?: string
}, lore?: { collection: WorldbookCollection; entries: WorldbookEntry[] }) {
  const packageId = uuid()
  const now = Date.now()
  const parentId = uuid()
  const rows: LibraryItem[] = [{
    id: parentId, packageId, sourceType: 'character-card', title: card.name, content: card.content,
    keywords: [...new Set([card.name, ...card.keywords].map((value) => value.trim()).filter(Boolean))],
    sourceLabel: 'SillyTavern 角色卡', sourceFileName: card.sourceFileName, rawData: card.rawData,
    createdAt: now, updatedAt: now,
  }]
  for (const entry of lore?.entries ?? []) rows.push({
    id: uuid(), packageId, parentId, sourceType: 'worldbook', title: entry.title, content: entry.content,
    keywords: [...entry.keywords], sourceLabel: '角色卡内嵌世界书', sourceFileName: card.sourceFileName,
    rawData: entry.rawData, createdAt: now, updatedAt: now,
  })
  await db.libraryItems.bulkAdd(rows)
  return rows
}
