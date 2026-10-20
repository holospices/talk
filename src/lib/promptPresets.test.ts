import { describe, expect, it } from 'vitest'
import { createDefaultPromptModules } from './promptModules'
import { clonePromptModules, normalizePromptPresets, SYSTEM_DEFAULT_PROMPT_PRESET_ID } from './promptPresets'
import { buildJsonConversionPrompt, DEFAULT_JSON_CONVERSION_PROMPT, validateJsonConversionPrompt } from './prompt'

describe('prompt archives and contact snapshots', () => {
  it('always restores an undeletable system default archive', () => {
    const presets = normalizePromptPresets([], createDefaultPromptModules())
    expect(presets[0].id).toBe(SYSTEM_DEFAULT_PROMPT_PRESET_ID)
    expect(presets[0].systemDefault).toBe(true)
  })

  it('clones modules so a contact snapshot does not follow later global edits', () => {
    const global = createDefaultPromptModules()
    const snapshot = clonePromptModules(global)
    global.chat.templates.style = '后来修改的全局规则'
    expect(snapshot.chat.templates.style).not.toBe(global.chat.templates.style)
  })
})

describe('per-contact JSON conversion protocol', () => {
  it('substitutes raw text while retaining the required contract', () => {
    expect(validateJsonConversionPrompt(DEFAULT_JSON_CONVERSION_PROMPT)).toEqual([])
    const rendered = buildJsonConversionPrompt('CONTACT_RAW', DEFAULT_JSON_CONVERSION_PROMPT)
    expect(rendered).toContain('CONTACT_RAW')
    expect(rendered).not.toContain('{{rawText}}')
  })

  it('falls back to the program protocol when an override breaks required markers', () => {
    const rendered = buildJsonConversionPrompt('CONTACT_RAW', '随便输出')
    expect(rendered).toContain('knowledgeQueries')
    expect(rendered).toContain('CONTACT_RAW')
  })
})
