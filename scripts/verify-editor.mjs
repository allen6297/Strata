import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto('http://127.0.0.1:4521/', { waitUntil: 'networkidle' })

  const before = await page.locator('[data-testid^="hierarchy-"]').count()
  await page.getByTestId('add-sprite').click()
  await page.waitForTimeout(100)
  const afterAdd = await page.locator('[data-testid^="hierarchy-"]').count()

  await page.getByTestId('undo').click()
  await page.waitForTimeout(100)
  const afterUndo = await page.locator('[data-testid^="hierarchy-"]').count()

  await page.getByTestId('redo').click()
  await page.waitForTimeout(100)
  const afterRedo = await page.locator('[data-testid^="hierarchy-"]').count()

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('save-scene').click()
  const download = await downloadPromise
  const filename = download.suggestedFilename()

  await page.screenshot({
    path: '/opt/cursor/artifacts/strata_editor_started.png',
    fullPage: true,
  })

  const ok =
    afterAdd === before + 1 &&
    afterUndo === before &&
    afterRedo === before + 1 &&
    filename.includes('.scene')

  console.log({ before, afterAdd, afterUndo, afterRedo, filename, ok })
  await browser.close()
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
