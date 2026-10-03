import { expect, test, type Locator, type Page } from '@playwright/test'

const runtimeErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?story=bug-636--source-insertion&mode=preview')
  const original = page.locator('.mdxeditor-rich-text-editor p').filter({ hasText: 'original' })
  await original.click()
  await page.keyboard.press('End')
})

test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([])
})

async function readMarkdown(page: Page) {
  await page.getByRole('button', { name: 'Get Markdown', exact: true }).click()
  return (await page.getByLabel('Current markdown').textContent()) ?? ''
}

function sourceContent(page: Page, mode: 'source' | 'diff') {
  return mode === 'source'
    ? page.locator('.mdxeditor-source-editor .cm-content')
    : page.locator('.mdxeditor-diff-editor .cm-content').nth(1)
}

async function typeDocument(editor: Locator, value: string) {
  await editor.click()
  await editor.press('ControlOrMeta+a')
  await editor.pressSequentially(value)
  await expect(editor).toHaveText(value)
}

for (const mode of ['source', 'diff'] as const) {
  test.describe(mode, () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('radio', { name: mode === 'source' ? 'Source mode' : 'Diff mode', exact: true }).click()
      await expect(sourceContent(page, mode)).toBeVisible()
    })

    test('preserves current edits when inserting through the public ref', async ({ page }) => {
      const editor = sourceContent(page, mode)
      await typeDocument(editor, 'unsaved source')
      await page.getByRole('button', { name: 'Insert text', exact: true }).click()
      await expect
        .poll(() => readMarkdown(page), { message: 'insertion must preserve the current source edits' })
        .toBe('unsaved sourceINSERT')
      await expect(editor).toHaveText('unsaved sourceINSERT')
      if (mode === 'diff') await expect(page.locator('.mdxeditor-diff-editor .cm-content').first()).toHaveText('comparison baseline')
    })

    test('replaces the selected text and preserves native undo and redo', async ({ page }) => {
      const editor = sourceContent(page, mode)
      await typeDocument(editor, 'before TARGET after')
      await editor.press('Home')
      for (let i = 0; i < 7; i++) await editor.press('ArrowRight')
      for (let i = 0; i < 6; i++) await editor.press('Shift+ArrowRight')
      await page.getByRole('button', { name: 'Insert formatted markdown', exact: true }).click()
      await expect(editor).toHaveText('before **replacement** after')
      expect(await readMarkdown(page)).toBe('before **replacement** after')
      await editor.press('ControlOrMeta+z')
      await expect(editor).toHaveText('before TARGET after')
      await editor.press('ControlOrMeta+Shift+z')
      await expect(editor).toHaveText('before **replacement** after')
      await page.getByRole('radio', { name: 'Rich text', exact: true }).click()
      await expect(page.locator('.mdxeditor-rich-text-editor strong')).toHaveText('replacement')
      expect(await readMarkdown(page)).toBe('before **replacement** after')
    })

    test('keeps repeated insertions separate and works after switching modes twice', async ({ page }) => {
      let editor = sourceContent(page, mode)
      await typeDocument(editor, 'draft')
      await page.getByRole('button', { name: 'Insert text', exact: true }).click()
      await expect(editor).toHaveText('draftINSERT')
      await page.getByRole('button', { name: 'Insert text', exact: true }).click()
      await expect(editor).toHaveText('draftINSERTINSERT')
      await editor.press('ControlOrMeta+z')
      await expect(editor).toHaveText('draftINSERT')
      await editor.press('ControlOrMeta+Shift+z')
      await expect(editor).toHaveText('draftINSERTINSERT')
      await page.getByRole('radio', { name: 'Rich text', exact: true }).click()
      await expect(page.locator('.mdxeditor-rich-text-editor p')).toHaveText('draftINSERTINSERT')
      await page.getByRole('radio', { name: mode === 'source' ? 'Source mode' : 'Diff mode', exact: true }).click()
      editor = sourceContent(page, mode)
      await editor.click()
      await editor.press('End')
      await page.getByRole('button', { name: 'Insert text', exact: true }).click()
      await expect(editor).toHaveText('draftINSERTINSERTINSERT')
      expect(await readMarkdown(page)).toBe('draftINSERTINSERTINSERT')
    })
  })
}
