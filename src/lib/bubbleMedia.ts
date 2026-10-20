import { isImageProviderReady, isStickerProviderReady } from './mediaProviders'
import { searchPexelsPhoto } from './photoSearch'
import { generateRemoteImage, searchRemoteStickers, type RemoteStickerResult } from './remoteMedia'
import type { AppSettings, Message, Sticker } from '../types'

interface MediaBubble {
  type: string
  query?: string
  caption?: string
  name?: string
}

export interface ResolvedBubbleMedia {
  imagePayload?: Message['image']
  imageFailed: boolean
  remoteSticker?: RemoteStickerResult
  stickerFailed: boolean
}

/** Resolve optional remote media while preserving the text fallback contract. */
export async function resolveBubbleMedia(
  bubble: MediaBubble,
  settings: AppSettings,
  stickers: Sticker[],
): Promise<ResolvedBubbleMedia> {
  let imagePayload: Message['image']
  let imageFailed = false

  if (bubble.type === 'image') {
    const query = bubble.query ?? ''
    if (isImageProviderReady(settings)) {
      try {
        const generated = await generateRemoteImage(settings, query)
        if (generated) {
          imagePayload = {
            url: generated.url,
            caption: bubble.caption,
            query,
            provider: generated.provider,
          }
        }
      } catch (error) {
        console.warn('[media] 图片生成接口失败', error)
        imageFailed = true
      }
    }

    if (!imagePayload && !imageFailed) {
      if (!settings.pexelsApiKey) {
        imageFailed = true
      } else {
        try {
          const photo = await searchPexelsPhoto(settings.pexelsApiKey, query, 'landscape')
          if (!photo) {
            imageFailed = true
          } else {
            imagePayload = {
              url: photo.url,
              caption: bubble.caption,
              photographer: photo.photographer,
              photographerUrl: photo.photographerUrl,
              query,
            }
          }
        } catch (error) {
          console.warn('[media] 聊天图片搜索失败', error)
          imageFailed = true
        }
      }
    }
  }

  let remoteSticker: RemoteStickerResult | undefined
  let stickerFailed = false
  if (bubble.type === 'sticker' && !stickers.some((sticker) => sticker.name === bubble.name)) {
    if (!isStickerProviderReady(settings)) {
      stickerFailed = true
    } else {
      try {
        remoteSticker = (await searchRemoteStickers(settings, bubble.name ?? ''))[0]
        if (!remoteSticker) stickerFailed = true
      } catch (error) {
        console.warn('[media] 远程表情包获取失败', error)
        stickerFailed = true
      }
    }
  }

  return { imagePayload, imageFailed, remoteSticker, stickerFailed }
}
