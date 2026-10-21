import { expect, test } from '@playwright/test'

// Diagnostic-only baseline on unchanged upstream main. These tests intentionally
// assert the requested outcome so a failed assertion records the actual gap.
for (const direction of ['forward', 'backward'] as const) {
  test(`#741 baseline: type prose between adjacent tables moving ${direction}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/?story=table-prose-entry--table-prose-entry&mode=preview')
    const root = page.locator('.mdxeditor-root-contenteditable [contenteditable="true"]').first()
    const tables = root.locator('table')
    await expect(tables).toHaveCount(2)
    const cell =
      direction === 'forward'
        ? tables.first().locator('tbody [contenteditable="true"]').last()
        : tables.last().locator('tbody [contenteditable="true"]').first()
    await cell.click()
    await expect(cell).toBeFocused()
    await page.keyboard.press(direction === 'forward' ? 'Tab' : 'Shift+Tab')
    await page.keyboard.type('Inserted prose')
    await page.getByRole('button', { name: 'Save Markdown', exact: true }).click()
    await testInfo.attach('result-markdown', { body: await page.getByTestId('saved-markdown').innerText(), contentType: 'text/plain' })
    await testInfo.attach('result-editor', { body: await root.innerHTML(), contentType: 'text/html' })
    expect(errors).toEqual([])
    const prose = root.locator(':scope > p').filter({ hasText: 'Inserted prose' })
    await expect(prose).toHaveCount(1)
    expect(
      await prose.evaluate((paragraph) => [
        Boolean(paragraph.previousElementSibling?.querySelector('table')),
        Boolean(paragraph.nextElementSibling?.querySelector('table'))
      ])
    ).toEqual([true, true])
    await expect(page.getByTestId('saved-markdown')).toHaveText(
      '| First |\n| ----- |\n| One   |\n\nInserted prose\n\n| Second |\n| ------ |\n| Two    |'
    )
  })
}

test('#741 baseline positive control: type prose after the terminal table', async ({ page }) => {
  await page.goto('/?story=table-prose-entry--table-prose-entry&mode=preview')
  const root = page.locator('.mdxeditor-root-contenteditable [contenteditable="true"]').first()
  const cell = root.locator('table').last().locator('tbody [contenteditable="true"]').last()
  await cell.click()
  await expect(cell).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.type('Terminal prose')
  await page.getByRole('button', { name: 'Save Markdown', exact: true }).click()
  await expect(root.locator(':scope > p').last()).toHaveText('Terminal prose')
  await expect(page.getByTestId('saved-markdown')).toContainText('Terminal prose')
})
