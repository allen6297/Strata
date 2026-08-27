import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto('http://127.0.0.1:4521/', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })

  await page.getByTestId('asset-explorer').click()
  await page.getByTestId('asset-search').fill('player')
  await page.waitForTimeout(100)
  const playerVisible = await page.getByTestId('asset-a1').isVisible()
  await page.getByTestId('asset-filter-script').click()
  await page.getByTestId('asset-search').fill('')
  await page.waitForTimeout(100)
  const scriptVisible = await page.getByTestId('asset-scr_player').isVisible()

  // Navigate into textures folder (built-in relative paths)
  await page.getByTestId('asset-filter-all').click()
  const texturesFolder = page.getByTestId('asset-folder-textures')
  if (await texturesFolder.count()) {
    await texturesFolder.click()
    await page.waitForTimeout(100)
  }

  await page.screenshot({
    path: '/opt/cursor/artifacts/strata_asset_explorer.png',
    fullPage: true,
  })

  const ok = playerVisible && scriptVisible
  console.log({ playerVisible, scriptVisible, ok })
  await browser.close()
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
