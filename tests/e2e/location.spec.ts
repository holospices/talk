import { expect, test } from 'playwright/test'

async function seedLocationPeople(page: import('playwright/test').Page) {
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    const { ensureLocationsInitialized } = await import('/src/lib/locations.ts')
    await ensureLocationsInitialized()
    const base = { avatar: '🙂', avatarColor: '#ddd', systemPrompt: '自然', createdAt: 1, memoryFacts: '', memoryStyle: '', memoryUpdatedAt: 0, memoryMessageCursor: 0, relationshipBase: '朋友', relationshipDynamic: '', locationSource: 'manual' as const }
    await db.contacts.bulkPut([
      { ...base, id: 'cafe-person', name: '咖啡店的人', currentLocationId: 'mall-cafe' },
      { ...base, id: 'atrium-person', name: '中庭的人', currentLocationId: 'mall-atrium' },
      { ...base, id: 'away-person', name: '医院的人', currentLocationId: 'hospital-clinic' },
    ])
  })
}

test('location map and chat use real dynamic participants', async ({ page }) => {
  await page.goto('/#/discover')
  await seedLocationPeople(page)
  await page.reload()
  await expect(page.getByText('地点', { exact: true })).toBeVisible()
  await page.getByText('地点', { exact: true }).click()
  await expect(page.getByRole('heading', { name: '地点' })).toBeVisible()

  await expect(page.getByRole('button', { name: /中心商场 · 2人/ })).toBeVisible()
  await page.getByRole('button', { name: /中心商场 · 2人/ }).click()
  await expect(page.getByRole('button', { name: /咖啡店 1人/ })).toBeVisible()
  await page.getByRole('button', { name: /咖啡店 1人/ }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByText('地点群聊 · 咖啡店', { exact: true })).toBeVisible()

  const memberIds = await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts')
    return (await db.groups.get('talk-location-group'))?.memberContactIds.sort()
  })
  expect(memberIds).toEqual(['atrium-person', 'cafe-person'])

  await page.getByText('地点群聊 · 咖啡店', { exact: true }).click()
  await page.getByLabel('群聊信息').click()
  await expect(page.getByText('正在这里 · 1', { exact: true })).toBeVisible()
  await expect(page.getByText('附近能听见 · 1', { exact: true })).toBeVisible()
  await expect(page.getByText('不在这里 · 1', { exact: true })).toBeVisible()
  await expect(page.getByText('咖啡店的人', { exact: true })).toBeVisible()
  await expect(page.getByText('中庭的人', { exact: true })).toBeVisible()
  await expect(page.getByText('医院的人', { exact: true })).toBeVisible()
  await expect(page.getByText('群成员', { exact: true })).toHaveCount(0)
  await expect(page.getByText('群聊热闹程度', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /热闹/ }).click()
  await expect.poll(() => page.evaluate(async () => (await (await import('/src/db/db.ts')).db.groups.get('talk-location-group'))?.energyLevel)).toBe('lively')
  await expect(page.getByText('解散群聊', { exact: true })).toHaveCount(0)
})

test('disabling the module hides both entry and system-pinned conversation', async ({ page }) => {
  await page.goto('/#/discover')
  await seedLocationPeople(page)
  await page.evaluate(async () => {
    const { enterLocation } = await import('/src/lib/locations.ts')
    await enterLocation('mall-cafe')
    const { useSettingsStore } = await import('/src/store/useSettingsStore.ts')
    const enabledModules = useSettingsStore.getState().enabledModules.filter((id) => id !== 'location')
    useSettingsStore.getState().setSettings({ enabledModules })
  })
  await page.reload()
  await expect(page.getByText('地点', { exact: true })).toHaveCount(0)
  await page.goto('/#/')
  await expect(page.getByText('地点群聊 · 咖啡店', { exact: true })).toHaveCount(0)
})
