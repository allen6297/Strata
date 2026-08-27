import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  })
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.goto('http://127.0.0.1:4521/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  await page.getByText('Coin', { exact: true }).click()
  await page.waitForTimeout(500)

  await page.getByTestId('inspector-x').fill('20')
  await page.waitForTimeout(300)
  await page.getByTestId('inspector-y').fill('-60')
  await page.waitForTimeout(600)

  await page.getByTestId('add-sprite').click()
  await page.waitForTimeout(700)

  await page.getByTestId('play-toggle').click()
  await page.waitForTimeout(1800)
  await page.getByTestId('play-toggle').click()
  await page.waitForTimeout(500)

  await page.getByTestId('asset-a2').click()
  await page.waitForTimeout(800)

  await page.screenshot({
    path: '/opt/cursor/artifacts/forge_editor_demo_final.png',
  })

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
