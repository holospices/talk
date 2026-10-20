import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTurnController, revealSequentially } from './conversationRuntime'

describe('createTurnController', () => {
  afterEach(() => vi.useRealTimers())

  it('invalidates the previous stream when a new turn begins', () => {
    const turns = createTurnController()
    turns.begin('conversation', 'first')
    expect(turns.isCurrent('conversation', 'first')).toBe(true)

    turns.begin('conversation', 'second')
    expect(turns.isCurrent('conversation', 'first')).toBe(false)
    expect(turns.isCurrent('conversation', 'second')).toBe(true)
  })

  it('cancels tracked timers and the active request', () => {
    vi.useFakeTimers()
    const turns = createTurnController()
    const callback = vi.fn()
    const abort = new AbortController()
    const abortSpy = vi.spyOn(abort, 'abort')

    turns.begin('conversation', 'first')
    turns.addTimer('conversation', setTimeout(callback, 100))
    turns.setAbortController('conversation', abort)
    turns.clearPending('conversation')
    vi.advanceTimersByTime(100)

    expect(callback).not.toHaveBeenCalled()
    expect(abortSpy).toHaveBeenCalledOnce()
  })

  it('keeps timers added through a shared reveal queue cancellable', () => {
    vi.useFakeTimers()
    const turns = createTurnController()
    const callback = vi.fn()
    const pending: ReturnType<typeof setTimeout>[] = []

    turns.begin('conversation', 'first')
    turns.trackTimers('conversation', pending)
    pending.push(setTimeout(callback, 100))
    turns.clearPending('conversation')
    vi.advanceTimersByTime(100)

    expect(callback).not.toHaveBeenCalled()
  })
})

describe('revealSequentially', () => {
  afterEach(() => vi.useRealTimers())

  it('waits for each async reveal before scheduling the next item', async () => {
    vi.useFakeTimers()
    const turns = createTurnController()
    const events: string[] = []
    turns.begin('conversation', 'stream')

    revealSequentially({
      conversationId: 'conversation',
      streamId: 'stream',
      items: ['first', 'second'],
      controller: turns,
      delayMs: () => 10,
      reveal: async (item) => {
        events.push(`${item}:start`)
        await Promise.resolve()
        events.push(`${item}:end`)
      },
      onError: vi.fn(),
    })

    await vi.advanceTimersByTimeAsync(10)
    expect(events).toEqual(['first:start', 'first:end'])
    await vi.advanceTimersByTimeAsync(10)
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('does not reveal queued items after the stream is replaced', async () => {
    vi.useFakeTimers()
    const turns = createTurnController()
    const reveal = vi.fn(async () => undefined)
    turns.begin('conversation', 'stream')

    revealSequentially({
      conversationId: 'conversation',
      streamId: 'stream',
      items: ['message'],
      controller: turns,
      delayMs: () => 10,
      reveal,
      onError: vi.fn(),
    })
    turns.begin('conversation', 'replacement')
    await vi.advanceTimersByTimeAsync(10)

    expect(reveal).not.toHaveBeenCalled()
  })
})
