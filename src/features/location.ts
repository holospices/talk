import { lazy } from 'react'
import type { FeatureModule } from './types'

const LocationsPage = lazy(() => import('../pages/LocationsPage').then(({ LocationsPage }) => ({ default: LocationsPage })))

export const locationModule: FeatureModule = {
  id: 'location',
  name: '地点',
  icon: '🗺️',
  description: '在现实时间驱动的地图中选择地点，并进入动态现场对话',
  routes: [{ path: '/locations', component: LocationsPage }],
  discoverEntries: [{ to: '/locations', icon: '🗺️', label: '地点' }],
}
