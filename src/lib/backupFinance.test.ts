import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { useSettingsStore } from '../store/useSettingsStore'
import { createBackup, restoreBackup } from './backup'
import { getBalance, transferFunds, USER_WALLET_ID } from './finance'
import { loadSaveSlot, writeSaveSlot } from './saveSlots'

async function clearDatabase() {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}

beforeEach(async () => {
  localStorage.clear()
  useSettingsStore.setState({ walletBalance: 100, walletMigrated: true, userNickname: '测试用户' })
  await clearDatabase()
})

describe('wallet backup and save slots', () => {
  it('never writes API credentials into a backup', async () => {
    const current = useSettingsStore.getState()
    const backup = await createBackup({
      ...current,
      apiKey: 'chat-secret',
      tavilyApiKey: 'search-secret',
      imageProviders: { ...current.imageProviders, atlas: { ...current.imageProviders.atlas, apiKey: 'atlas-secret' } },
    })
    const serialized = JSON.stringify(backup)
    expect(serialized).not.toContain('chat-secret')
    expect(serialized).not.toContain('search-secret')
    expect(serialized).not.toContain('atlas-secret')
  })

  it('round-trips wallet accounts and transactions through a backup', async () => {
    await db.walletAccounts.put({ ownerId: USER_WALLET_ID, balance: 100, updatedAt: 1 })
    await transferFunds({ from: USER_WALLET_ID, to: 'contact-a', amount: 35, kind: 'transfer', idempotencyKey: 'backup:transfer' })
    const backup = await createBackup({ ...useSettingsStore.getState() })

    await db.walletAccounts.update(USER_WALLET_ID, { balance: 1 })
    await db.walletTransactions.clear()
    await restoreBackup(backup)

    expect(await getBalance(USER_WALLET_ID)).toBe(65)
    expect(await getBalance('contact-a')).toBe(35)
    expect((await db.walletTransactions.where('idempotencyKey').equals('backup:transfer').first())?.amount).toBe(35)
  })

  it('creates a user account when restoring a legacy backup without wallet tables', async () => {
    const backup = await createBackup({ walletBalance: 42, walletMigrated: false })
    backup.tables.walletAccounts = []
    backup.tables.walletTransactions = []

    await restoreBackup(backup)

    expect(await getBalance(USER_WALLET_ID)).toBe(42)
    expect(await db.walletTransactions.where('idempotencyKey').equals('legacy-wallet-migration').count()).toBe(1)
  })

  it('restores the ledger and settings from a save slot', async () => {
    await db.walletAccounts.put({ ownerId: USER_WALLET_ID, balance: 321, updatedAt: 1 })
    useSettingsStore.setState({ userNickname: '存档前', walletMigrated: true })
    await writeSaveSlot(1, '钱包存档')

    await db.walletAccounts.update(USER_WALLET_ID, { balance: 5 })
    useSettingsStore.setState({ userNickname: '存档后' })
    await loadSaveSlot(1)

    expect(await getBalance(USER_WALLET_ID)).toBe(321)
    expect(useSettingsStore.getState().userNickname).toBe('存档前')
  })

  it('keeps structured AI memories isolated between save slots', async () => {
    const base = { contactId: 'contact-a', scope: 'private' as const, category: '重要事件' as const, kind: 'general' as const, tags: [], importance: 0.8, emotionalWeight: 0.5, confidence: 1, sourceMessageIds: [], createdAt: 1, updatedAt: 1, usageCount: 0 }
    await db.contactMemories.add({ ...base, id: 'memory-a', content: '只属于存档A' })
    await writeSaveSlot(1, '存档A')
    await db.contactMemories.clear()
    await db.contactMemories.add({ ...base, id: 'memory-b', content: '只属于存档B' })

    await loadSaveSlot(1)

    expect((await db.contactMemories.toArray()).map((memory) => memory.id)).toEqual(['memory-a'])
  })
})
