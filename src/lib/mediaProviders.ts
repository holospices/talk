import type {
  AppSettings,
  ImageProviderId,
  ImageProvidersSettings,
  StickerProviderId,
  StickerProvidersSettings,
} from '../types'

export interface AtlasImageModelPreset {
  id: string
  name: string
  description: string
  badge: string
  sizes: readonly string[]
  defaultSize: string
  includeSize?: boolean
}

export const ATLAS_IMAGE_MODEL_PRESETS: readonly AtlasImageModelPreset[] = [
  {
    id: 'z-image/turbo',
    name: 'Z-Image Turbo',
    description: '速度快、成本低，适合聊天中频繁生成图片。',
    badge: '高性价比',
    sizes: ['1024*1024', '1152*896', '896*1152', '1536*1024', '1024*1536'],
    defaultSize: '1024*1024',
  },
  {
    id: 'bytedance/seedream-v5.0-pro/text-to-image',
    name: 'Seedream v5 Pro',
    description: '高质量档，适合文字、构图和细节要求较高的图片。',
    badge: '高质量',
    sizes: ['1024*1024', '1536*1536', '1776*1328', '1328*1776', '2048*1152', '1152*2048'],
    defaultSize: '1536*1536',
  },
  {
    id: 'bytedance/seedream-v4',
    name: 'Seedream v4',
    description: '质量和速度比较均衡，保留为兼容性良好的默认选择。',
    badge: '均衡',
    sizes: ['1024*1024', '1536*1024', '1024*1536', '2048*1536', '1536*2048'],
    defaultSize: '1024*1024',
  },
  {
    id: 'atlascloud/qwen-image/text-to-image',
    name: 'Qwen Image',
    description: '擅长中文语义和画面文字，由模型采用默认输出尺寸。',
    badge: '中文',
    sizes: [],
    defaultSize: '',
    includeSize: false,
  },
  {
    id: 'black-forest-labs/flux-schnell',
    name: 'FLUX Schnell',
    description: '快速通用生图，适合草图、概念图和快速尝试。',
    badge: '快速',
    sizes: ['1024*1024', '1152*896', '896*1152', '1536*1024', '1024*1536'],
    defaultSize: '1024*1024',
  },
  {
    id: 'bytedance/seedream-v3',
    name: 'Seedream v3',
    description: '较早的轻量选择，适合对新模型兼容性不佳时备用。',
    badge: '兼容',
    sizes: ['1024*1024', '1152*896', '896*1152', '1536*1024', '1024*1536'],
    defaultSize: '1024*1024',
  },
]

export function atlasImageModelPreset(model: string): AtlasImageModelPreset | undefined {
  return ATLAS_IMAGE_MODEL_PRESETS.find((preset) => preset.id === model)
}

export const STICKER_PROVIDER_INFO: Array<{
  id: Exclude<StickerProviderId, 'none'>
  name: string
  description: string
  badge?: string
}> = [
  { id: 'giphy', name: 'GIPHY', description: '覆盖面广，直接输入 API Key 即可使用', badge: '推荐' },
  { id: 'klipy', name: 'KLIPY', description: 'GIF、贴纸和梗图搜索，接口兼容 Tenor' },
  { id: 'tenor', name: 'Tenor', description: '适合已有 Tenor API Key 的用户', badge: '旧 Key' },
  { id: 'custom', name: '其他接口', description: '兼容返回图片 URL 的自定义 GET 接口' },
]

export const IMAGE_PROVIDER_INFO: Array<{
  id: Exclude<ImageProviderId, 'none'>
  name: string
  description: string
  badge?: string
}> = [
  { id: 'atlas', name: 'Atlas Cloud', description: '云端生图，只需 API Key 并选择模型参数', badge: '云端' },
  { id: 'novelai', name: 'NovelAI', description: 'NovelAI Image 官方接口，适合二次元图片', badge: 'NAI' },
  { id: 'comfyui', name: 'ComfyUI', description: '连接电脑上的 ComfyUI，自动构建基础工作流', badge: '本地' },
  { id: 'stable-diffusion', name: 'Stable Diffusion WebUI / Forge', description: '连接 A1111 或 Forge 的 txt2img 接口', badge: '本地' },
  { id: 'custom', name: '其他接口', description: '自定义 GET/POST、鉴权、请求体与返回路径' },
]

export function createDefaultStickerProviders(): StickerProvidersSettings {
  return {
    giphy: { apiKey: '', rating: 'pg', language: 'zh-CN' },
    klipy: { apiKey: '', contentFilter: 'medium', locale: 'zh_CN' },
    tenor: { apiKey: '', contentFilter: 'medium', locale: 'zh_CN' },
    custom: { endpoint: '', apiKey: '', authMode: 'none', responsePath: '' },
  }
}

export function createDefaultImageProviders(): ImageProvidersSettings {
  return {
    atlas: {
      apiKey: '',
      baseUrl: 'https://api.atlascloud.ai/api/v1',
      model: 'bytedance/seedream-v4',
      size: '1024*1024',
      promptPrefix: '',
      visualStyle: 'asian-realistic',
      customVisualStyle: '',
    },
    novelai: {
      apiKey: '',
      baseUrl: 'https://image.novelai.net',
      model: 'nai-diffusion-4-5-full',
      width: 1024,
      height: 1024,
      steps: 28,
      scale: 5,
      sampler: 'k_euler_ancestral',
      scheduler: 'karras',
      negativePrompt: 'lowres, bad anatomy, blurry, text, watermark',
      promptPrefix: '',
    },
    comfyui: {
      baseUrl: 'http://127.0.0.1:8188',
      apiKey: '',
      authMode: 'none',
      workflowMode: 'basic',
      workflowOverrides: {
        negativePrompt: true,
        seed: true,
        steps: true,
        cfg: true,
        sampler: true,
        scheduler: true,
        width: true,
        height: true,
      },
      model: '',
      width: 768,
      height: 768,
      steps: 24,
      cfg: 7,
      sampler: 'euler',
      scheduler: 'normal',
      negativePrompt: 'low quality, blurry, text, watermark',
      promptPrefix: '',
      timeoutSeconds: 300,
    },
    stableDiffusion: {
      baseUrl: 'http://127.0.0.1:7860',
      username: '',
      password: '',
      model: '',
      width: 768,
      height: 768,
      steps: 24,
      cfg: 7,
      sampler: 'Euler a',
      negativePrompt: 'low quality, blurry, text, watermark',
      promptPrefix: '',
    },
    custom: {
      endpoint: '',
      apiKey: '',
      method: 'POST',
      authMode: 'bearer',
      bodyTemplate: '{\n  "prompt": "{prompt}"\n}',
      responsePath: 'url',
    },
  }
}

function mergeNested<T extends Record<string, unknown>>(defaults: T, value: unknown): T {
  if (!value || typeof value !== 'object') return { ...defaults }
  return { ...defaults, ...(value as Partial<T>) }
}

export function normalizeStickerProviders(value: unknown): StickerProvidersSettings {
  const defaults = createDefaultStickerProviders()
  const record = value && typeof value === 'object' ? value as Partial<StickerProvidersSettings> : {}
  return {
    giphy: mergeNested(defaults.giphy, record.giphy),
    klipy: mergeNested(defaults.klipy, record.klipy),
    tenor: mergeNested(defaults.tenor, record.tenor),
    custom: mergeNested(defaults.custom, record.custom),
  }
}

export function normalizeImageProviders(value: unknown): ImageProvidersSettings {
  const defaults = createDefaultImageProviders()
  const record = value && typeof value === 'object' ? value as Partial<ImageProvidersSettings> : {}
  const comfy = mergeNested(defaults.comfyui, record.comfyui)
  const timeoutSeconds = Number(comfy.timeoutSeconds)
  return {
    atlas: (() => {
      const atlas = mergeNested(defaults.atlas, record.atlas)
      return {
        ...atlas,
        visualStyle: ['asian-realistic', 'european-realistic', 'anime', 'custom'].includes(atlas.visualStyle)
          ? atlas.visualStyle
          : defaults.atlas.visualStyle,
      }
    })(),
    novelai: mergeNested(defaults.novelai, record.novelai),
    comfyui: {
      ...comfy,
      authMode: ['none', 'bearer', 'x-api-key'].includes(comfy.authMode) ? comfy.authMode : defaults.comfyui.authMode,
      timeoutSeconds: Number.isFinite(timeoutSeconds) ? Math.min(1_800, Math.max(30, timeoutSeconds)) : defaults.comfyui.timeoutSeconds,
      workflowOverrides: {
        ...defaults.comfyui.workflowOverrides,
        ...(record.comfyui?.workflowOverrides ?? {}),
      },
    },
    stableDiffusion: mergeNested(defaults.stableDiffusion, record.stableDiffusion),
    custom: mergeNested(defaults.custom, record.custom),
  }
}

export function isStickerProviderReady(settings: Pick<AppSettings, 'stickerProvider' | 'stickerProviders'>): boolean {
  const { stickerProvider: provider, stickerProviders: providers } = settings
  if (provider === 'none') return false
  if (provider === 'custom') return !!providers.custom.endpoint.trim()
  return !!providers[provider].apiKey.trim()
}

export function isImageProviderReady(settings: Pick<AppSettings, 'imageProvider' | 'imageProviders'>): boolean {
  const { imageProvider: provider, imageProviders: providers } = settings
  if (provider === 'none') return false
  if (provider === 'atlas') return !!providers.atlas.apiKey.trim() && (providers.atlas.visualStyle !== 'custom' || !!providers.atlas.customVisualStyle.trim())
  if (provider === 'novelai') return !!providers.novelai.apiKey.trim()
  if (provider === 'comfyui') return !!providers.comfyui.baseUrl.trim() && (providers.comfyui.workflowMode === 'custom' ? !!providers.comfyui.workflow : !!providers.comfyui.model.trim())
  if (provider === 'stable-diffusion') return !!providers.stableDiffusion.baseUrl.trim()
  return !!providers.custom.endpoint.trim()
}

export function stickerProviderName(provider: StickerProviderId): string {
  if (provider === 'none') return '未启用'
  return STICKER_PROVIDER_INFO.find((item) => item.id === provider)?.name ?? provider
}

export function imageProviderName(provider: ImageProviderId): string {
  if (provider === 'none') return '未启用'
  return IMAGE_PROVIDER_INFO.find((item) => item.id === provider)?.name ?? provider
}
