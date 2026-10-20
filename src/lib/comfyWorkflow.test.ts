import { describe, expect, it } from 'vitest'
import { createDefaultImageProviders } from './mediaProviders'
import {
  analyzeComfyWorkflow,
  detectComfyWorkflowBindings,
  injectComfyWorkflow,
  validateComfyWorkflow,
} from './comfyWorkflow'

function complexWorkflow() {
  return {
    '3': { class_type: 'KSampler', inputs: { positive: ['10', 0], negative: ['7', 0], latent_image: ['5', 0], seed: 1, steps: 20, cfg: 6, sampler_name: 'euler', scheduler: 'normal' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 768, height: 1024 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'original positive' } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'original negative' } },
    '10': { class_type: 'FluxGuidance', inputs: { conditioning: ['6', 0], guidance: 3.5 } },
    '20': { class_type: 'PreviewImage', inputs: { images: ['12', 0] }, _meta: { title: '最终预览' } },
  }
}

describe('ComfyUI workflow mapping', () => {
  it('walks upstream through guidance nodes to locate the positive prompt', () => {
    const workflow = validateComfyWorkflow(complexWorkflow())
    const bindings = detectComfyWorkflowBindings(workflow)
    expect(bindings.positivePrompt).toEqual({ nodeId: '6', inputName: 'text' })
    expect(bindings.negativePrompt).toEqual({ nodeId: '7', inputName: 'text' })
    expect(bindings.width).toEqual({ nodeId: '5', inputName: 'width' })
    expect(bindings.outputNodeId).toBe('20')
    expect(analyzeComfyWorkflow(workflow).outputNodes[0].title).toBe('最终预览')
  })

  it('only overwrites the custom-workflow fields the user enabled', () => {
    const providers = createDefaultImageProviders()
    const config = providers.comfyui
    config.workflowMode = 'custom'
    config.workflow = complexWorkflow()
    config.workflowBindings = detectComfyWorkflowBindings(config.workflow)
    config.workflowOverrides = {
      negativePrompt: false,
      seed: true,
      steps: false,
      cfg: false,
      sampler: false,
      scheduler: false,
      width: false,
      height: false,
    }
    config.steps = 55
    config.width = 512

    const injected = injectComfyWorkflow(config, 'new scene prompt', (prefix, prompt) => [prefix, prompt].filter(Boolean).join(', ')) as Record<string, { inputs: Record<string, unknown> }>

    expect(injected['6'].inputs.text).toBe('new scene prompt')
    expect(injected['7'].inputs.text).toBe('original negative')
    expect(injected['3'].inputs.steps).toBe(20)
    expect(injected['5'].inputs.width).toBe(768)
    expect(injected['3'].inputs.seed).not.toBe(1)
    expect((config.workflow['6'] as { inputs: { text: string } }).inputs.text).toBe('original positive')
  })

  it('rejects a video-only workflow because the image downloader cannot consume it', () => {
    expect(() => validateComfyWorkflow({
      '1': { class_type: 'VHS_VideoCombine', inputs: { images: ['2', 0] } },
    })).toThrow('SaveImage 或 PreviewImage')
  })
})
