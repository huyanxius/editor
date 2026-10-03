import { expect, test, type Locator, type Page } from '@playwright/test'

async function placeCaretAtEnd(element: Locator) {
  await element.evaluate((element) => {
    element.closest<HTMLElement>('[contenteditable="true"]')!.focus()
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }))
  })
  await expect(element.locator('xpath=ancestor-or-self::*[@contenteditable="true"][1]')).toBeFocused()
}

async function readMarkdown(page: Page) {
  await page.getByRole('button', { name: 'Get Markdown', exact: true }).click()
  return (await page.getByLabel('Exported markdown').textContent()) ?? ''
}

const occurrences = (text: string, search: string) => text.split(search).length - 1

test.beforeEach(async ({ page }) => {
  await page.goto('/?story=bug-733--nested-jsx-imports&mode=preview')
  await expect(page.getByRole('button', { name: 'Insert Zazz', exact: true })).toBeVisible()
})

test('inserting JSX into an admonition exports its import at the document root', async ({ page }) => {
  await placeCaretAtEnd(
    page
      .locator('p')
      .filter({ hasText: /^Admonition content/ })
      .last()
  )
  await page.getByRole('button', { name: 'Insert Zazz', exact: true }).click()
  await expect(page.getByText('Zazz', { exact: true })).toHaveCount(1)
  const markdown = await readMarkdown(page)
  expect(markdown, 'Nested JSX must receive a root-level import').toMatch(/^import Zazz from '@zazz'/)
  expect(markdown).toContain('<Zazz />')
  expect(markdown).toContain(":::tip\nimport Existing from '@existing'")
  expect(occurrences(markdown, "import Zazz from '@zazz'")).toBe(1)
  await page.getByRole('button', { name: 'Reload saved Markdown', exact: true }).click()
  expect(await readMarkdown(page)).toBe(markdown)
})

test('root and nested references share one import after repeated insertion and reload', async ({ page }) => {
  await placeCaretAtEnd(page.getByText('Root content', { exact: true }))
  await page.getByRole('button', { name: 'Insert Zazz', exact: true }).click()
  await expect(page.getByText('Zazz', { exact: true })).toHaveCount(1)
  await placeCaretAtEnd(
    page
      .locator('p')
      .filter({ hasText: /^Admonition content/ })
      .last()
  )
  await page.getByRole('button', { name: 'Insert Zazz', exact: true }).click()
  await expect(page.getByText('Zazz', { exact: true })).toHaveCount(2)
  const markdown = await readMarkdown(page)
  expect(occurrences(markdown, '<Zazz />')).toBe(2)
  expect(occurrences(markdown, "import Zazz from '@zazz'")).toBe(1)
  await page.getByRole('button', { name: 'Reload saved Markdown', exact: true }).click()
  expect(await readMarkdown(page)).toBe(markdown)
})

test('inserting inline JSX into a table preserves the cell and imports the component once', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await placeCaretAtEnd(page.getByRole('cell', { name: 'Table content', exact: true }).locator('p'))
  await page.getByRole('button', { name: 'Insert Badge', exact: true }).click()
  await expect(page.getByText('Badge', { exact: true })).toHaveCount(1)
  const markdown = await readMarkdown(page)
  expect(markdown).toMatch(/^import \{ Badge \} from '@components'/)
  expect(markdown).toContain('Table content<Badge />')
  expect(occurrences(markdown, "import { Badge } from '@components'")).toBe(1)
  expect(errors).toEqual([])
  await page.getByRole('button', { name: 'Reload saved Markdown', exact: true }).click()
  expect(await readMarkdown(page)).toBe(markdown)
})
