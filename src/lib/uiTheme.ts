import type { AppSettings } from '../types'

export type UiThemeId = NonNullable<AppSettings['uiTheme']>

export interface UiThemeDefinition {
  id: UiThemeId
  name: string
  tagline: string
  description: string
  swatches: readonly [string, string, string]
}

export const UI_THEMES: readonly UiThemeDefinition[] = [
  { id: 'sage', name: 'Sage', tagline: '安静陪伴', description: '柔和鼠尾草绿，克制、温暖，适合长时间聊天。', swatches: ['#f4f6f4', '#27845a', '#1f2922'] },
  { id: 'forge', name: 'Forge', tagline: 'Primer 工具感', description: '紧凑、清晰、边界明确，参考 GitHub 的产品界面语言。', swatches: ['#f6f8fa', '#0969da', '#1f883d'] },
  { id: 'fox', name: 'Fox', tagline: '柔和活力', description: '更轻快的紫色强调与饱满圆角，保留简洁但更有亲和力。', swatches: ['#f7f7fb', '#7542e5', '#1d1133'] },
  { id: 'ink', name: 'Ink', tagline: '圆角编辑黑白', description: '纸墨感衬线字体、强对比线条与克制圆角，最有内容气质。', swatches: ['#f1f0eb', '#111110', '#777770'] },
  { id: 'nord', name: 'Nord', tagline: '冷色工作台', description: '低饱和蓝灰与窄圆角，理性、稳定，适合桌面端。', swatches: ['#e9eef2', '#2e6f9e', '#192832'] },
  { id: 'wetalk', name: 'WeTalk', tagline: '克制社交', description: '高密度列表、小圆角与克制绿色，参考微信成熟的社交界面秩序。', swatches: ['#ededed', '#07c160', '#95ec69'] },
] as const

const UI_THEME_IDS = new Set<UiThemeId>(UI_THEMES.map((theme) => theme.id))

export function normalizeUiTheme(value: unknown): UiThemeId {
  return UI_THEME_IDS.has(value as UiThemeId) ? value as UiThemeId : 'sage'
}

export function uiThemeName(value: unknown): string {
  const id = normalizeUiTheme(value)
  return UI_THEMES.find((theme) => theme.id === id)?.name ?? 'Sage'
}
