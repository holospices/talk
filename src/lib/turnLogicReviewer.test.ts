import { describe, expect, it } from 'vitest'
import { parseTurnLogicReview } from './turnLogicReviewer'

describe('turn logic reviewer protocol', () => {
  it('accepts a valid compact verdict', () => {
    expect(parseTurnLogicReview('{"valid":true,"reason":""}')).toEqual({
      status: 'pass',
      reason: '',
    })
  })

  it('extracts a JSON verdict from harmless surrounding text', () => {
    expect(parseTurnLogicReview('结果：{"valid":false,"reason":"混淆了两名群成员的身份"}')).toEqual({
      status: 'reject',
      reason: '混淆了两名群成员的身份',
    })
  })

  it('degrades to unavailable when the reviewer protocol is malformed', () => {
    expect(parseTurnLogicReview('不是JSON')).toEqual({
      status: 'unavailable',
      reason: '逻辑审查模型没有返回有效JSON',
    })
  })
})
