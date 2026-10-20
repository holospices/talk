import { Capacitor } from '@capacitor/core'
import { BackupDirectory } from './backupDirectory'
import { DIARY_SECTION_FIELDS, diarySectionsFor, formatAssistantDate } from './assistant'
import type { AssistantDiary } from '../types'

/** Markdown with explicit headings for every diary section, plus the user's own note. */
export function diaryToMarkdown(diary: AssistantDiary): string {
  const sections = diarySectionsFor(diary)
  const lines = [`# ${formatAssistantDate(diary.date)} · ${diary.assistantName}的日记`, '']
  for (const field of DIARY_SECTION_FIELDS) {
    lines.push(`## ${field.label}`, sections[field.key].trim() || '（这次没有写）', '')
  }
  if (diary.userReflection?.trim()) {
    lines.push('## 我的感想', diary.userReflection.trim(), '')
  }
  return lines.join('\n').trim() + '\n'
}

export function diariesToMarkdown(diaries: AssistantDiary[]): string {
  return [...diaries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(diaryToMarkdown)
    .join('\n---\n\n')
}

/**
 * Saves text through the platform's native "save as" picker when available.
 * Android reuses the existing backup-save plugin; Chromium uses the File System
 * Access API; anything else falls back to a normal download.
 */
export async function saveMarkdownFile(filename: string, contents: string): Promise<'saved' | 'downloaded'> {
  if (Capacitor.getPlatform() === 'android') {
    const { token } = await BackupDirectory.stage({ contents })
    await BackupDirectory.saveStaged({ token, filename })
    return 'saved'
  }

  const picker = (window as unknown as {
    showSaveFilePicker?: (options?: {
      suggestedName?: string
      types?: Array<{ description?: string; accept: Record<string, string[]> }>
    }) => Promise<{ createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>
  }).showSaveFilePicker

  if (picker) {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(contents)
    await writable.close()
    return 'saved'
  }

  const blob = new Blob([contents], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return 'downloaded'
}
