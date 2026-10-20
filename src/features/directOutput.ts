import type { FeatureModule } from './types'

/** Experimental single-request private-chat pipeline. */
export const directOutputModule: FeatureModule = {
  id: 'directOutput',
  name: '一次调用直出',
  icon: '⚡',
  description: '实验功能：单聊回复、任务判断与自审合并为一次主模型 JSON 输出，不再追加模型审核或后台学习调用',
  parentId: 'chat-assist',
}
