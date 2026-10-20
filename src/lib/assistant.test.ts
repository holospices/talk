import { describe, expect, it } from 'vitest'
import {
  clockToMinute,
  describePersonalScheduleDay,
  diarySectionsFor,
  diarySectionsToText,
  dueAssistantReminders,
  emptyDiarySections,
  fillAssistantTemplate,
  isUserInDndNow,
  minuteToClock,
  nextAssistantReminder,
  normalizeDiarySections,
  personalScheduleCoversMinute,
  personalScheduleDurationMinutes,
  personalScheduleItemAt,
  specialDayMatchesDate,
  specialDaysForDate,
} from './assistant'
import type { PersonalScheduleItem, SpecialDay } from '../types'

function scheduleItem(overrides: Partial<PersonalScheduleItem> = {}): PersonalScheduleItem {
  return {
    id: 'item',
    startMinute: 9 * 60,
    endMinute: 12 * 60,
    activity: '上班',
    remind: false,
    remindMinutes: 10,
    dnd: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('clock helpers', () => {
  it('round-trips minute-of-day values', () => {
    expect(minuteToClock(0)).toBe('00:00')
    expect(minuteToClock(9 * 60 + 5)).toBe('09:05')
    expect(minuteToClock(1439)).toBe('23:59')
    expect(clockToMinute('09:05')).toBe(545)
    expect(clockToMinute('23:59')).toBe(1439)
  })

  it('rejects malformed or out-of-range input', () => {
    expect(clockToMinute('24:00')).toBeNull()
    expect(clockToMinute('9:5')).toBeNull()
    expect(clockToMinute('')).toBeNull()
    expect(clockToMinute('09:60')).toBeNull()
  })

  it('computes overnight durations', () => {
    expect(personalScheduleDurationMinutes({ startMinute: 9 * 60, endMinute: 12 * 60 })).toBe(180)
    expect(personalScheduleDurationMinutes({ startMinute: 23 * 60 + 30, endMinute: 7 * 60 })).toBe(450)
  })
})

describe('personal schedule coverage', () => {
  const overnight = scheduleItem({ startMinute: 23 * 60, endMinute: 7 * 60, activity: '睡觉' })

  it('covers both sides of an overnight activity', () => {
    expect(personalScheduleCoversMinute(overnight, 23 * 60 + 30)).toBe(true)
    expect(personalScheduleCoversMinute(overnight, 6 * 60 + 30)).toBe(true)
    expect(personalScheduleCoversMinute(overnight, 12 * 60)).toBe(false)
  })

  it('picks the latest-starting activity when several overlap', () => {
    const fullDay = scheduleItem({ id: 'day', activity: '在家', startMinute: 0, endMinute: 24 * 60 })
    const lunch = scheduleItem({ id: 'lunch', startMinute: 12 * 60, endMinute: 13 * 60, activity: '午饭' })
    expect(personalScheduleItemAt([fullDay, lunch], new Date(2026, 9, 19, 12, 30))?.id).toBe('lunch')
    expect(personalScheduleItemAt([fullDay, lunch], new Date(2026, 9, 19, 14, 0))?.id).toBe('day')
  })

  it('treats any covering DND activity as blocking contact-initiated chats', () => {
    const work = scheduleItem({ id: 'work' })
    const meeting = scheduleItem({ id: 'meeting', startMinute: 12 * 60, endMinute: 13 * 60, dnd: true })
    expect(isUserInDndNow([work, meeting], new Date(2026, 9, 19, 12, 30))).toBe(true)
    expect(isUserInDndNow([work, meeting], new Date(2026, 9, 19, 14, 0))).toBe(false)
  })
})

describe('reminder timing', () => {
  it('is due once the lead time is reached and stays eligible for the grace window', () => {
    const item = scheduleItem({ startMinute: 15 * 60, endMinute: 16 * 60, remind: true, remindMinutes: 10 })
    const due = dueAssistantReminders([item], new Date(2026, 9, 19, 14, 52))
    expect(due).toHaveLength(1)
    expect(due[0].date).toBe('2026-10-19')
    expect(due[0].dueAt).toBe(new Date(2026, 9, 19, 14, 50).getTime())
  })

  it('does not fire early or hours late', () => {
    const item = scheduleItem({ startMinute: 15 * 60, endMinute: 16 * 60, remind: true, remindMinutes: 10 })
    expect(dueAssistantReminders([item], new Date(2026, 9, 19, 14, 40))).toHaveLength(0)
    expect(dueAssistantReminders([item], new Date(2026, 9, 19, 15, 30))).toHaveLength(0)
  })

  it('handles a reminder late in the previous evening for an activity just after midnight', () => {
    const item = scheduleItem({ remind: true, remindMinutes: 20, startMinute: 10, endMinute: 60 })
    const due = dueAssistantReminders([item], new Date(2026, 9, 19, 23, 55))
    expect(due).toHaveLength(1)
    expect(due[0].date).toBe('2026-10-20')
  })

  it('skips already-sent reminders and exposes the next one for status display', () => {
    const item = scheduleItem({ id: 'item-1', remind: true })
    const sent = new Set(['2026-10-19:item-1'])
    expect(dueAssistantReminders([item], new Date(2026, 9, 19, 8, 52), sent)).toHaveLength(0)
    const next = nextAssistantReminder([item], new Date(2026, 9, 19, 8, 0))
    expect(next?.dueAt).toBe(new Date(2026, 9, 19, 8, 50).getTime())
  })
})

describe('prompt helpers', () => {
  it('fills known placeholders and drops unknown ones', () => {
    expect(fillAssistantTemplate('{{activity}} / {{ missing }} / {{minutes}}', {
      activity: '开会',
      minutes: '10',
    })).toBe('开会 /  / 10')
  })

  it('describes the daily routine with overnight and flag markers', () => {
    const text = describePersonalScheduleDay([
      scheduleItem({ activity: '睡觉', startMinute: 23 * 60, endMinute: 7 * 60 }),
      scheduleItem({ id: 'work', activity: '上班', remind: true, dnd: true }),
    ])
    expect(text).toContain('23:00-07:00（次日） 睡觉')
    expect(text).toContain('09:00-12:00 上班（需要提醒、免打扰）')
  })
})

describe('structured diary sections', () => {
  it('accepts English and Chinese section keys and trims content', () => {
    const sections = normalizeDiarySections({
      events: '  上午写代码  ',
      今日情绪: '平静',
      assistantNotes: '今天还不错',
    })
    expect(sections?.events).toBe('上午写代码')
    expect(sections?.emotion).toBe('平静')
    expect(sections?.assistantNotes).toBe('今天还不错')
    expect(sections?.growth).toBe('')
  })

  it('returns undefined when every section is empty', () => {
    expect(normalizeDiarySections({ events: '  ', emotion: '' })).toBeUndefined()
    expect(normalizeDiarySections(null)).toBeUndefined()
  })

  it('keeps legacy flat diaries readable under 今日事件', () => {
    expect(diarySectionsFor({ content: '旧格式日记', sections: undefined }).events).toBe('旧格式日记')
    expect(diarySectionsFor({ content: 'joined', sections: { ...emptyDiarySections(), emotion: '开心' } }).emotion).toBe('开心')
  })

  it('serializes only non-empty sections with their headings', () => {
    const text = diarySectionsToText({ ...emptyDiarySections(), events: '事件内容', emotion: '情绪内容' })
    expect(text).toContain('今日事件：\n事件内容')
    expect(text).toContain('今日情绪：\n情绪内容')
    expect(text).not.toContain('今日成长')
  })
})

describe('special days', () => {
  const day: SpecialDay = {
    id: 'day-1',
    date: '2026-02-17',
    name: '春节',
    repeatYearly: true,
    createdAt: 1,
    updatedAt: 1,
  }

  it('matches a yearly festival by month/day', () => {
    expect(specialDayMatchesDate(day, '2027-02-17')).toBe(true)
    expect(specialDayMatchesDate(day, '2027-02-18')).toBe(false)
  })

  it('matches a non-repeating date exactly', () => {
    const fixed = { ...day, repeatYearly: false }
    expect(specialDayMatchesDate(fixed, '2026-02-17')).toBe(true)
    expect(specialDayMatchesDate(fixed, '2027-02-17')).toBe(false)
  })

  it('filters a day list for one date', () => {
    const other = { ...day, id: 'day-2', date: '2026-02-17', name: '另一天' }
    expect(specialDaysForDate([day, other], '2026-02-17').map((item) => item.name)).toEqual(['春节', '另一天'])
  })
})
