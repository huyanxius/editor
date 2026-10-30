import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-github-alert="NOTE"]')).toBeVisible()
})

test('list conversion, undo, redo and reloading preserve alert marker', async ({ page }) => {
  const alert = page.locator('[data-github-alert="NOTE"]')
  const source = page.getByRole('textbox', { name: 'Markdown source' })
  await alert.locator('p').click()
  await page.getByRole('radio', { name: 'Bulleted list' }).click()
  await expect(alert.locator('ul li')).toContainText('Start here.')
  await expect(source).toHaveValue(/^> \[!NOTE\]\n> \* Start here\./)
  const converted = await source.inputValue()
  await page.getByRole('radio', { name: /^Undo / }).click()
  await expect(alert.locator('ul')).toHaveCount(0)
  await expect(alert.locator('p')).toContainText('Start here.')
  await page.getByRole('radio', { name: /^Redo / }).click()
  await expect(alert.locator('ul li')).toContainText('Start here.')
  await expect(source).toHaveValue(converted)
  // setMarkdown ignores unchanged content. Load a distinct document first so
  // restoring the alert exercises Markdown import rather than the existing DOM.
  await source.fill('Temporary ordinary document')
  await page.getByRole('button', { name: 'Load Markdown' }).click()
  await expect(page.locator('[data-github-alert]')).toHaveCount(0)
  await expect(page.locator('[contenteditable="true"]')).toHaveText('Temporary ordinary document')
  await source.fill(converted)
  await page.getByRole('button', { name: 'Load Markdown' }).click()
  await expect(page.locator('[data-github-alert="NOTE"] ul li')).toContainText('Start here.')
  await page.getByRole('button', { name: 'Read Markdown', exact: true }).click()
  await expect(source).toHaveValue(converted)
})

test('toolbar type change retains focus and can continue editing', async ({ page }) => {
  const alert = page.locator('[data-github-alert="NOTE"]')
  await alert.locator('p').click()
  await page.getByRole('combobox', { name: 'GitHub alert', exact: true }).click()
  await page.getByRole('option', { name: 'WARNING', exact: true }).click()
  await expect(page.locator('[data-github-alert="WARNING"]')).toBeVisible()
  await expect(page.locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type(' continued')
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toHaveValue(/^> \[!WARNING\][\s\S]* continued/)
})

test('Enter exits final empty alert paragraph and typing continues outside', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('> [!TIP]\n> Body')
  await page.getByRole('button', { name: 'Load Markdown' }).click()
  await page.locator('[data-github-alert="TIP"] p').click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Outside')
  await expect(page.locator('[data-github-alert="TIP"]')).toHaveText('Body')
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('> [!TIP]\n> Body\n\nOutside')
})

test('readOnly disables controls and source reload', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Read only' }).check()
  await expect(page.getByRole('combobox', { name: 'GitHub alert', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Load Markdown' })).toBeDisabled()
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0)
})

test('first toolbar insertion before focus is undoable', async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Markdown source' })
  const initial = await source.inputValue()
  await page.getByRole('combobox', { name: 'GitHub alert', exact: true }).click()
  await page.getByRole('option', { name: 'CAUTION', exact: true }).click()
  await expect(page.locator('[data-github-alert="CAUTION"]')).toBeVisible()
  await page.getByRole('radio', { name: /^Undo / }).click()
  await expect(page.locator('[data-github-alert="CAUTION"]')).toHaveCount(0)
  await expect(source).toHaveValue(initial)
  await page.getByRole('radio', { name: /^Redo / }).click()
  await expect(page.locator('[data-github-alert="CAUTION"]')).toBeVisible()
})
