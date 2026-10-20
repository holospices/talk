import { v4 as uuid } from 'uuid'
import { db } from '../db/db'
import { createBackup, mergeSettingsPreservingSecrets, restoreBackup, type TalkBackup } from './backup'
import { useSettingsStore } from '../store/useSettingsStore'
import { resetAllChatTurns } from './chatEngine'
import { resetAllGroupChatTurns } from './groupChatEngine'

export async function writeSaveSlot(slot: number, name: string) {
  if (slot < 1 || slot > 100) throw new Error('存档位无效')
  const settings = { ...useSettingsStore.getState() } as Record<string, unknown>; delete settings.setSettings
  const snapshot = await createBackup(settings)
  const existing = await db.saveSlots.where('slot').equals(slot).first()
  const now = Date.now()
  await db.saveSlots.put({ id: existing?.id ?? uuid(), slot, name: name.trim() || `存档 ${slot}`, snapshot, createdAt: existing?.createdAt ?? now, updatedAt: now })
}

export async function loadSaveSlot(slot: number) {
  const save = await db.saveSlots.where('slot').equals(slot).first()
  if (!save) throw new Error('该存档位为空')
  resetAllChatTurns()
  resetAllGroupChatTurns()
  const snapshot = save.snapshot as TalkBackup
  await restoreBackup(snapshot)
  useSettingsStore.setState(mergeSettingsPreservingSecrets(snapshot.settings, useSettingsStore.getState()))
}

export async function deleteSaveSlot(slot: number) {
  const save = await db.saveSlots.where('slot').equals(slot).first()
  if (save) await db.saveSlots.delete(save.id)
}
