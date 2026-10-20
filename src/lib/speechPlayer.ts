import { create } from 'zustand'
import { db } from '../db/db'
import type { SpeechCacheRecord } from '../types'

interface SpeechPlayerState {
  messageId: string | null
  playing: boolean
  setState: (patch: Partial<Pick<SpeechPlayerState, 'messageId' | 'playing'>>) => void
}

export const useSpeechPlayerStore = create<SpeechPlayerState>((set) => ({
  messageId: null,
  playing: false,
  setState: (patch) => set(patch),
}))

let currentAudio: HTMLAudioElement | null = null
let currentUrl = ''

function releaseCurrent() {
  currentAudio?.pause()
  currentAudio = null
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  currentUrl = ''
}

export async function playSpeechRecord(record: SpeechCacheRecord): Promise<void> {
  const state = useSpeechPlayerStore.getState()
  if (state.messageId === record.messageId && currentAudio) {
    if (currentAudio.paused) {
      await currentAudio.play()
      state.setState({ playing: true })
    } else {
      currentAudio.pause()
      state.setState({ playing: false })
    }
    return
  }
  releaseCurrent()
  currentUrl = URL.createObjectURL(record.audio)
  const audio = new Audio(currentUrl)
  currentAudio = audio
  state.setState({ messageId: record.messageId, playing: true })
  audio.addEventListener('ended', () => {
    if (currentAudio === audio) useSpeechPlayerStore.getState().setState({ playing: false })
  })
  audio.addEventListener('error', () => {
    if (currentAudio === audio) useSpeechPlayerStore.getState().setState({ playing: false })
  })
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      void db.speechCache.update(record.id, { durationMs: Math.round(audio.duration * 1000) })
    }
  })
  await db.speechCache.update(record.id, { lastAccessedAt: Date.now() })
  try {
    await audio.play()
  } catch (error) {
    useSpeechPlayerStore.getState().setState({ playing: false })
    throw error
  }
}

export async function playSpeechMessage(messageId: string): Promise<void> {
  const record = await db.speechCache.get(messageId)
  if (!record) throw new Error('这条消息还没有生成语音')
  return playSpeechRecord(record)
}

export function stopSpeechPlayback(): void {
  releaseCurrent()
  useSpeechPlayerStore.getState().setState({ messageId: null, playing: false })
}
