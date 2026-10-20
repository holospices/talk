import { lazy } from 'react'
import type { FeatureModule } from './types'

const MySchedulePage = lazy(() => import('../pages/MySchedulePage').then(({ MySchedulePage }) => ({ default: MySchedulePage })))
const AssistantDiaryPage = lazy(() => import('../pages/AssistantDiaryPage').then(({ AssistantDiaryPage }) => ({ default: AssistantDiaryPage })))

export const assistantScheduleModule: FeatureModule = {
  id: 'assistantSchedule',
  name: '小助理与日程',
  icon: 'calendar',
  description: '编辑自己的每日日程、提醒与免打扰，由小助理每晚写日记',
  parentId: 'chat-assist',
  routes: [
    { path: '/my-schedule', component: MySchedulePage },
    { path: '/diary', component: AssistantDiaryPage },
  ],
}
