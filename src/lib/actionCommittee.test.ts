import { describe, expect, it } from 'vitest'
import { arbitrateActionCommittee, evaluateDirectSpecialTask } from './actionCommittee'

describe('action committee arbitration', () => {
  const now = new Date(2026, 7, 3, 14, 0).getTime()
  const proposal = { decision: 'create_special_task', locationId: 'mall-cafe', date: '2026-08-03', startTime: '14:20', durationMinutes: 30, activity: '喝咖啡', summary: '和玩家喝咖啡', phoneAccess: 'available', confidence: .9, reason: '角色明确答应' }
  const commitment = { commitment: 'agreed', locationId: 'mall-cafe', confidence: .9, reason: '明确承诺' }
  const feasibility = { allowed: true, hardConflict: false, locationId: 'mall-cafe', confidence: .9, reason: '特殊任务可覆盖默认任务' }

  it('approves a concrete task when all specialist judgments agree', () => {
    const result = arbitrateActionCommittee({ proposal, commitment, feasibility, validLocationIds: new Set(['mall-cafe']), now } as any)
    expect(result).toMatchObject({ approved: true, task: { locationId: 'mall-cafe', activity: '喝咖啡' } })
    expect(result.task!.endsAt - result.task!.startsAt).toBe(30 * 60_000)
  })

  it('fails closed when the role only considers the plan', () => {
    const result = arbitrateActionCommittee({ proposal, commitment: { ...commitment, commitment: 'considering' }, feasibility, validLocationIds: new Set(['mall-cafe']), now } as any)
    expect(result.approved).toBe(false)
  })

  it('rejects disagreement about the destination', () => {
    const result = arbitrateActionCommittee({ proposal, commitment: { ...commitment, locationId: 'park-lawn' }, feasibility, validLocationIds: new Set(['mall-cafe', 'park-lawn']), now } as any)
    expect(result).toMatchObject({ approved: false, reason: expect.stringContaining('地点不一致') })
  })

  it('does not let the feasibility reviewer override an agreed concrete destination', () => {
    const result = arbitrateActionCommittee({
      proposal: { ...proposal, locationId: 'mall-shop', activity: '给宠物买零食' },
      commitment: { ...commitment, locationId: 'mall-shop' },
      feasibility: { ...feasibility, locationId: 'mall-atrium' },
      validLocationIds: new Set(['mall-shop', 'mall-atrium']),
      now,
    } as any)
    expect(result).toMatchObject({ approved: true, task: { locationId: 'mall-shop' } })
  })

  it('still rejects an unknown proposal destination', () => {
    const result = arbitrateActionCommittee({
      proposal: { ...proposal, locationId: 'sky-garden' },
      commitment: { ...commitment, locationId: '' },
      feasibility,
      validLocationIds: new Set(['mall-cafe']),
      now,
    } as any)
    expect(result).toMatchObject({ approved: false, reason: expect.stringContaining('合法') })
  })

  it('accepts a direct-output task using deterministic guards only', () => {
    const raw = JSON.stringify({
      specialTask: {
        decision: 'create_special_task',
        locationId: 'mall-cafe',
        date: '2026-08-03',
        startTime: '14:20',
        durationMinutes: 30,
        activity: '喝咖啡',
        summary: '和玩家喝咖啡',
        phoneAccess: 'available',
      },
    })
    const result = evaluateDirectSpecialTask(raw, [{ id: 'mall-cafe', name: '咖啡店' } as any], now)
    expect(result).toMatchObject({ approved: true, task: { locationId: 'mall-cafe', activity: '喝咖啡' } })
  })

  it('rejects an invalid direct-output task without asking another model', () => {
    const raw = JSON.stringify({ specialTask: { decision: 'create_special_task', locationId: 'invented', date: '2026-08-03', startTime: '14:20', durationMinutes: 30, activity: '见面', summary: '见面' } })
    const result = evaluateDirectSpecialTask(raw, [{ id: 'mall-cafe', name: '咖啡店' } as any], now)
    expect(result).toMatchObject({ approved: false, reason: expect.stringContaining('合法') })
  })
})
