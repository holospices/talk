/**
 * Real-photo sourcing for auto-generated contact avatars and moments
 * illustrations — see lib/avatarCategory.ts for the category-picking logic
 * (code-driven, not LLM) that decides when each of these gets used.
 */
import { friendlyConnectionError, httpFailureMessage, parseJsonText, requireApiKey } from './connectionError'
import { appFetch } from './appFetch'

export interface PhotoResult {
  url: string
  photographer?: string
  photographerUrl?: string
}

export function apiKeyFingerprint(apiKey: string): string {
  const key = apiKey.trim()
  return `len=${key.length} 末4位=${key.slice(-4) || '无'}`
}

/** landscape/pet/person categories all go through Pexels, just with different search keywords and orientations. */
export async function searchPexelsPhoto(
  apiKey: string,
  query: string,
  orientation: 'square' | 'landscape' = 'square',
  signal?: AbortSignal,
  strict = false,
): Promise<PhotoResult | null> {
  try {
    const key = requireApiKey(apiKey, 'Pexels')
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=${orientation}`
    const fingerprint = apiKeyFingerprint(key)
    console.info(`[photo] Pexels请求 query="${query}" key:${fingerprint}`)
    const res = await appFetch(url, { headers: { Authorization: key }, signal })
    const body = await res.text()
    let json: { photos?: unknown } & Record<string, unknown>
    try {
      json = parseJsonText(body, 'Pexels') as typeof json
    } catch (error) {
      if (res.ok || /^\s*</.test(body)) throw error
      json = { message: body.slice(0, 180) }
    }
    if (!res.ok) {
      // Don't log the full key (even to the user's own console), but its
      // length + last 4 chars is enough to tell truncated keys apart.
      console.warn(
        `[photo] Pexels搜索失败 query="${query}" HTTP ${res.status} key:${fingerprint} body:${body.slice(0, 200)}`,
      )
      throw new Error(httpFailureMessage('Pexels', res.status, json))
    }
    if (!Array.isArray(json?.photos)) throw new Error('Pexels 返回的数据格式不正确，请确认使用的是 Pexels API Key')
    const photo = json.photos[0]
    if (!photo) {
      console.warn(`[photo] Pexels搜索无结果 query="${query}"`)
      return null
    }
    const record = photo && typeof photo === 'object' ? photo as Record<string, unknown> : {}
    const sources = record.src && typeof record.src === 'object' ? record.src as Record<string, unknown> : {}
    const src = orientation === 'square' ? (sources.medium ?? sources.small) : (sources.large ?? sources.medium)
    if (typeof src !== 'string' || !src) {
      console.warn(`[photo] Pexels返回结果但没有可用图片链接 query="${query}"`)
      if (strict) throw new Error('Pexels 返回了图片记录，但第一项没有可用的图片 URL')
      return null
    }
    const photographer = typeof record.photographer === 'string' ? record.photographer : undefined
    console.log(`[photo] Pexels搜索成功 query="${query}" key:${fingerprint} photographer=${photographer ?? '未知'}`)
    return {
      url: String(src),
      photographer,
      photographerUrl: typeof record.photographer_url === 'string' ? record.photographer_url : undefined,
    }
  } catch (error) {
    throw new Error(friendlyConnectionError(error, 'Pexels'))
  }
}

export interface PexelsConnectionResult {
  photo: PhotoResult
  fingerprint: string
  verifiedAt: number
}

/** A successful check must prove that this exact key can return a real image. */
export async function testPexelsConnection(apiKey: string, signal?: AbortSignal): Promise<PexelsConnectionResult> {
  const key = requireApiKey(apiKey, 'Pexels')
  const photo = await searchPexelsPhoto(key, 'apple', 'square', signal, true)
  if (!photo) throw new Error('Pexels 连接成功，但测试搜索返回了空 photos 数组')
  try {
    const url = new URL(photo.url)
    if (!/^https?:$/.test(url.protocol)) throw new Error('protocol')
  } catch {
    throw new Error('Pexels 返回了图片记录，但第一项没有可用的图片 URL')
  }
  return { photo, fingerprint: apiKeyFingerprint(key), verifiedAt: Date.now() }
}

/** Waifu.im returns a tagged random anime illustration without requiring a user key. */
const ANIME_CATEGORIES = ['waifu', 'neko']

type WaifuImageResponse = { items?: Array<{ url?: unknown }> }

export async function requestAnimeImageLegacy(params: URLSearchParams): Promise<PhotoResult | null> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 1; attempt++) {
    try {
      const res = await appFetch(`https://api.waifu.im/images?${params}`)
      if (!res.ok) {
        // A malformed/unknown tag will not become valid by retrying.
        if (res.status === 400) throw Object.assign(new Error('没有这个动漫图库标签；可试试 waifu、husbando、maid、neko'), { noRetry: true })
        throw new Error(`Waifu.im请求失败 HTTP ${res.status}`)
      }
      const json = await res.json() as WaifuImageResponse
      const url = json.items?.[0]?.url
      if (typeof url === 'string') return { url }
      throw new Error('Waifu.im返回结果没有图片链接')
    } catch (error) {
      lastError = error
      if ((error as { noRetry?: boolean }).noRetry || attempt === 1) break
      console.warn(`[photo] Waifu.im 第 ${attempt} 次请求失败，正在重试`, error)
    }
  }
  throw new Error(`Waifu.im 连续请求五次失败，请稍后再试${lastError instanceof Error ? `（${lastError.message}）` : ''}`)
}

/** One request per user action: retries are deliberately manual. */
async function requestAnimeImage(params: URLSearchParams): Promise<PhotoResult | null> {
  try {
    const res = await appFetch(`https://api.waifu.im/images?${params}`)
    if (!res.ok) throw new Error(`Waifu.im request failed: HTTP ${res.status}`)
    const json = await res.json() as WaifuImageResponse
    const url = json.items?.[0]?.url
    if (typeof url !== 'string') throw new Error('Waifu.im did not return an image URL')
    return { url }
  } catch (error) {
    throw error instanceof Error ? error : new Error('Anime image request failed')
  }
}

export async function randomAnimeAvatar(nsfw = false): Promise<PhotoResult | null> {
  const category = ANIME_CATEGORIES[Math.floor(Math.random() * ANIME_CATEGORIES.length)]
  const params = new URLSearchParams({ IncludedTags: category, IsNsfw: nsfw ? 'All' : 'False', PageSize: '1' })
  const image = await requestAnimeImage(params)
  console.log(`[photo] Waifu.im获取成功 category=${category}`)
  return image
}

/** Search the curated anime archive by one of its tags (for example `maid`, `waifu`, or `husbando`). */
export async function searchAnimeAvatar(tag: string, nsfw = false): Promise<PhotoResult | null> {
  const normalized = tag.trim().toLowerCase()
  if (!normalized) return null
  const params = new URLSearchParams({ IncludedTags: normalized, IsNsfw: nsfw ? 'All' : 'False', PageSize: '1' })
  return requestAnimeImage(params)
}
