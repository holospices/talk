import { chatCompletion, type ChatCompletionOptions } from './deepseek'
import { parseJsonLoose } from './aiProtocol'
import { describeCurrentSchedule, describeUpcomingScheduleText } from './schedule'
import { describeCurrentTime } from './time'
import type { AppSettings, Contact, LocationNode } from '../types'

export interface ProposedSpecialTask {
  locationId: string
  startsAt: number
  endsAt: number
  activity: string
  summary: string
  phoneAccess: 'available' | 'unavailable'
}

interface ProposalVote {
  decision: 'create_special_task' | 'none'
  locationId?: string
  date?: string
  startTime?: string
  durationMinutes?: number
  activity?: string
  summary?: string
  phoneAccess?: 'available' | 'unavailable'
  confidence: number
  reason: string
}

interface CommitmentVote {
  commitment: 'none' | 'considering' | 'agreed'
  locationId?: string
  confidence: number
  reason: string
}

interface FeasibilityVote {
  allowed: boolean
  hardConflict: boolean
  locationId?: string
  confidence: number
  reason: string
}

export interface ActionCommitteeDebug {
  proposal: ProposalVote | null
  commitment: CommitmentVote | null
  feasibility: FeasibilityVote | null
  approved: boolean
  reason: string
  task?: ProposedSpecialTask
}

/**
 * Single-request mode lets the speaking model emit the task decision itself.
 * We still run the same deterministic guards locally, without another model
 * request. The synthetic votes make the decision visible in existing admin
 * diagnostics while clearly identifying its source.
 */
export function evaluateDirectSpecialTask(raw: string, locations: LocationNode[], now: number, triggeringUserText = ''): ActionCommitteeDebug {
  // A single-call response must never turn an open negotiation into a real
  // task by inventing the missing time. These phrases are deliberately
  // conservative: they express that the current user message still leaves
  // the timing unresolved, regardless of what the model put in its JSON.
  if (/(几点|什么时候|何时|你来定|你定时间|先洗头|先收拾|看情况)/.test(triggeringUserText)) {
    return { proposal: null, commitment: null, feasibility: null, approved: false, reason: '当前对话仍在协商时间，不能创建特殊任务' }
  }
  const root = parseJsonLoose<Record<string, unknown>>(raw)
  const value = root?.specialTask
  if (!value || typeof value !== 'object') {
    return { proposal: null, commitment: null, feasibility: null, approved: false, reason: '直出结果未包含特殊任务决策' }
  }
  const task = value as Record<string, unknown>
  if (task.decision !== 'create_special_task') {
    const proposal: ProposalVote = { decision: 'none', confidence: 1, reason: typeof task.reason === 'string' ? task.reason.slice(0, 240) : '本轮没有形成特殊任务' }
    return { proposal, commitment: null, feasibility: null, approved: false, reason: proposal.reason }
  }

  const proposal: ProposalVote = {
    decision: 'create_special_task',
    locationId: typeof task.locationId === 'string' ? task.locationId.trim() : undefined,
    date: typeof task.date === 'string' ? task.date.trim() : undefined,
    startTime: typeof task.startTime === 'string' ? task.startTime.trim() : undefined,
    durationMinutes: Number.isFinite(Number(task.durationMinutes)) ? Math.round(Number(task.durationMinutes)) : undefined,
    activity: typeof task.activity === 'string' ? task.activity.trim().slice(0, 80) : undefined,
    summary: typeof task.summary === 'string' ? task.summary.trim().slice(0, 120) : undefined,
    phoneAccess: task.phoneAccess === 'unavailable' ? 'unavailable' : 'available',
    confidence: 1,
    reason: typeof task.reason === 'string' ? task.reason.trim().slice(0, 240) : '主模型在同一次调用中确认角色已明确答应',
  }
  const commitment: CommitmentVote = { commitment: 'agreed', locationId: proposal.locationId, confidence: 1, reason: '来自主模型同次结构化决策' }
  const feasibility: FeasibilityVote = { allowed: true, hardConflict: false, locationId: proposal.locationId, confidence: 1, reason: '交由本地硬规则校验' }
  const leafLocations = locations.filter((location) => !locations.some((candidate) => candidate.parentId === location.id))
  const result = arbitrateActionCommittee({ proposal, commitment, feasibility, validLocationIds: new Set(leafLocations.map((location) => location.id)), now })
  return { proposal, commitment, feasibility, ...result }
}

function clampConfidence(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0
}

function parseLocalTime(date: string | undefined, time: string | undefined) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const result = new Date(year, month - 1, day, hour, minute, 0, 0)
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result.getTime() : undefined
}

function parseProposal(raw: string): ProposalVote | null {
  const value = parseJsonLoose<Record<string, unknown>>(raw)
  if (!value || (value.decision !== 'create_special_task' && value.decision !== 'none')) return null
  return {
    decision: value.decision,
    locationId: typeof value.locationId === 'string' ? value.locationId.trim() : undefined,
    date: typeof value.date === 'string' ? value.date.trim() : undefined,
    startTime: typeof value.startTime === 'string' ? value.startTime.trim() : undefined,
    durationMinutes: Number.isFinite(Number(value.durationMinutes)) ? Math.round(Number(value.durationMinutes)) : undefined,
    activity: typeof value.activity === 'string' ? value.activity.trim().slice(0, 80) : undefined,
    summary: typeof value.summary === 'string' ? value.summary.trim().slice(0, 120) : undefined,
    phoneAccess: value.phoneAccess === 'unavailable' ? 'unavailable' : 'available',
    confidence: clampConfidence(value.confidence),
    reason: typeof value.reason === 'string' ? value.reason.trim().slice(0, 240) : '',
  }
}

function parseCommitment(raw: string): CommitmentVote | null {
  const value = parseJsonLoose<Record<string, unknown>>(raw)
  if (!value || !['none', 'considering', 'agreed'].includes(String(value.commitment))) return null
  return { commitment: value.commitment as CommitmentVote['commitment'], locationId: typeof value.locationId === 'string' ? value.locationId.trim() : undefined, confidence: clampConfidence(value.confidence), reason: typeof value.reason === 'string' ? value.reason.trim().slice(0, 240) : '' }
}

function parseFeasibility(raw: string): FeasibilityVote | null {
  const value = parseJsonLoose<Record<string, unknown>>(raw)
  if (!value || typeof value.allowed !== 'boolean' || typeof value.hardConflict !== 'boolean') return null
  return { allowed: value.allowed, hardConflict: value.hardConflict, locationId: typeof value.locationId === 'string' ? value.locationId.trim() : undefined, confidence: clampConfidence(value.confidence), reason: typeof value.reason === 'string' ? value.reason.trim().slice(0, 240) : '' }
}

export function arbitrateActionCommittee(input: { proposal: ProposalVote | null; commitment: CommitmentVote | null; feasibility: FeasibilityVote | null; validLocationIds: Set<string>; now: number }): Pick<ActionCommitteeDebug, 'approved' | 'reason' | 'task'> {
  const { proposal, commitment, feasibility } = input
  if (!proposal || !commitment || !feasibility) return { approved: false, reason: '行动委员会有成员未返回有效判断' }
  if (proposal.decision !== 'create_special_task') return { approved: false, reason: proposal.reason || '行动提议者认为没有形成特殊任务' }
  if (proposal.confidence < .65) return { approved: false, reason: '行动提议置信度不足' }
  if (commitment.commitment !== 'agreed' || commitment.confidence < .6) return { approved: false, reason: commitment.reason || '角色没有明确同意执行' }
  if (!feasibility.allowed || feasibility.hardConflict) return { approved: false, reason: feasibility.reason || '行为与当前硬前提冲突' }
  if (!proposal.locationId || !input.validLocationIds.has(proposal.locationId)) return { approved: false, reason: '行动提议没有指向合法的具体地点' }
  if (commitment.locationId && commitment.locationId !== proposal.locationId) return { approved: false, reason: '行动提议与承诺检测的地点不一致' }
  // The proposal owns the concrete task parameters. Feasibility only decides
  // whether that task is possible; its optional location is diagnostic and
  // must not veto an otherwise valid task merely because it picked a nearby
  // area (for example mall-atrium instead of the explicitly named mall-shop).
  const startsAt = parseLocalTime(proposal.date, proposal.startTime)
  const durationMinutes = proposal.durationMinutes ?? 0
  if (!startsAt || durationMinutes < 5 || durationMinutes > 24 * 60) return { approved: false, reason: '没有得到合法的精确起止时间' }
  if (startsAt < input.now - 5 * 60_000 || startsAt > input.now + 14 * 86_400_000) return { approved: false, reason: '任务开始时间超出允许范围' }
  if (!proposal.activity || !proposal.summary) return { approved: false, reason: '任务缺少活动或摘要' }
  return { approved: true, reason: '三个专项判断一致，允许创建特殊任务', task: { locationId: proposal.locationId, startsAt, endsAt: startsAt + durationMinutes * 60_000, activity: proposal.activity, summary: proposal.summary, phoneAccess: proposal.phoneAccess ?? 'available' } }
}

async function callJudge(options: ChatCompletionOptions) {
  try {
    const result = await chatCompletion(options)
    return result.status === 'ok' || (result.status === 'length' && result.content.trim()) ? result.content : ''
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return ''
  }
}

export async function runActionCommittee(input: { contact: Contact; settings: AppSettings; locations: LocationNode[]; playerText: string; draftText: string; now: number; signal?: AbortSignal; turnId: string; conversationId: string }): Promise<ActionCommitteeDebug> {
  const leafLocations = input.locations.filter((location) => !input.locations.some((candidate) => candidate.parentId === location.id))
  const validLocationIds = new Set(leafLocations.map((location) => location.id))
  const now = new Date(input.now)
  const compactContext = `当前时间：${describeCurrentTime(now)}\n角色：${input.contact.name}\n当前地点ID：${input.contact.currentLocationId || '未知'}\n当前任务：${describeCurrentSchedule(input.contact, now) || '空闲'}\n未来十四天任务：\n${describeUpcomingScheduleText(input.contact, now) || '无'}\n玩家消息：${input.playerText}\n角色聊天草稿：${input.draftText}\n合法具体地点：${leafLocations.map((location) => `${location.id}=${location.name}`).join('；')}`
  const common = { apiKey: input.settings.apiKey, baseUrl: input.settings.baseUrl, provider: input.settings.aiProvider, model: input.settings.utilityModel, jsonMode: true, thinking: 'disabled' as const, temperature: 0, purpose: 'quality' as const, signal: input.signal, trace: { turnId: input.turnId, stage: 'other' as const, conversationId: input.conversationId } }
  const [proposalRaw, commitmentRaw, feasibilityRaw] = await Promise.all([
    callJudge({ ...common, maxTokens: 320, messages: [{ role: 'system', content: `你是角色行动提议者。结合玩家请求和角色已经说出口的聊天草稿，提取一条角色明确同意的线下特殊任务。你是任务日期、时间、时长、活动和地点ID的唯一参数提取者。locationId只能逐字选自合法具体地点；无法可靠映射时必须留空。若玩家给出了精确时间、时长和地点，而角色无条件明确答应，可以沿用玩家给出的参数，无需角色机械复述。邀请、讨论、拒绝、假设、回忆、附带未满足条件或模糊的“以后再说”都不是任务。相对时间按当前时间换算。默认日程会被特殊任务整项覆盖。只输出JSON：{"decision":"create_special_task|none","locationId":"","date":"YYYY-MM-DD","startTime":"HH:mm","durationMinutes":30,"activity":"","summary":"","phoneAccess":"available|unavailable","confidence":0.0,"reason":""}\n\n${compactContext}` }, { role: 'user', content: '提取行动提议。' }] }),
    callJudge({ ...common, maxTokens: 220, messages: [{ role: 'system', content: `你是承诺证据检测器。你的核心职责只判断角色草稿是否已经明确同意一项要实际执行的线下安排，不负责重新选择任务参数。角色可以用“好啊”“可以”等自然话语接受玩家给出的完整参数，不要求复述；仅仅考虑、反问、拒绝、附加未满足条件或未来不确定计划不算 agreed。locationId只有在文本明确对应某个合法具体地点时才填写，否则留空。只输出JSON：{"commitment":"none|considering|agreed","locationId":"合法地点ID或空","confidence":0.0,"reason":""}\n\n${compactContext}` }, { role: 'user', content: '检测是否形成明确承诺。' }] }),
    callJudge({ ...common, maxTokens: 240, messages: [{ role: 'system', content: `你是行为合理性审查器。你的核心职责只判断玩家提出且角色答应的安排是否违反人物硬前提、当前任务、时间因果或地点事实，不负责重新选择任务地点。精确时间和时长可以来自玩家请求。特殊任务允许取消整条冲突的默认任务，所以仅仅与默认上班重叠不算硬冲突；但角色明确拒绝、双方都没有具体时间、地点不存在或表述自相矛盾时不允许。locationId仅作诊断，没有唯一明确答案时留空。只输出JSON：{"allowed":true,"hardConflict":false,"locationId":"合法地点ID或空","confidence":0.0,"reason":""}\n\n人物关键设定：${input.contact.systemPrompt.slice(0, 800)}\n${compactContext}` }, { role: 'user', content: '审查行为是否可以执行。' }] }),
  ])
  const proposal = parseProposal(proposalRaw)
  const commitment = parseCommitment(commitmentRaw)
  const feasibility = parseFeasibility(feasibilityRaw)
  const arbitration = arbitrateActionCommittee({ proposal, commitment, feasibility, validLocationIds, now: input.now })
  if (arbitration.approved) return { proposal, commitment, feasibility, ...arbitration }

  // The proposal judge is deliberately given the complete user text, visible
  // reply and exact location catalogue. Requiring two additional model calls
  // to independently reproduce the same structured decision made confirmed
  // arrangements vanish in practice whenever one judge is conservative,
  // malformed or transiently unavailable. Keep the strict deterministic
  // time/location guards, but allow a high-confidence concrete proposal to
  // be the fallback source of truth.
  if (proposal?.decision === 'create_special_task' && proposal.confidence >= .75) {
    const fallbackCommitment: CommitmentVote = { commitment: 'agreed', locationId: proposal.locationId, confidence: 1, reason: '高置信度行动提议的本地降级确认' }
    const fallbackFeasibility: FeasibilityVote = { allowed: true, hardConflict: false, locationId: proposal.locationId, confidence: 1, reason: '沿用本地时间、地点与范围硬校验' }
    const fallback = arbitrateActionCommittee({ proposal, commitment: fallbackCommitment, feasibility: fallbackFeasibility, validLocationIds, now: input.now })
    if (fallback.approved) return { proposal, commitment, feasibility, ...fallback, reason: '其余行动审查未形成一致结果，已采用高置信度且通过本地硬校验的具体提议' }
  }
  return { proposal, commitment, feasibility, ...arbitration }
}
