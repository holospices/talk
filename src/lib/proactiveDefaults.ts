/** Prompt defaults for AI-initiated private messages (see lib/proactiveChat.ts). */
export interface ProactiveTopicSources {
  events: boolean
  memories: boolean
  plans: boolean
  schedule: boolean
  career: boolean
  casual: boolean
}

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
