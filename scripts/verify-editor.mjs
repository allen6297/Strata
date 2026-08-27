import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto('http://127.0.0.1:4521/', { waitUntil: 'networkidle' })

  // Clear stale localStorage scene without textures/hooks
  await page.evaluate(() => {
    localStorage.clear()
  })
  await page.reload({ waitUntil: 'networkidle' })

  await page.getByTestId('hierarchy-ent_player').click()
  const x0 = await page.getByTestId('inspector-x').inputValue()

  await page.getByTestId('play-toggle').click()
  await page.waitForTimeout(900)
  const x1 = await page.getByTestId('inspector-x').inputValue()
  const log = await page.getByTestId('play-log').innerText()

  await page.getByTestId('play-toggle').click()

  await page.screenshot({
    path: '/opt/cursor/artifacts/strata_live_play_textures.png',
    fullPage: true,
  })

  const moved = Number(x1) !== Number(x0)
  const ok = moved && (log.includes('tick') || log.includes('ready') || log.includes('Would run') || log.includes('Live'))
  console.log({ x0, x1, moved, log: log.slice(0, 240), ok })
  await browser.close()
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
