import { useRef, useState } from 'react'
import { Image } from 'lucide-react'
import { AVATAR_EMOJIS } from '../lib/avatarEmojis'
import { ImageCropper } from './ImageCropper'
import { Avatar } from './Avatar'
import { searchAnimeAvatar, searchPexelsPhoto } from '../lib/photoSearch'
import { generateRemoteImage } from '../lib/remoteMedia'
import { composeImagePrompt } from '../lib/imageAssets'
import { isImageProviderReady } from '../lib/mediaProviders'
import type { AppSettings, Contact } from '../types'

interface AvatarPickerProps {
  onSelect: (avatar: string, photographer?: { name?: string; url?: string }) => void
  onClose: () => void
  /** Only contact avatars have a "persona photo" concept worth re-searching later — omit for group/user avatars, which hides the search option entirely. */
  settings?: Pick<AppSettings, 'pexelsApiKey' | 'animeNsfwEnabled' | 'avatarImageSource' | 'imageProvider' | 'imageProviders' | 'userNickname' | 'userGender' | 'userBio'>
  subject?: Contact
}

export function AvatarPicker({ onSelect, onClose, settings, subject }: AvatarPickerProps) {
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [searchingPhoto, setSearchingPhoto] = useState(false)
  const [photoKeyword, setPhotoKeyword] = useState('')
  const [photoError, setPhotoError] = useState('')

  const source = settings?.avatarImageSource

  async function handlePhotoSearch() {
    if (!photoKeyword.trim() || !settings || !source) return
    setSearchingPhoto(true)
    setPhotoError('')
    try {
      const photo = source === 'anime'
        ? await searchAnimeAvatar(photoKeyword, settings.animeNsfwEnabled)
        : source === 'generated'
          ? await generateRemoteImage(settings as AppSettings, composeImagePrompt({ scene: `square profile avatar, head-and-shoulders portrait, ${photoKeyword}`, kind: 'portrait', contacts: subject ? [subject] : [], includeUser: false, settings: settings as AppSettings }), { seed: subject?.visualSeed })
          : await searchPexelsPhoto(settings.pexelsApiKey, photoKeyword.trim(), 'square')
      if (!photo) {
        setPhotoError('没搜到合适的图片 换个描述试试')
        return
      }
      onSelect(photo.url, { name: 'photographer' in photo ? photo.photographer : undefined, url: 'photographerUrl' in photo ? photo.photographerUrl : undefined })
      onClose()
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : String(error))
    } finally {
      setSearchingPhoto(false)
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPendingImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  if (pendingImage) {
    return (
      <ImageCropper
        src={pendingImage}
        onCancel={() => setPendingImage(null)}
        onConfirm={(dataUrl) => {
          onSelect(dataUrl)
          onClose()
        }}
      />
    )
  }

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/30" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-gray-900">选择头像</h2>
          <button onClick={onClose} className="text-sm text-gray-400">
            取消
          </button>
        </div>

        <button
          onClick={() => fileInput.current?.click()}
          className="mb-3 flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left active:bg-gray-100"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--ui-special-soft)] text-lg">
            <Image size={20} />
          </div>
          <span className="text-sm text-gray-800">从相册导入图片</span>
        </button>
        <input ref={fileInput} type="file" accept="image/*" onChange={handleFile} className="hidden" />

        {settings && source && (source !== 'generated' || isImageProviderReady(settings)) && (
          <div className="mb-3 rounded-xl bg-gray-50 p-3">
            <p className="mb-1 text-xs text-gray-500">当前来源：{source === 'pexels' ? 'Pexels 实拍图' : source === 'anime' ? 'Waifu.im 动漫图库（按标签搜索）' : '生图系统生成'}</p>
            <p className="mb-2 text-sm text-gray-800">按当前来源获取一张符合人设的头像</p>
            <div className="flex gap-2">
              <input
                value={photoKeyword}
                onChange={(e) => setPhotoKeyword(e.target.value)}
                placeholder={source === 'anime' ? '输入图库标签，例如 maid、waifu' : '描述一下想要的样子，例如温柔女生肖像'}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <button
                onClick={handlePhotoSearch}
                disabled={searchingPhoto || !photoKeyword.trim()}
                className="shrink-0 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                {searchingPhoto ? '搜索中…' : '搜索'}
              </button>
            </div>
            {photoError && <p className="mt-1.5 text-xs text-red-500">{photoError}</p>}
          </div>
        )}

        <div className="grid grid-cols-6 gap-2">
          {AVATAR_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                onSelect(e)
                onClose()
              }}
              className="flex items-center justify-center rounded-xl bg-gray-50 py-2 active:bg-gray-100"
            >
              <Avatar avatar={e} size={36} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
