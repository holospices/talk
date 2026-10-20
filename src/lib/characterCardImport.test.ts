import { describe, expect, it } from 'vitest'
import { characterCardPersonaText, parseSillyTavernCharacterCard } from './characterCardImport'

describe('SillyTavern character cards', () => {
  it('maps a V2 JSON card and safely replaces common macros', async () => {
    const file = new File([JSON.stringify({ spec: 'chara_card_v2', data: { name: '林夏', description: '旧友', personality: '温柔', scenario: '{{char}} 与 {{user}} 从小一起长大', first_mes: '你终于来了。', mes_example: '<START>\n{{char}}: 别迟到。' } })], 'linxia.json', { type: 'application/json' })
    const card = await parseSillyTavernCharacterCard(file, '阿澈')
    expect(card.scenario).toBe('林夏 与 阿澈 从小一起长大')
    expect(card.firstMessage).toBe('你终于来了。')
    expect(characterCardPersonaText(card)).toContain('从小一起长大')
  })
})
