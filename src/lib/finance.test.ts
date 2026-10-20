import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { useSettingsStore } from '../store/useSettingsStore'
import {
  USER_WALLET_ID,
  claimRedPacket,
  claimDailySalaries,
  ensureWallets,
  getBalance,
  reserveRedPacket,
  transferFunds,
} from './finance'

async function clearDatabase() {
  await db.open()
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}

beforeEach(async () => {
  localStorage.clear()
  useSettingsStore.setState({ walletBalance: 100, walletMigrated: false })
  await clearDatabase()
})

describe('wallet ledger', () => {
  it('migrates the legacy balance exactly once', async () => {
    useSettingsStore.setState({ walletBalance: 88, walletMigrated: false })

    await ensureWallets()
    await ensureWallets()

    expect(await getBalance(USER_WALLET_ID)).toBe(88)
    expect(await db.walletTransactions.where('idempotencyKey').equals('legacy-wallet-migration').count()).toBe(1)
    expect(useSettingsStore.getState().walletMigrated).toBe(true)
  })

  it('does not resurrect a legacy balance after migration', async () => {
    useSettingsStore.setState({ walletBalance: 88, walletMigrated: true })

    await ensureWallets()

    expect(await getBalance(USER_WALLET_ID)).toBe(0)
    expect(await db.walletTransactions.count()).toBe(0)
  })

  it('conserves balances and makes retries idempotent', async () => {
    await db.walletAccounts.bulkPut([
      { ownerId: USER_WALLET_ID, balance: 100, updatedAt: 1 },
      { ownerId: 'contact-a', balance: 20, updatedAt: 1 },
    ])
    const input = { from: USER_WALLET_ID, to: 'contact-a', amount: 30, kind: 'transfer' as const, idempotencyKey: 'transfer:test' }

    const first = await transferFunds(input)
    const retry = await transferFunds(input)

    expect(retry.id).toBe(first.id)
    expect(await getBalance(USER_WALLET_ID)).toBe(70)
    expect(await getBalance('contact-a')).toBe(50)
    expect((await getBalance(USER_WALLET_ID)) + (await getBalance('contact-a'))).toBe(120)
    expect(await db.walletTransactions.count()).toBe(1)
  })

  it('rejects reuse of an idempotency key for a different transaction', async () => {
    await db.walletAccounts.put({ ownerId: USER_WALLET_ID, balance: 100, updatedAt: 1 })
    await transferFunds({ from: USER_WALLET_ID, to: 'contact-a', amount: 10, kind: 'transfer', idempotencyKey: 'same-key' })

    await expect(transferFunds({ from: USER_WALLET_ID, to: 'contact-a', amount: 20, kind: 'transfer', idempotencyKey: 'same-key' })).rejects.toThrow('幂等键已用于另一笔交易')
    expect(await getBalance(USER_WALLET_ID)).toBe(90)
    expect(await getBalance('contact-a')).toBe(10)
  })

  it('rolls back an insufficient-balance transfer', async () => {
    await db.walletAccounts.put({ ownerId: USER_WALLET_ID, balance: 10, updatedAt: 1 })

    await expect(transferFunds({ from: USER_WALLET_ID, to: 'contact-a', amount: 11, kind: 'transfer' })).rejects.toThrow('余额不足')

    expect(await getBalance(USER_WALLET_ID)).toBe(10)
    expect(await getBalance('contact-a')).toBe(0)
    expect(await db.walletTransactions.count()).toBe(0)
  })

  it('reserves and claims a red packet only once', async () => {
    await db.walletAccounts.bulkPut([
      { ownerId: 'contact-a', balance: 100, updatedAt: 1 },
      { ownerId: USER_WALLET_ID, balance: 0, updatedAt: 1 },
    ])

    const reserved = await reserveRedPacket('contact-a', 25, '测试红包', 'red-packet:test')
    expect(reserved.status).toBe('reserved')
    expect(await getBalance('contact-a')).toBe(75)

    await claimRedPacket(reserved.id, USER_WALLET_ID)
    await expect(claimRedPacket(reserved.id, USER_WALLET_ID)).rejects.toThrow('红包已领取或不存在')

    expect(await getBalance(USER_WALLET_ID)).toBe(25)
    expect((await getBalance(USER_WALLET_ID)) + (await getBalance('contact-a'))).toBe(100)
  })

  it('pays the user and every employed contact once per daily claim', async () => {
    useSettingsStore.setState({ enabledModules: ['career'], userOccupation: '设计师', userMonthlySalary: 9000, walletMigrated: true })
    await db.contacts.add({ id: 'salary-ai', name: '小林', avatar: '🙂', avatarColor: '#eee', systemPrompt: '测试', occupation: '编辑', monthlySalary: 6000, createdAt: 1, memoryFacts: '', memoryStyle: '', memoryUpdatedAt: 0, memoryMessageCursor: 0, relationshipBase: '朋友', relationshipDynamic: '' })

    const result = await claimDailySalaries('2026-07-31')

    expect(result).toMatchObject({ userAmount: 300, contactAmount: 200, contactCount: 1 })
    expect(await getBalance(USER_WALLET_ID)).toBe(300)
    expect(await getBalance('salary-ai')).toBe(200)
    await expect(claimDailySalaries('2026-07-31')).rejects.toThrow('今天已经领取过工资了')
  })
})
