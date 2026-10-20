import { afterEach, describe, expect, it, vi } from 'vitest'
import { zipSync } from 'fflate'
import { createDefaultImageProviders, createDefaultStickerProviders } from './mediaProviders'
import { generateRemoteImage, loadImageProviderOptions, searchRemoteStickers, testImageProviderConnection } from './remoteMedia'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('remote sticker providers', () => {
  it('calls the fixed GIPHY sticker search endpoint and extracts the messaging rendition', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.origin + url.pathname).toBe('https://api.giphy.com/v1/stickers/search')
      expect(url.searchParams.get('api_key')).toBe('test-key')
      expect(url.searchParams.get('q')).toBe('开心猫咪')
      return jsonResponse({
        data: [{
          title: 'happy cat',
          images: { fixed_height_small: { url: 'https://media.example/cat.gif' } },
          analytics: { onsent: { url: 'https://analytics.example/sent' } },
        }],
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const providers = createDefaultStickerProviders()
    providers.giphy.apiKey = 'test-key'

    const results = await searchRemoteStickers({ stickerProvider: 'giphy', stickerProviders: providers }, '开心猫咪')

    expect(results).toEqual([{
      url: 'https://media.example/cat.gif',
      name: 'happy cat',
      provider: 'giphy',
      trackingUrl: 'https://analytics.example/sent',
    }])
  })

  it('supports a custom nested response path without copying unrelated URLs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      docs: 'https://example.com/not-an-image-page',
      data: { results: [{ image: 'https://cdn.example/one.webp' }] },
    })))
    const providers = createDefaultStickerProviders()
    providers.custom.endpoint = 'https://stickers.example/search?q={query}'
    providers.custom.responsePath = 'data.results'

    const results = await searchRemoteStickers({ stickerProvider: 'custom', stickerProviders: providers }, 'wave')

    expect(results.map((result) => result.url)).toEqual(['https://cdn.example/one.webp'])
    expect(results[0].provider).toBe('custom')
  })
})

describe('image generation providers', () => {
  it('rejects a ComfyUI HTML fallback instead of reporting a connection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })))
    const providers = createDefaultImageProviders()

    await expect(testImageProviderConnection({ imageProvider: 'comfyui', imageProviders: providers }))
      .rejects.toThrow('返回了网页')
  })

  it('rejects a WebUI HTML fallback while loading options', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })))
    const providers = createDefaultImageProviders()

    await expect(loadImageProviderOptions({ imageProviders: providers }, 'stable-diffusion'))
      .rejects.toThrow('返回了网页')
  })

  it('submits an Atlas task and polls the official prediction endpoint', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('/model/generateImage')) {
        const body = JSON.parse(String(init?.body))
        expect(body.model).toBe('bytedance/seedream-v4')
        expect(body.prompt).toContain('orange cat')
        return jsonResponse({
          data: {
            id: 'prediction-1',
            status: 'processing',
            urls: {
              result: 'https://api.atlascloud.ai/api/v1/model/prediction/prediction-1',
              cancel: 'https://api.atlascloud.ai/api/v1/model/prediction/prediction-1/cancel',
            },
          },
        })
      }
      return jsonResponse({ data: { status: 'completed', outputs: ['https://cdn.example/generated.png'] } })
    }))
    const providers = createDefaultImageProviders()
    providers.atlas.apiKey = 'atlas-test-key'

    const result = await generateRemoteImage({ imageProvider: 'atlas', imageProviders: providers }, 'orange cat')

    expect(calls).toEqual([
      'https://api.atlascloud.ai/api/v1/model/generateImage',
      'https://api.atlascloud.ai/api/v1/model/prediction/prediction-1',
    ])
    expect(result).toEqual({ url: 'https://cdn.example/generated.png', query: 'orange cat', provider: 'atlas' })
  })

  it('reports Atlas progress and stops polling when the caller cancels', async () => {
    const controller = new AbortController()
    const progress: string[] = []
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { id: 'prediction-cancel', status: 'processing' } })))
    const providers = createDefaultImageProviders()
    providers.atlas.apiKey = 'atlas-test-key'

    await expect(generateRemoteImage(
      { imageProvider: 'atlas', imageProviders: providers },
      'cancelled image',
      {
        signal: controller.signal,
        onProgress: (update) => {
          progress.push(update.stage)
          if (update.stage === 'running') controller.abort()
        },
      },
    )).rejects.toMatchObject({ name: 'AbortError' })

    expect(progress).toEqual(['submitting', 'running'])
  })

  it('accepts an Atlas output URL without downloading it again', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { outputs: ['https://cdn.example/generated.png'] } }))
    vi.stubGlobal('fetch', fetchMock)
    const providers = createDefaultImageProviders()
    providers.atlas.apiKey = 'atlas-test-key'

    await expect(generateRemoteImage({ imageProvider: 'atlas', imageProviders: providers }, 'remote image'))
      .resolves.toMatchObject({ url: 'https://cdn.example/generated.png' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('normalizes Atlas raw base64 image output into a data URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { outputs: ['iVBORw0KGgoAAAANSUhEUg=='] } })))
    const providers = createDefaultImageProviders()
    providers.atlas.apiKey = 'atlas-test-key'

    const result = await generateRemoteImage({ imageProvider: 'atlas', imageProviders: providers }, 'inline image')
    expect(result?.url).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')
  })

  it('ignores Atlas task metadata URLs while a prediction is still processing', async () => {
    let polls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/model/generateImage')) {
        return jsonResponse({ data: { id: 'prediction-metadata', status: 'processing', urls: { result: 'https://api.atlascloud.ai/protected-result' } } })
      }
      polls += 1
      if (polls === 1) {
        return jsonResponse({ data: { status: 'processing', urls: { result: 'https://api.atlascloud.ai/protected-result' } } })
      }
      return jsonResponse({ data: { status: 'completed', outputs: ['data:image/png;base64,iVBORw0KGgo='] } })
    }))
    const providers = createDefaultImageProviders()
    providers.atlas.apiKey = 'atlas-test-key'

    const result = await generateRemoteImage({ imageProvider: 'atlas', imageProviders: providers }, 'finished image')
    expect(result?.url).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(polls).toBe(2)
  }, 10_000)

  it('offers the curated Atlas image models including Z-Image Turbo', async () => {
    const providers = createDefaultImageProviders()
    const options = await loadImageProviderOptions({ imageProviders: providers }, 'atlas')

    expect(options.models).toContain('z-image/turbo')
    expect(options.models).toContain('black-forest-labs/flux-schnell')
    expect(options.models).toContain('atlascloud/qwen-image/text-to-image')
    expect(options.models.length).toBeGreaterThanOrEqual(6)
  })

  it('uses the shared Atlas size field for Z-Image Turbo', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        model: 'z-image/turbo',
        size: '1024*1536',
        prompt_extend: false,
        seed: -1,
        enable_sync_mode: false,
        enable_base64_output: true,
      })
      return jsonResponse({ data: { outputs: ['data:image/png;base64,iVBORw0KGgo='] } })
    }))
    const providers = createDefaultImageProviders()
    providers.atlas.apiKey = 'atlas-test-key'
    providers.atlas.model = 'z-image/turbo'
    providers.atlas.size = '1024*1536'

    const result = await generateRemoteImage({ imageProvider: 'atlas', imageProviders: providers }, 'portrait')
    expect(result?.url).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('omits an unsupported size override for the Qwen Image preset', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.model).toBe('atlascloud/qwen-image/text-to-image')
      expect(body).not.toHaveProperty('size')
      return jsonResponse({ data: { outputs: ['https://cdn.example/qwen.png'] } })
    }))
    const providers = createDefaultImageProviders()
    providers.atlas.apiKey = 'atlas-test-key'
    providers.atlas.model = 'atlascloud/qwen-image/text-to-image'

    await generateRemoteImage({ imageProvider: 'atlas', imageProviders: providers }, 'Chinese poster')
  })

  it('decodes the first PNG from NovelAI zip output', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const archive = zipSync({ 'image.png': png })
    vi.stubGlobal('fetch', vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.action).toBe('generate')
      expect(body.parameters.v4_prompt.caption.base_caption).toContain('anime portrait')
      return new Response(archive, { status: 200, headers: { 'Content-Type': 'application/zip' } })
    }))
    const providers = createDefaultImageProviders()
    providers.novelai.apiKey = 'nai-test-token'

    const result = await generateRemoteImage({ imageProvider: 'novelai', imageProviders: providers }, 'anime portrait')

    expect(result?.provider).toBe('novelai')
    expect(result?.url).toMatch(/^data:image\/png;base64,/)
  })

  it('builds a basic ComfyUI workflow, polls history, and fetches the output image', async () => {
    const routes: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      routes.push(url)
      if (url.endsWith('/prompt')) {
        const body = JSON.parse(String(init?.body))
        expect(body.prompt['4'].inputs.ckpt_name).toBe('model.safetensors')
        expect(body.prompt['6'].inputs.text).toContain('cinematic cat')
        return jsonResponse({ prompt_id: 'comfy-1' })
      }
      if (url.endsWith('/history/comfy-1')) {
        return jsonResponse({
          'comfy-1': {
            outputs: {
              '9': { images: [{ filename: 'Talk_00001_.png', subfolder: '', type: 'output' }] },
            },
          },
        })
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } })
    }))
    const providers = createDefaultImageProviders()
    providers.comfyui.model = 'model.safetensors'

    const result = await generateRemoteImage({ imageProvider: 'comfyui', imageProviders: providers }, 'cinematic cat')

    expect(routes[0]).toBe('http://127.0.0.1:8188/prompt')
    expect(routes[1]).toBe('http://127.0.0.1:8188/history/comfy-1')
    expect(routes[2]).toContain('http://127.0.0.1:8188/view?')
    expect(result?.provider).toBe('comfyui')
    expect(result?.url).toMatch(/^data:image\/png;base64,/)
  })

  it('injects prompts into an imported ComfyUI API workflow', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/prompt')) {
        const body = JSON.parse(String(init?.body))
        expect(body.prompt['6'].inputs.text).toContain('custom workflow fox')
        expect(body.prompt['7'].inputs.text).toContain('bad quality')
        return jsonResponse({ prompt_id: 'custom-1' })
      }
      if (url.endsWith('/history/custom-1')) return jsonResponse({ 'custom-1': { outputs: { '9': { images: [{ filename: 'custom.png', type: 'output' }] } } } })
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'Content-Type': 'image/png' } })
    }))
    const providers = createDefaultImageProviders()
    providers.comfyui.workflowMode = 'custom'
    providers.comfyui.negativePrompt = 'bad quality'
    providers.comfyui.workflow = {
      '3': { class_type: 'KSampler', inputs: { positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0], seed: 1, steps: 10, cfg: 5, sampler_name: 'euler', scheduler: 'normal' } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } },
      '6': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '7': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
      '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } },
    }
    const result = await generateRemoteImage({ imageProvider: 'comfyui', imageProviders: providers }, 'custom workflow fox')
    expect(result?.provider).toBe('comfyui')
  })

  it('resumes an existing Atlas prediction without submitting or charging again', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).not.toBe('POST')
      expect(String(input)).toContain('/model/prediction/prediction-existing')
      return jsonResponse({ data: { status: 'completed', outputs: ['https://cdn.example/resumed.png'] } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const providers = createDefaultImageProviders()
    providers.atlas.apiKey = 'atlas-test-key'

    const result = await generateRemoteImage(
      { imageProvider: 'atlas', imageProviders: providers },
      'frozen prompt',
      { predictionId: 'prediction-existing' },
    )

    expect(result?.url).toBe('https://cdn.example/resumed.png')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows ComfyUI workflow validation details when prompt submission is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      error: { message: 'Prompt outputs failed validation' },
      node_errors: { '4': { errors: [{ message: 'Value not in list: ckpt_name' }] } },
    })))
    const providers = createDefaultImageProviders()
    providers.comfyui.model = 'missing.safetensors'

    await expect(generateRemoteImage({ imageProvider: 'comfyui', imageProviders: providers }, 'portrait'))
      .rejects.toThrow(/Prompt outputs failed validation.*ckpt_name/)
  })

  it('uses X-API-Key authentication and returns every image from the selected output', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('X-API-Key')).toBe('secret-key')
      const url = String(input)
      if (url.endsWith('/prompt')) return jsonResponse({ prompt_id: 'batch-1', number: 2 })
      if (url.endsWith('/history/batch-1')) return jsonResponse({
        'batch-1': { outputs: { '9': { images: [{ filename: 'one.png', type: 'output' }, { filename: 'two.png', type: 'output' }] } } },
      })
      return new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'Content-Type': 'image/png' } })
    }))
    const providers = createDefaultImageProviders()
    providers.comfyui.model = 'model.safetensors'
    providers.comfyui.authMode = 'x-api-key'
    providers.comfyui.apiKey = 'secret-key'

    const result = await generateRemoteImage({ imageProvider: 'comfyui', imageProviders: providers }, 'batch portrait')

    expect(result?.urls).toHaveLength(2)
    expect(result?.url).toBe(result?.urls?.[0])
  })

  it('calls the A1111 / Forge txt2img endpoint and wraps its base64 image', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('http://127.0.0.1:7860/sdapi/v1/txt2img')
      const body = JSON.parse(String(init?.body))
      expect(body.prompt).toContain('watercolor fox')
      expect(body.cfg_scale).toBe(7)
      return jsonResponse({ images: ['AQID'] })
    }))
    const providers = createDefaultImageProviders()

    const result = await generateRemoteImage({ imageProvider: 'stable-diffusion', imageProviders: providers }, 'watercolor fox')

    expect(result).toEqual({
      url: 'data:image/png;base64,AQID',
      query: 'watercolor fox',
      provider: 'stable-diffusion',
    })
  })
})
