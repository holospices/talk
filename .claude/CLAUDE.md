# Talk 项目开发记忆

本文只记录当前架构、不可破坏的约束和常用开发入口。历史排障过程不放在这里；Android/WebView 相关经验见 `docs/ANDROID_TROUBLESHOOTING.md`。

## 项目定位

Talk 是一个本地优先、仿即时通讯体验的 AI companion 应用。用户可以创建联系人和群聊，通过 DeepSeek 兼容接口进行长期对话，并积累记忆、关系、朋友圈、职业、钱包和生活事件。

- 没有项目后端，业务数据主要保存在浏览器/Android WebView 的 IndexedDB。
- API Key 和 UI 设置由 Zustand 持久化到 localStorage。
- Web、GitHub Pages 和 Capacitor Android 共用同一套前端产物。
- 当前版本以 `package.json` 为准，不要在文档里手写另一个版本号。

## 技术栈

- React 19 + TypeScript 6
- Vite 8 + Tailwind CSS v4
- React Router，使用 `HashRouter`
- Zustand：设置和少量运行时 UI 状态
- Dexie 4 / IndexedDB：联系人、消息及业务数据
- Vitest：单元测试
- Playwright：移动端端到端回归
- Capacitor 8：Android 包装层

`HashRouter` 是 Capacitor `file://` 加载和 GitHub Pages 部署的兼容要求，不要擅自改成 BrowserRouter。

## 核心目录

| 路径 | 职责 |
| --- | --- |
| `src/App.tsx` | 路由、页面级懒加载、模块动态路由、应用启动副作用 |
| `src/pages/` | 页面容器 |
| `src/components/` | 可复用 UI 与聊天气泡 |
| `src/lib/chatEngine.ts` | 私聊回合引擎 |
| `src/lib/groupChatEngine.ts` | 群聊回合引擎 |
| `src/lib/groupChat.ts` | 群聊提示词、发言者选择和协议解析 |
| `src/lib/aiProtocol.ts` | 私聊协议、本地草稿解析、宽松 JSON 解析 |
| `src/lib/prompt.ts` | 人设生成和两阶段聊天提示词 |
| `src/lib/memory.ts` | 私聊/群聊记忆提取、检索与关系更新 |
| `src/lib/promptModules.ts` | 可编辑 Prompt 模块定义与归一化 |
| `src/features/` | 功能模块注册、动态入口和动态路由 |
| `src/db/db.ts` | Dexie schema 与全部数据库迁移 |
| `src/store/useSettingsStore.ts` | localStorage 设置及设置迁移 |
| `tests/e2e/regression.spec.ts` | 关键用户路径回归测试 |

## 数据库

数据库名为 `talk-db`，当前 schema 是 **Dexie version(27)**。新增或修改表结构只能追加新版本，绝不能改写已经发布的旧迁移。

### 当前表

| 领域 | 表 |
| --- | --- |
| 联系人与聊天 | `contacts`, `conversations`, `messages`, `groups`, `stickers` |
| 记忆与关系 | `contactMemories`, `contactRelations`, `socialEvents` |
| 朋友圈 | `moments`, `momentComments`, `momentLikes` |
| 世界书与知识 | `knowledgeEntries`, `savedWorldviews`, `worldbookCollections`, `worldbookEntries` |
| 调试与用量 | `aiTurns`, `adminLogs`, `adminAiTraces`, `aiUsageRecords` |
| 生活模拟 | `simulationState`, `contactLifeStates`, `lifeEvents` |
| 金钱与职业 | `walletAccounts`, `walletTransactions`, `loans`, `jobListings`, `interviews` |
| 商城与群计划 | `inventory`, `groupPlans` |
| 存档与人设 | `saveSlots`, `savedPersonas`, `personaCreationRecords` |

### 已删除的历史表

- `locations`、`tasks`：version(3) 删除。
- `commissions`：version(10) 删除。
- `todos`：version(18) 删除。

不要在新代码或文档中把这些表当成现有能力。Dexie 删除表必须在新版本 `.stores()` 中显式设为 `null`。

### 重要索引和数据约束

- 消息分页使用 `[conversationId+createdAt]`，不要重新退化成整表加载聊天记录。
- `walletTransactions.idempotencyKey` 唯一，所有可能重试的金钱操作必须提供稳定幂等键。
- `personaCreationRecords` 是不可变创建历史，普通备份/恢复不会覆盖它。
- `inventory.productKey` 用于同商品堆叠；数量为 0 的商品仍保留，允许复购。
- 备份表白名单维护在 `src/lib/backup.ts`。新增持久表时必须明确决定是否进入备份和存档。

## Feature 模块系统

功能模块位于 `src/features/`，注册表是 `src/features/index.ts` 的 `ALL_MODULES`。模块可以提供：

- 模块开关和说明；
- Discover 页面入口；
- 动态路由；
- 父级分类。

当前注册模块包括：商城、仓库、世界书、知识库、好感度、特色人格、主动聊天、读心、主动意图、自我迭代、剧情大纲、职业、生活模拟、存档回档、AI 代写、拟真回复和 Prompt 编辑器。

新增 Feature 的步骤：

1. 在 `src/features/` 创建模块文件。
2. 在 `src/features/index.ts` 显式 import。
3. 加入 `ALL_MODULES`。
4. 如果默认关闭，更新 `DEFAULT_ENABLED_MODULES` 过滤规则。
5. 给动态路由或入口补测试。

不要只创建文件却忘记注册；孤儿模块不会自动生效。

## Prompt 模块系统

Prompt 模块定义在 `src/lib/promptModules.ts`，用于允许用户查看、编辑或屏蔽模型提示词。它和 Feature 开关是两个不同维度：

- Feature 开关决定产品能力、入口和后台行为是否启用。
- Prompt 开关决定对应提示词是否发送给模型。

同时受两层开关控制的模型能力统一通过 `featureActive(settings, id)` 判断；仅有 Prompt 开关的核心模块（如 `chat`、`memory`、`moments`、`nuwaMode`）继续使用 `promptModuleEnabled()`。不要在调用点重新手写 `isModuleEnabled() && promptModuleEnabled()`。

## 聊天回合管线

私聊和群聊目前是两套引擎，但遵循相同的大方向：

1. 读取联系人、消息、记忆、世界书和功能状态。
2. 主模型生成接近真人聊天的原始草稿。
3. 本地协议解析优先处理草稿。
4. 本地无法可靠解析时，由 utility model 转成 JSON。
5. `parseJsonLoose()` 统一处理 JSON code fence、前后说明文字和对象提取。
6. 质量审查可退回并修复输出。
7. 按顺序显示气泡并落库。
8. 后台更新记忆、关系、心情、自我迭代和知识查询。

关键原则：

- 不要让 JSON 转换模型改写消息正文。
- streamId/AbortController 守卫必须覆盖异步回调，旧回合不得污染新回合。
- 先落库再发送依赖该消息 ID 的通知或副作用。
- 私聊和群聊行为不同的地方必须保留显式策略，不要为了去重强行统一语义。

## 设置与金钱

`useSettingsStore` 持久化到 localStorage。新增设置字段时必须：

1. 更新 `AppSettings` 类型。
2. 提供默认值。
3. 在 persist migration 中归一化旧数据。
4. 考虑备份导入时的缺失字段。

金钱运行时以 `walletAccounts`/`walletTransactions` 为业务账本。`AppSettings.walletBalance` 是旧版本兼容字段，只允许用于首次迁移；不要新增读取它的业务路径。金额写入必须放在 Dexie 事务中，并验证余额守恒和幂等性。

## 页面与性能约束

- 四个底部 Tab 页面保持 eager；其他页面在 `App.tsx` 使用 `lazy()`。
- Suspense 以 `location.pathname` 为 key，避免慢设备切路由时旧页面继续可交互。
- React/Dexie 由 Vite `manualChunks` 拆成独立 vendor chunk。
- `MessageBubble` 和 `ConversationRow` 已 memo；父组件必须传稳定对象与稳定回调。
- 未读总数、会话未读和最后消息由 `src/lib/unread.ts` 的单例 liveQuery 统一计算。
- SearchOverlay 只有存在关键词时才扫描消息，不要在弹层刚打开时读取完整消息表。

## 布局约束

应用外壳和整页路由必须有确定高度：

- `.app-shell` 使用 JS 同步的 `--app-height`。
- 整页容器使用 `h-[var(--app-height)] flex flex-col overflow-hidden`。
- 中间滚动区使用 `min-h-0 flex-1 overflow-y-auto`。
- 不要用 `min-h-full` 代替整页硬高度，否则内容会把 BottomNav 推出视口。

Android 老 WebView 的完整背景见 `docs/ANDROID_TROUBLESHOOTING.md`。

## 隐私与发布

- Vite 会把 `.env` 的 `VITE_*` 值内联到产物。
- 对外发布的 Web/APK 不能携带真实 DeepSeek、Tavily、Pexels 或媒体服务 Key。
- 发布优先使用 `npm run release:apk`，它负责空 Key 构建和秘密扫描。
- 手动发布时也必须执行 `npm run check:dist-secrets`。
- 导出的用户备份可能包含敏感设置和聊天内容，不要加入仓库。

## 开发命令

```bash
npm run dev
npm run lint
npm run test:unit
npm run test:e2e
npm run build
npm run benchmark:ai
npm run benchmark:adherence
npm run release:apk
```

提交前最低验证：

1. `npm run lint`
2. `npm run test:unit`
3. `npm run build`
4. 涉及页面、路由、IndexedDB 或移动交互时运行 `npm run test:e2e`

Playwright 使用移动设备项目和 HashRouter 路由。若 5173 已有长期运行的 Vite 进程，先确认它加载的是当前工作区；热更新残留会制造假失败。

## 当前已知技术债

- `types/index.ts`、`memory.ts` 和联系人创建页面仍偏大；女娲 JSON 协议已先拆到 `src/lib/nuwaPersona.ts`，后续继续按纯逻辑/副作用边界渐进拆分。
- TypeScript 已开启 `strictNullChecks`，但尚未开启完整 strict。
- 钱包旧字段迁移完成前，需要持续防止出现第二个运行时余额来源。
