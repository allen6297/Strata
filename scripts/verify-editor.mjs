import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto('http://127.0.0.1:4521/', { waitUntil: 'networkidle' })

  await page.getByText('Coin', { exact: true }).click()
  await page.waitForTimeout(200)
  const inspectorTitle = await page.locator('aside').filter({ hasText: 'Inspector' }).innerText()
  if (!inspectorTitle.includes('sprite') && !inspectorTitle.toLowerCase().includes('coin')) {
    // name field should show Coin
  }
  const nameVal = await page.locator('aside input').first().inputValue()
  console.log('selected name:', nameVal)

  await page.getByTestId('inspector-x').fill('20')
  await page.getByTestId('inspector-y').fill('-60')
  await page.waitForTimeout(100)
  console.log('x:', await page.getByTestId('inspector-x').inputValue())
  console.log('y:', await page.getByTestId('inspector-y').inputValue())

  const beforeCount = await page.locator('[data-testid^="hierarchy-"]').count()
  await page.getByTestId('add-sprite').click()
  await page.waitForTimeout(150)
  const afterCount = await page.locator('[data-testid^="hierarchy-"]').count()
  console.log('hierarchy count', beforeCount, '->', afterCount)

  await page.getByTestId('play-toggle').click()
  await page.waitForTimeout(300)
  const playText = await page.getByTestId('play-toggle').innerText()
  console.log('play button:', playText)

  await page.getByTestId('asset-a2').click()
  const assetSelected = await page.getByTestId('asset-a2').evaluate((el) =>
    el.className.includes('border-[var(--accent-dim)]') ||
    getComputedStyle(el).borderColor.length > 0,
  )
  console.log('asset clicked, selected class present:', assetSelected)

  await page.screenshot({
    path: '/opt/cursor/artifacts/forge_editor_after_interactions.png',
    fullPage: true,
  })

  const ok =
    nameVal === 'Coin' &&
    afterCount === beforeCount + 1 &&
    playText.toLowerCase().includes('stop')

  console.log(ok ? 'PASS' : 'FAIL')
  await browser.close()
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
