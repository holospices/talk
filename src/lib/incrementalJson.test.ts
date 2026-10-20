import { describe, expect, it } from 'vitest'
import { completedTopLevelJsonFields } from './incrementalJson'

describe('completedTopLevelJsonFields', () => {
  it('returns completed fields while ignoring an unfinished string', () => {
    expect(completedTopLevelJsonFields('{"name":"林晚","hobbies":["摄影","电影"],"persona":"她很')).toEqual({
      name: '林晚',
      hobbies: ['摄影', '电影'],
    })
  })

  it('handles escaped quotes and nested objects', () => {
    expect(completedTopLevelJsonFields('{"name":"小\\"林","profile":{"facts":["摄影师"]},"past":[')).toEqual({
      name: '小"林',
      profile: { facts: ['摄影师'] },
    })
  })

  it('does not mistake braces inside strings for structure', () => {
    expect(completedTopLevelJsonFields('{"persona":"喜欢说{没事}","age":24,"next":"')).toEqual({
      persona: '喜欢说{没事}',
      age: 24,
    })
  })
})
