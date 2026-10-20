export interface LocationIconOption {
  id: string
  label: string
  glyph: string
  category: '住宅' | '商业餐饮' | '教育文化' | '医疗公共' | '工作产业' | '交通' | '休闲自然' | '特色'
  keywords: string
}

const icon = (id: string, label: string, glyph: string, category: LocationIconOption['category'], keywords = ''): LocationIconOption => ({ id, label, glyph, category, keywords })

export const LOCATION_ICON_CATEGORIES: Array<'全部' | LocationIconOption['category']> = ['全部', '住宅', '商业餐饮', '教育文化', '医疗公共', '工作产业', '交通', '休闲自然', '特色']

export const LOCATION_ICON_OPTIONS: LocationIconOption[] = [
  icon('residence', '住宅', '🏠', '住宅', '家 小区'), icon('apartment', '公寓', '🏙️', '住宅', '住宅楼 青年公寓'), icon('dormitory', '宿舍', '🛏️', '住宅', '学生 员工'), icon('villa', '别墅', '🏡', '住宅', '独栋 郊外'), icon('hotel', '酒店', '🏨', '住宅', '旅馆 民宿'),
  icon('mall', '商场', '🏬', '商业餐饮', '购物 商业中心'), icon('shop', '商店', '🛍️', '商业餐饮', '超市 零售'), icon('restaurant', '餐厅', '🍽️', '商业餐饮', '饭店 酒楼'), icon('cafe', '咖啡店', '☕', '商业餐饮', '茶馆 饮品'), icon('market', '市场', '🧺', '商业餐饮', '集市 菜场'), icon('bar', '酒吧', '🍺', '商业餐饮', '夜生活 酒馆'),
  icon('school', '学校', '🏫', '教育文化', '学院 教室'), icon('university', '大学', '🎓', '教育文化', '校园 学院'), icon('library', '图书馆', '📚', '教育文化', '书院 阅读'), icon('museum', '博物馆', '🏛️', '教育文化', '展览 美术馆'), icon('cinema', '电影院', '🎬', '教育文化', '剧院 演出'),
  icon('hospital', '医院', '🏥', '医疗公共', '诊所 医疗'), icon('police', '警察局', '🚓', '医疗公共', '警局 公安'), icon('city-hall', '市政中心', '🏢', '医疗公共', '政府 政务'), icon('fire-station', '消防站', '🚒', '医疗公共', '救援'),
  icon('office', '办公楼', '🏢', '工作产业', '公司 写字楼'), icon('factory', '工厂', '🏭', '工作产业', '工业园 产业园'), icon('studio', '创意园', '🎨', '工作产业', '工作室 艺术'), icon('farm', '农场', '🚜', '工作产业', '农田 牧场'),
  icon('station', '车站', '🚉', '交通', '地铁 火车 公交'), icon('harbor', '码头', '⚓', '交通', '港口 河岸'), icon('airport', '机场', '✈️', '交通', '航站楼'), icon('parking', '停车场', '🅿️', '交通', '车库'),
  icon('park', '公园', '🌳', '休闲自然', '树林 草坪'), icon('scenic', '山地', '⛰️', '休闲自然', '山峰 景区'), icon('hill', '丘陵', '🌄', '休闲自然', '山丘 高地'), icon('beach', '沙滩', '🏖️', '休闲自然', '海湾 河滩'), icon('forest', '森林', '🌲', '休闲自然', '林地 露营'), icon('village', '村庄', '🏘️', '休闲自然', '乡村 郊外'), icon('stadium', '体育馆', '🏟️', '休闲自然', '运动 健身'),
  icon('castle', '城堡', '🏰', '特色', '古堡 要塞'), icon('temple', '寺庙', '⛩️', '特色', '教堂 神殿'), icon('tower', '高塔', '🗼', '特色', '观景塔 地标'), icon('lab', '实验室', '🧪', '特色', '研究所'), icon('camp', '营地', '⛺', '特色', '露营 帐篷'), icon('custom', '自定义', '📍', '特色', '地点 标记'),
]

export function getLocationIcon(id?: string) {
  return LOCATION_ICON_OPTIONS.find((item) => item.id === id) ?? LOCATION_ICON_OPTIONS[LOCATION_ICON_OPTIONS.length - 1]
}
