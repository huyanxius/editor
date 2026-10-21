import { expect, test } from '@playwright/test'

// Diagnostic-only baseline on unchanged upstream main. These tests intentionally
// assert the requested outcome so a failed assertion records the actual gap.
for (const direction of ['forward', 'backward'] as const) {
  test(`#741 baseline: type prose between adjacent tables moving ${direction}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/?story=table-prose-entry--table-prose-entry&mode=preview')
    const root = page.locator('.mdxeditor-root-contenteditable')
    const tables = root.locator('table')
    await expect(tables).toHaveCount(2)
    const cell =
      direction === 'forward'
        ? tables.first().locator('tbody [contenteditable="true"]').last()
        : tables.last().locator('tbody [contenteditable="true"]').first()
    await cell.click()
    await page.keyboard.press(direction === 'forward' ? 'Tab' : 'Shift+Tab')
    await page.keyboard.type('Inserted prose')
    await page.getByRole('button', { name: 'Save Markdown', exact: true }).click()
    await testInfo.attach('result-markdown', { body: await page.getByTestId('saved-markdown').innerText(), contentType: 'text/plain' })
    await testInfo.attach('result-editor', { body: await root.innerHTML(), contentType: 'text/html' })
    expect(errors).toEqual([])
    await expect(root.locator(':scope > p').filter({ hasText: 'Inserted prose' })).toHaveCount(1)
  })
}
