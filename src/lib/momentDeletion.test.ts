import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { deleteMomentCompletely } from './moments'
import { useSettingsStore } from '../store/useSettingsStore'

beforeEach(async () => {
  await db.open()
  await Promise.all([db.moments.clear(), db.momentComments.clear(), db.momentLikes.clear(), db.socialEvents.clear(), db.mediaAssets.clear()])
  useSettingsStore.getState().setSettings({ albumSavedImages: [], hiddenAlbumUrls: [] })
})

describe('moment deletion', () => {
  it('removes comments, likes and social events with the post', async () => {
    await db.moments.add({ id: 'moment-a', contactId: 'user', content: '测试动态', createdAt: 1 })
    await db.momentComments.add({ id: 'comment-a', momentId: 'moment-a', authorContactId: 'user', content: '评论', createdAt: 2 })
    await db.momentLikes.add({ id: 'like-a', momentId: 'moment-a', likerId: 'user', createdAt: 2 })
    await db.socialEvents.add({ id: 'event-a', type: 'moment_commented', actorId: 'user', relatedContactIds: ['contact-a'], momentId: 'moment-a', summary: '测试', importance: 1, createdAt: 2 })

    expect(await deleteMomentCompletely('moment-a')).toBe(true)
    expect(await db.moments.get('moment-a')).toBeUndefined()
    expect(await db.momentComments.where('momentId').equals('moment-a').count()).toBe(0)
    expect(await db.momentLikes.where('momentId').equals('moment-a').count()).toBe(0)
    expect(await db.socialEvents.filter((event) => event.momentId === 'moment-a').count()).toBe(0)
  })

  it('keeps a deleted Moment image as a standalone album image', async () => {
    await db.moments.add({ id: 'moment-image', contactId: 'user', content: '带照片的动态', imageUrl: 'https://images.pexels.com/photos/1.jpg', createdAt: 3 })

    expect(await deleteMomentCompletely('moment-image')).toBe(true)
    expect(useSettingsStore.getState().albumSavedImages).toEqual([{
      url: 'https://images.pexels.com/photos/1.jpg',
      createdAt: 3,
      source: 'Pexels 实拍图',
      caption: '带照片的动态',
    }])
  })

  it('deletes the persistent generated-image asset linked to a Moment', async () => {
    await db.mediaAssets.add({ id: 'asset-a', origin: 'moment', originId: 'moment-asset', ownerContactIds: [], provider: 'atlas', status: 'completed', phase: 'completed', scene: 'lake', kind: 'scene', prompt: 'lake', attempt: 1, createdAt: 1, updatedAt: 2 })
    await db.moments.add({ id: 'moment-asset', contactId: 'user', content: 'lake', imageAssetId: 'asset-a', createdAt: 1 })
    await deleteMomentCompletely('moment-asset')
    expect(await db.mediaAssets.get('asset-a')).toBeUndefined()
  })
})
