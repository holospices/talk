/** Prompt defaults for AI-initiated private messages (see lib/proactivePrompt.ts). */
export interface ProactiveTopicSources {
  events: boolean
  memories: boolean
  plans: boolean
  schedule: boolean
  career: boolean
  casual: boolean
}

export interface ProactiveSourceDefinition {
  key: keyof ProactiveTopicSources
  label: string
  description: string
  /** Representative material shown in the preview; real contacts may supply different text. */
  exampleTopic: string
  source: 'event' | 'open_thread' | 'memory' | 'plan' | 'schedule' | 'career' | 'casual'
  /** Optional display override for sources that can emit more than one tag. */
  sourceLabel?: string
}

export const PROACTIVE_SOURCE_DEFINITIONS: ProactiveSourceDefinition[] = [
  {
    key: 'events',
    label: '最近发生的事',
    description: '读取联系人身上“待提及的最近事件”原文，作为 {{topic}}。例如对方刚点赞了朋友圈、刚发生的一次互动。',
    exampleTopic: '对方刚给你发的朋友圈点了赞',
    source: 'event',
  },
  {
    key: 'memories',
    label: '记忆与未接话题',
    description: '读取未接话题（open_thread），或重要度不低于 0.65 的长期记忆原文，作为 {{topic}}。',
    exampleTopic: '上次你说最近工作很累，我一直记着',
    source: 'memory',
    sourceLabel: 'memory / open_thread',
  },
  {
    key: 'plans',
    label: '约定/计划',
    description: '读取仍在有效期内的约定或计划文本，作为 {{topic}}；已过期的约定不会出现。',
    exampleTopic: '周末一起去看那场电影',
    source: 'plan',
  },
  {
    key: 'schedule',
    label: '当前日程',
    description: '读取联系人此刻日程的自然语言描述，作为 {{topic}}；没有当前日程时不会产生这条素材。',
    exampleTopic: '下午在咖啡馆赶稿',
    source: 'schedule',
  },
  {
    key: 'career',
    label: '职业日常',
    description: '用联系人的职业拼出一句日常素材，格式是「职业 + 相关的真实日常」，作为 {{topic}}。',
    exampleTopic: '编辑相关的真实日常',
    source: 'career',
  },
  {
    key: 'casual',
    label: '轻量日常',
    description: '最后兜底的固定素材：结合当前时间和自己的生活状态，发一句符合性格的轻量日常消息。',
    exampleTopic: '结合当前时间和自己的生活状态，发一句符合性格的轻量日常消息',
    source: 'casual',
  },
]


export const DEFAULT_PROACTIVE_TOPIC_SOURCES: ProactiveTopicSources = {
  events: true,
  memories: true,
  plans: true,
  schedule: true,
  career: true,
  casual: true,
}

/**
 * Placeholders: {{topic}} {{source}} {{recentTopics}} {{contactName}} {{userName}} {{time}}
 */
export const DEFAULT_PROACTIVE_CONTEXT_PROMPT = `【本轮类型：主动开启对话】
自然切入这个素材：{{topic}}
来源：{{source}}。用户此刻没有发新消息，不要写成回复口吻，不要说“你刚才”。不要编造素材之外的突发事件、共同经历或线下见面。开场服从你的人设、关系和当前时间，通常一两条短消息即可。如果这个素材不足以形成自然开场，只输出空回复。最近主动聊过：{{recentTopics}}。`

/**
 * Appended after the context template. Kept separate so the user can tune the
 * voice of proactive messages without rewriting the whole context block.
 */
export const DEFAULT_PROACTIVE_EXTRA_INSTRUCTION = `主动消息要像你突然想起对方：可以分享自己此刻正在做的事、一个具体的念头或生活切片；不要每次都用“在干嘛 / 吃了吗 / 最近怎么样”开头，不要连续追问，不要像客服或播报。优先具体、短、带一点你自己的情绪或观察。`
