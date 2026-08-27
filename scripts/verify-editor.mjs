import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto('http://127.0.0.1:4521/', { waitUntil: 'networkidle' })

  // Multi-select via hierarchy
  await page.getByTestId('hierarchy-ent_player').click()
  await page.getByTestId('hierarchy-ent_platform').click({ modifiers: ['Meta'] })
  await page.waitForTimeout(100)

  // Parenting: unparent coin if needed then parent via inspector
  await page.getByTestId('hierarchy-ent_coin').click()
  await page.getByTestId('inspector-parent').selectOption('ent_player')
  await page.waitForTimeout(100)

  // Script attach + edit
  await page.getByTestId('asset-scr_player').click()
  await page.getByTestId('script-editor').fill(`fn main(): Int {\n    print("strata test");\n    return 0;\n}\n`)
  await page.getByTestId('play-toggle').click()
  await page.waitForTimeout(400)
  const log = await page.getByTestId('play-log').innerText()

  await page.screenshot({
    path: '/opt/cursor/artifacts/strata_scripts_parenting.png',
    fullPage: true,
  })

  const ok = log.includes('RoseGold') || log.includes('Play') || log.includes('desktop')
  console.log({ log: log.slice(0, 200), ok })
  await browser.close()
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
