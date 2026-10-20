/**
 * Defaults and constants for the user's personal schedule + small assistant.
 *
 * Kept in a dependency-free module so `useSettingsStore` can import the two
 * prompt defaults without creating a cycle through `lib/assistant.ts`
 * (which itself reads the store and the database).
 */

/** Local time of the automatic daily diary. Kept at 23:00 per product spec. */
export const ASSISTANT_DIARY_HOUR = 23
export const ASSISTANT_DIARY_MINUTE = 0

/** How often the foreground scheduler checks reminders / diary catch-up. */
export const ASSISTANT_TICK_INTERVAL_MS = 30 * 1000

/**
 * A reminder stays eligible for this long after its due time. This makes the
 * schedule forgiving when the app was backgrounded or the machine slept, but
 * still avoids reminding hours after the activity began.
 */
export const ASSISTANT_REMINDER_GRACE_MS = 10 * 60 * 1000

export const ASSISTANT_DEFAULT_REMIND_MINUTES = 10

/**
 * Available placeholders:
 * {{assistant}} {{user}} {{activity}} {{start}} {{end}} {{minutes}}
 * {{minutesText}} {{time}} {{date}}
 */
export const DEFAULT_ASSISTANT_REMINDER_PROMPT = `你是{{assistant}}，是{{user}}的小助理。现在是{{time}}，{{minutesText}}，接下来是「{{activity}}」（{{start}}-{{end}}）。

请用你自己的口吻，发一条简短、自然、像真人助理一样的提醒消息。
要求：只输出要发给对方的消息正文，不要加引号、不要解释、不要写旁白或动作；控制在 45 个字以内；说清楚要做什么和还有多久；不要重复整段日程；不要提“系统”“AI”“提示词”。`

/**
 * Available placeholders:
 * {{assistant}} {{user}} {{date}} {{schedule}} {{chats}}
 */
export const DEFAULT_ASSISTANT_DIARY_PROMPT = `你是{{assistant}}。请以你的第一人称，回顾{{date}}这一天，写下你的日记。

写作要求：
- 尽可能客观地记录{{user}}这一天发生了什么，同时保持你的性格、说话习惯、你们的关系和你的视角。
- 今日事件按时间段写，格式为「HH:MM-HH:MM 发生了什么」，时间段要和日程对得上，聊天里发生的事插到对应时间附近。
- 今日情绪、今日成长、做的不错、可以调整的地方、明日最小行动都要具体，不要空泛套话；不确定的地方宁可写“不太确定”，不要编造。
- 小助理碎碎念用你主观的口吻评价这一天，内容不限，可以吐槽、心疼、骄傲或期待。
- 不要写成给{{user}}看的汇报：不要用“你”称呼{{user}}，用名字或第三人称；不要用“今天用户……”这种系统口吻。
- 不要编造没有发生的事，不要输出标题、总结、列表符号或 Markdown。

{{user}}今天的日程：
{{schedule}}

今天你们和别人的聊天记录：
{{chats}}`
