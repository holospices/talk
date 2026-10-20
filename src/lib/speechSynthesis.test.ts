import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { createDefaultSpeechProviders } from './speechProviders'
import { cacheSpeechForMessage, speechSignature, synthesizeSpeech } from './speechSynthesis'

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await db.speechCache.clear()
})

describe('speech synthesis providers', () => {
  it('calls MiMo with assistant text and decodes returned audio', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.model).toBe('mimo-v2.5-tts')
      expect(body.messages.at(-1)).toEqual({ role: 'assistant', content: '你好' })
      expect(body.audio.voice).toBe('冰糖')
      return new Response(JSON.stringify({ choices: [{ message: { audio: { data: btoa('audio') } } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const speechProviders = createDefaultSpeechProviders()
    speechProviders.mimo.apiKey = 'mimo-test-key'
    speechProviders.mimo.voice = '冰糖'
    const result = await synthesizeSpeech('你好', { speechProvider: 'mimo', speechProviders })
    expect(result.mimeType).toBe('audio/mpeg')
    expect(result.blob.size).toBe(5)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    expect((firstCall![1] as RequestInit).headers).toMatchObject({ 'api-key': 'mimo-test-key' })
  })

  it('collects every Doubao V3 chunk and uses new-console API key auth', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined
      expect(headers).toBeDefined()
      expect(headers!['X-Api-Key']).toBe('doubao-test-key')
      return new Response([
        JSON.stringify({ code: 0, data: btoa('one') }),
        JSON.stringify({ code: 0, data: btoa('two'), addition: { duration: '1234' } }),
        JSON.stringify({ code: 20000000, message: 'OK' }),
      ].join('\n'), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const speechProviders = createDefaultSpeechProviders()
    speechProviders.doubao.apiKey = 'doubao-test-key'
    const result = await synthesizeSpeech('你好', { speechProvider: 'doubao', speechProviders })
    expect(result.blob.size).toBe(6)
    expect(result.durationMs).toBe(1234)
  })

  it('reuses a matching message cache and invalidates it after changing voice', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { audio: { data: btoa('audio') } } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const speechProviders = createDefaultSpeechProviders()
    speechProviders.mimo.apiKey = 'secret-a'
    const settings = { speechProvider: 'mimo' as const, speechProviders }
    const first = await cacheSpeechForMessage('message-a', '缓存测试', settings)
    const second = await cacheSpeechForMessage('message-a', '缓存测试', settings)
    expect(second.signature).toBe(first.signature)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const beforeKeyChange = speechSignature('缓存测试', settings)
    speechProviders.mimo.apiKey = 'secret-b'
    expect(speechSignature('缓存测试', settings)).toBe(beforeKeyChange)
    speechProviders.mimo.voice = '苏打'
    expect(speechSignature('缓存测试', settings)).not.toBe(beforeKeyChange)
  })

  it('uses a contact voice without changing the global provider default', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.audio.voice).toBe('白桦')
      expect(body.messages[0]).toEqual({ role: 'user', content: '低沉、克制' })
      return new Response(JSON.stringify({ choices: [{ message: { audio: { data: btoa('audio') } } }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const speechProviders = createDefaultSpeechProviders()
    speechProviders.mimo.apiKey = 'mimo-test-key'
    await synthesizeSpeech('你好', { speechProvider: 'mimo', speechProviders }, {
      voiceId: '白桦', styleInstruction: '低沉、克制', source: 'user', assignedAt: 1,
    })
    expect(speechProviders.mimo.voice).toBe('mimo_default')
  })
})
