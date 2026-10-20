const themes = {
  sage: { index: '01', name: 'Sage', title: '安静陪伴', description: '为 Talk 定制的默认方向：灰绿主色、暖灰背景，在克制和陪伴感之间取平衡。', traits: ['Talk 默认', '温和', '灰绿交互'] },
  forge: { index: '02', name: 'Forge', title: 'Primer 工具感', description: '按 GitHub Primer 的语义重做：蓝色负责链接与选中，绿色负责主操作，使用冷灰表面、明确边框和紧凑密度。', traits: ['GitHub Primer', '绿色主操作', '蓝色选中'] },
  fox: { index: '03', name: 'Fox', title: '柔和活力', description: '按 Mozilla 的字体和组件逻辑加强：几何无衬线字、16px 大圆角和更明显的浮层，但不使用花哨渐变。', traits: ['Mozilla 取向', '大圆角', '紫色层次'] },
  ink: { index: '04', name: 'Ink', title: '圆角编辑黑白', description: '保留衬线字体、纯黑白和报刊式层级，用克制圆角代替原来的硬直方框，在个性和亲和力之间取平衡。', traits: ['衬线字体', '克制圆角', '纯黑白'] },
  nord: { index: '05', name: 'Nord', title: '冷色工作台', description: '将它定义为开发者工具方向：紧凑间距、小圆角、灰蓝表面和等宽元数据，适合信息量大的 PC 端。', traits: ['高密度', '等宽细节', '冷灰蓝'] },
}

const title = document.querySelector('#theme-title')
const description = document.querySelector('#theme-description')
const traitList = document.querySelector('#trait-list')
const summaryIndex = document.querySelector('.summary-index')
const footerTheme = document.querySelector('#footer-theme')

function selectTheme(key) {
  const theme = themes[key]
  if (!theme) return
  document.body.dataset.theme = key
  document.querySelectorAll('[data-select-theme]').forEach((button) => {
    button.classList.toggle('active', button.dataset.selectTheme === key)
  })
  title.textContent = `${theme.name} · ${theme.title}`
  description.textContent = theme.description
  summaryIndex.textContent = theme.index
  traitList.replaceChildren(...theme.traits.map((trait) => {
    const span = document.createElement('span')
    span.textContent = trait
    return span
  }))
  footerTheme.textContent = `${theme.index} / ${theme.name}`
  localStorage.setItem('talk-demo-theme-v2', key)
}

function selectMode(mode) {
  const next = mode === 'dark' ? 'dark' : 'light'
  document.body.dataset.mode = next
  document.querySelectorAll('[data-select-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.selectMode === next)
  })
  localStorage.setItem('talk-demo-mode-v2', next)
}

document.querySelectorAll('[data-select-theme]').forEach((button) => {
  button.addEventListener('click', () => selectTheme(button.dataset.selectTheme))
})

document.querySelectorAll('[data-select-mode]').forEach((button) => {
  button.addEventListener('click', () => selectMode(button.dataset.selectMode))
})

selectTheme(localStorage.getItem('talk-demo-theme-v2') || 'sage')
selectMode(localStorage.getItem('talk-demo-mode-v2') || 'light')
