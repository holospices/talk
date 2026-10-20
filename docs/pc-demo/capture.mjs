import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []

page.on('pageerror', (error) => errors.push(error.message))
await page.goto('file:///C:/Projects/HtmlProjects/Talk/docs/pc-demo/index.html')

for (const name of ['contacts', 'discover', 'settings']) {
  await page.locator(`[data-page="${name}"]`).click()
  await page.screenshot({ path: `docs/pc-demo/preview-${name}.png` })
}

await page.locator('[data-page="discover"]').click()
const largeMomentActions = await page.locator('.moment-action').evaluateAll((buttons) =>
  buttons.every((button) => button.getBoundingClientRect().height >= 38),
)
await page.locator('#coverUpload').setInputFiles('public/app-icon.png')
await page.locator('.moments-cover.has-image').waitFor()
const localCoverUploaded = await page.locator('.moments-cover.has-image').count()
await page.locator('[data-page="messages"]').click()
await page.locator('.message.mine [data-profile]').first().click()
await page.screenshot({ path: 'docs/pc-demo/preview-profile-edit.png' })
const detailMode = await page.locator('.desktop.detail-mode').count()
await page.locator('#profileEditBack').click()
await page.locator('.message [data-profile="苏晚"]').first().click()
await page.screenshot({ path: 'docs/pc-demo/preview-profile.png' })

const result = {
  errors,
  activePages: await page.locator('.page.active').count(),
  activeLists: await page.locator('.list-view.active').count(),
  profileModalOpen: await page.locator('.profile-modal.open').count(),
  momentsCoverCount: await page.locator('.moments-cover').count(),
  largeMomentActions,
  localCoverUploaded,
  detailMode,
}

console.log(JSON.stringify(result))
await browser.close()
