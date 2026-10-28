import React from 'react'
import { act, render, screen, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Realm } from '@mdxeditor/editor'
import {
  $createParagraphNode,
  $getSelection,
  INSERT_PARAGRAPH_COMMAND,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  UNDO_COMMAND,
  REDO_COMMAND,
  type LexicalEditor
} from 'lexical'
import {
  $createListItemNode,
  $isListNode,
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND
} from '@lexical/list'
import { defaultHandlers } from 'mdast-util-to-markdown'
import { MDXEditor, addToMarkdownExtension$, type MDXEditorMethods, type RealmPlugin } from '@mdxeditor/editor'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { rootEditor$ } from '@mdxeditor/editor'
import { githubAlertsFromMarkdown } from '../src/syntax'
import {
  githubAlertsPlugin,
  GITHUB_ALERT_TYPES,
  $isGitHubAlertNode,
  applyGitHubAlertType$,
  GitHubAlertTypeSelect
} from '../src/index'
import { listsPlugin } from '@mdxeditor/editor'
import { quotePlugin } from '@mdxeditor/editor'
import { toolbarPlugin } from '@mdxeditor/editor'

afterEach(cleanup)
function setup(markdown: string, readOnly = false, extraPlugins: RealmPlugin[] = [], overridesFirst = false) {
  const ref = React.createRef<MDXEditorMethods>()
  let realm!: Realm
  let editor!: LexicalEditor
  const result = render(
    <MDXEditor
      ref={ref}
      markdown={markdown}
      readOnly={readOnly}
      plugins={[
        quotePlugin(),
        ...(overridesFirst ? extraPlugins : []),
        githubAlertsPlugin(),
        ...(!overridesFirst ? extraPlugins : []),
        listsPlugin(),
        toolbarPlugin({ toolbarContents: () => <GitHubAlertTypeSelect /> }),
        {
          postInit(r) {
            realm = r
            editor = r.getValue(rootEditor$)!
          }
        }
      ]}
    />
  )
  return {
    ...result,
    ref,
    get editor() {
      return editor
    },
    get realm() {
      return realm
    }
  }
}

describe('GitHub alerts', () => {
  it.each(GITHUB_ALERT_TYPES)('round trips %s with inline formatting', (type) => {
    const markdown = `> [!${type}]\n> A **bold** and *italic* message.`
    const { ref, container } = setup(markdown)
    expect(container.querySelector(`[data-github-alert="${type}"]`)).not.toBeNull()
    expect(ref.current!.getMarkdown()).toBe(markdown)
  })
  it('preserves multiple paragraphs and lists through source replacement', () => {
    const markdown = '> [!IMPORTANT]\n> First\n>\n> * one\n> * two\n>\n> Last'
    const { ref } = setup(markdown)
    expect(ref.current!.getMarkdown()).toBe(markdown)
    act(() => {
      ref.current!.setMarkdown(ref.current!.getMarkdown())
    })
    expect(ref.current!.getMarkdown()).toBe(markdown)
  })
  it.each([
    '> Ordinary quote',
    '> \\[!NOTE]\n> Literal marker',
    '> &#91;!NOTE]\n> Literal entity',
    '> [!UNKNOWN]\n> Leave intact',
    '> Before [!NOTE]\n> Leave intact',
    '> [!NOTE] inline',
    '> [!NOTE]**inline**'
  ])('keeps ordinary quotes: %s', (markdown) => {
    const { ref, container } = setup(markdown)
    expect(container.querySelector('[data-github-alert]')).toBeNull()
    // Markdown may escape literal brackets; a second import preserves its meaning.
    const output = ref.current!.getMarkdown()
    act(() => {
      ref.current!.setMarkdown(output)
    })
    expect(ref.current!.getMarkdown()).toBe(output)
  })
  it('coexists with the required public quotePlugin', () => {
    const { ref } = setup('> [!TIP]\n> Tip\n\n> Ordinary quote', false)
    expect(ref.current!.getMarkdown()).toBe('> [!TIP]\n> Tip\n\n> Ordinary quote')
  })
  it('keeps empty alerts editable', () => {
    const { editor, ref } = setup('> [!NOTE]')
    editor.getEditorState().read(() => {
      const alert = $getRoot().getFirstChildOrThrow()
      expect($isGitHubAlertNode(alert)).toBe(true)
      expect($isElementNode(alert) && alert.getChildrenSize()).toBe(1)
    })
    expect(ref.current!.getMarkdown()).toContain('> [!NOTE]')
  })
  it('changes type with undo and redo, preserving content', async () => {
    const { editor, realm, ref } = setup('> [!NOTE]\n> Content')
    act(() => {
      editor.update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true })
    })
    act(() => {
      realm.pub(applyGitHubAlertType$, 'WARNING')
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toBe('> [!WARNING]\n> Content')
    })
    act(() => {
      editor.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toBe('> [!NOTE]\n> Content')
    })
    act(() => {
      editor.dispatchCommand(REDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toBe('> [!WARNING]\n> Content')
    })
  })
  it('blocks type changes in readOnly, including direct signal publication', async () => {
    const { editor, realm, ref } = setup('> [!NOTE]\n> Content', true)
    expect(screen.getByRole('combobox', { name: 'GitHub alert' })).toBeDisabled()
    act(() => {
      editor.update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true })
    })
    act(() => {
      realm.pub(applyGitHubAlertType$, 'WARNING')
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(ref.current!.getMarkdown()).toBe('> [!NOTE]\n> Content')
  })
  it('edits content with the normal Lexical history', async () => {
    const { editor, ref } = setup('> [!TIP]\n> Initial')
    act(() => {
      editor.update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true })
    })
    act(() => {
      editor.update(
        () => {
          const text = $getRoot().getFirstDescendant()!
          if ($isTextNode(text)) text.setTextContent('Changed')
        },
        { discrete: true, tag: HISTORY_PUSH_TAG }
      )
    })
    expect(ref.current!.getMarkdown()).toBe('> [!TIP]\n> Changed')
    act(() => {
      editor.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toBe('> [!TIP]\n> Initial')
    })
  })
  it('inserts an alert outside the existing content and undoes it', async () => {
    const { editor, realm, ref } = setup('Original')
    act(() => {
      editor.update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true })
    })
    act(() => {
      realm.pub(applyGitHubAlertType$, 'CAUTION')
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toContain('> [!CAUTION]')
    })
    expect(ref.current!.getMarkdown()).toContain('Original')
    act(() => {
      editor.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toBe('Original')
    })
  })
  it('exits an empty final paragraph on Enter without losing content', async () => {
    const { editor, ref } = setup('> [!TIP]\n> Content')
    act(() => {
      editor.update(
        () => {
          const alert = $getRoot().getFirstChildOrThrow()
          if ($isGitHubAlertNode(alert)) alert.append($createParagraphNode()).selectEnd()
        },
        { discrete: true }
      )
    })
    act(() => {
      editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toBe('> [!TIP]\n> Content')
    })
    editor.getEditorState().read(() => {
      const alert = $getRoot().getFirstChildOrThrow()
      expect($isGitHubAlertNode(alert) && alert.getChildrenSize()).toBe(1)
    })
  })
  it('preserves Lexical JSON serialization of alert type and content', () => {
    const { editor, ref } = setup('> [!IMPORTANT]\n> Content')
    const json = JSON.stringify(editor.getEditorState().toJSON())
    act(() => {
      editor.setEditorState(editor.parseEditorState(json))
    })
    expect(ref.current!.getMarkdown()).toBe('> [!IMPORTANT]\n> Content')
  })
})

describe('additional ordinary Markdown regression audit', () => {
  it.each([
    'See [!NOTE]\n\n[!NOTE]: https://example.com',
    '> Quote has a [!TIP]\n\n[!TIP]: https://example.com',
    '> [!WARNING]\n> See [!TIP]\n\n[!TIP]: https://example.com'
  ])('preserves the reference link AST in %s', (markdown) => {
    const tree = fromMarkdown(markdown, {
      mdastExtensions: [githubAlertsFromMarkdown]
    })
    expect(JSON.stringify(tree)).toContain('"type":"linkReference"')
    expect(JSON.stringify(tree)).toContain('"url":"https://example.com"')
  })
})

describe('additional marker source audit', () => {
  it.each(['\n', '\r\n', '\r'])('recognizes a standalone marker with %j line ending', (eol) => {
    const { container, ref } = setup('> [!NOTE]' + eol + '> Body')
    expect(container.querySelector('[data-github-alert="NOTE"]')).not.toBeNull()
    expect(ref.current!.getMarkdown()).toBe('> [!NOTE]\n> Body')
  })
})

it('recognizes the first-line marker even when its label is defined as a reference', () => {
  const tree = fromMarkdown('> [!NOTE]\n> Body uses [!TIP]\n\n[!NOTE]: /marker\n[!TIP]: /body', {
    mdastExtensions: [githubAlertsFromMarkdown]
  })
  const quote = tree.children[0]
  expect(quote.type).toBe('githubAlert')
  if (quote.type !== 'githubAlert') throw new Error('Expected a GitHub alert')
  const paragraph = quote.children[0]
  expect(paragraph.type).toBe('paragraph')
  if (paragraph.type !== 'paragraph') throw new Error('Expected a paragraph')
  expect(quote.alertType).toBe('NOTE')
  expect(paragraph.children[0]).toMatchObject({ type: 'text', value: 'Body uses ' })
  expect(paragraph.children.at(-1)).toMatchObject({ type: 'linkReference', identifier: '!tip' })
})

const listCases = [
  ['bullet', INSERT_UNORDERED_LIST_COMMAND, '> * Body'],
  ['number', INSERT_ORDERED_LIST_COMMAND, '> 1. Body'],
  ['check', INSERT_CHECK_LIST_COMMAND, '> * [ ] Body']
] as const

function selectAlertBody(editor: LexicalEditor) {
  act(() => {
    editor.update(() => {
      const alert = $getRoot().getFirstChildOrThrow()
      if (!$isGitHubAlertNode(alert)) throw new Error('Expected the first block to remain an alert')
      alert.getFirstChildOrThrow().selectStart()
    }, { discrete: true })
  })
}

function expectSelectionInAlert(editor: LexicalEditor) {
  editor.getEditorState().read(() => {
    const selection = $getSelection()
    expect($isRangeSelection(selection)).toBe(true)
    if (!$isRangeSelection(selection)) return
    let node = selection.anchor.getNode()
    while (node.getParent() && !$isGitHubAlertNode(node)) node = node.getParentOrThrow()
    expect($isGitHubAlertNode(node)).toBe(true)
  })
}

describe('list commands stay contained by the alert', () => {
  it.each(listCases)('converts an empty alert to an editable %s list without removing the marker', (type, command) => {
    const { editor, ref } = setup('> [!NOTE]')
    selectAlertBody(editor)
    act(() => {
      editor.update(() => { editor.dispatchCommand(command, undefined) }, { discrete: true, tag: HISTORY_PUSH_TAG })
    })
    editor.getEditorState().read(() => {
      const alert = $getRoot().getFirstChildOrThrow()
      expect($isGitHubAlertNode(alert)).toBe(true)
      if (!$isGitHubAlertNode(alert)) throw new Error('Empty alert was replaced')
      const list = alert.getFirstChildOrThrow()
      expect($isListNode(list) && list.getListType()).toBe(type)
    })
    expect(ref.current!.getMarkdown()).toContain('> [!NOTE]')
    expectSelectionInAlert(editor)
  })

  it.each(listCases)('preserves the marker through %s conversion, removal, undo and redo', async (type, command, body) => {
    const initial = '> [!NOTE]\n> Body\n\nOutside'
    const { editor, ref, container } = setup(initial)
    let originalKey = ''
    editor.getEditorState().read(() => { originalKey = $getRoot().getFirstChildOrThrow().getKey() })
    selectAlertBody(editor)
    act(() => {
      editor.update(() => { editor.dispatchCommand(command, undefined) }, { discrete: true, tag: HISTORY_PUSH_TAG })
    })
    const listed = `> [!NOTE]\n${body}\n\nOutside`
    expect(ref.current!.getMarkdown()).toBe(listed)
    expect(container.querySelectorAll('[data-github-alert="NOTE"]')).toHaveLength(1)
    editor.getEditorState().read(() => {
      const alert = $getRoot().getFirstChildOrThrow()
      expect(alert.getKey()).toBe(originalKey)
      expect($isGitHubAlertNode(alert)).toBe(true)
      if (!$isGitHubAlertNode(alert)) throw new Error('Alert was replaced by its list')
      const list = alert.getFirstChildOrThrow()
      expect($isListNode(list) && list.getListType()).toBe(type)
      expect($getRoot().getLastChildOrThrow().getTextContent()).toBe('Outside')
    })
    expectSelectionInAlert(editor)
    act(() => { editor.dispatchCommand(UNDO_COMMAND, undefined) })
    await waitFor(() => { expect(ref.current!.getMarkdown()).toBe(initial) })
    act(() => { editor.dispatchCommand(REDO_COMMAND, undefined) })
    await waitFor(() => { expect(ref.current!.getMarkdown()).toBe(listed) })
    expectSelectionInAlert(editor)
    act(() => {
      editor.update(() => { editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined) }, { discrete: true, tag: HISTORY_PUSH_TAG })
    })
    expect(ref.current!.getMarkdown()).toBe(initial)
    expectSelectionInAlert(editor)
    act(() => { editor.dispatchCommand(UNDO_COMMAND, undefined) })
    await waitFor(() => { expect(ref.current!.getMarkdown()).toBe(listed) })
    act(() => { editor.dispatchCommand(REDO_COMMAND, undefined) })
    await waitFor(() => { expect(ref.current!.getMarkdown()).toBe(initial) })
  })

  it('leaves an empty final list item inside the alert before a second Enter exits the alert', async () => {
    const { editor, ref } = setup('> [!TIP]\n> * Item')
    act(() => {
      editor.update(() => {
        const alert = $getRoot().getFirstChildOrThrow()
        if (!$isGitHubAlertNode(alert)) throw new Error('Expected an alert')
        const list = alert.getFirstChildOrThrow()
        if (!$isListNode(list)) throw new Error('Expected a list')
        list.append($createListItemNode()).selectEnd()
      }, { discrete: true, tag: HISTORY_PUSH_TAG })
    })
    act(() => { editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined) })
    await waitFor(() => {
      editor.getEditorState().read(() => {
        const alert = $getRoot().getFirstChildOrThrow()
        expect($isGitHubAlertNode(alert) && alert.getLastChildOrThrow().getType()).toBe('paragraph')
      })
    })
    expectSelectionInAlert(editor)
    act(() => { editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined) })
    await waitFor(() => {
      editor.getEditorState().read(() => {
        // MDXEditor appends a trailing paragraph after a final shadow root on import.
        // Exiting the alert must insert/select a paragraph immediately after the alert,
        // without relying on a fixed total number of root children.
        const alert = $getRoot().getFirstChildOrThrow()
        expect(alert.getNextSibling()?.getType()).toBe('paragraph')
        expect($isGitHubAlertNode(alert) && alert.getChildrenSize()).toBe(1)
        const selection = $getSelection()
        expect($isRangeSelection(selection) && selection.anchor.getNode().getKey()).toBe(alert.getNextSibling()?.getKey())
      })
    })
    expect(ref.current!.getMarkdown()).toBe('> [!TIP]\n> * Item')
  })
})

describe('composable Markdown serialization', () => {
  it.each([true, false])('does not replace another blockquote handler (other extension first: %s)', (otherFirst) => {
    const competingPlugin: RealmPlugin = {
      init(realm) {
        realm.pub(addToMarkdownExtension$, {
          handlers: {
            blockquote(node, parent, state, info) {
              return defaultHandlers.blockquote(node, parent, state, info).replace(/^> /gm, '> CUSTOM: ')
            }
          }
        })
      }
    }
    const { ref, container } = setup('> [!TIP]\n> Alert body\n\n> Ordinary quote', false, [competingPlugin], otherFirst)
    expect(container.querySelector('[data-github-alert="TIP"]')).not.toBeNull()
    expect(ref.current!.getMarkdown()).toBe('> [!TIP]\n> Alert body\n\n> CUSTOM: Ordinary quote')
  })
})

describe('standalone marker whitespace', () => {
  it.each([' ', '  ', '   ', '\t', ' \t  '])('accepts trailing %j without exporting a leading hard break', (space) => {
    const { ref, container } = setup(`> [!NOTE]${space}\n> Body`)
    expect(container.querySelector('[data-github-alert="NOTE"]')).not.toBeNull()
    expect(ref.current!.getMarkdown()).toBe('> [!NOTE]\n> Body')
    act(() => { ref.current!.setMarkdown(ref.current!.getMarkdown()) })
    expect(ref.current!.getMarkdown()).toBe('> [!NOTE]\n> Body')
  })
  it.each(['\n', '\r\n', '\r'])('accepts trailing tabs/spaces with %j and formatted content', (eol) => {
    const { ref, container } = setup(`> [!WARNING] \t  ${eol}> **Body**`)
    expect(container.querySelector('[data-github-alert="WARNING"]')).not.toBeNull()
    expect(ref.current!.getMarkdown()).toBe('> [!WARNING]\n> **Body**')
  })
  it.each(['> [!NOTE]   ', '> [!NOTE]\t', '> [!NOTE]  \n>\n> Body'])('supports an empty marker paragraph: %j', (markdown) => {
    const { ref, container } = setup(markdown)
    expect(container.querySelector('[data-github-alert="NOTE"]')).not.toBeNull()
    const output = ref.current!.getMarkdown()
    expect(output).toBe(markdown.includes('Body') ? '> [!NOTE]\n> Body' : '> [!NOTE]\n>')
    act(() => { ref.current!.setMarkdown(output) })
    expect(ref.current!.getMarkdown()).toBe(output)
  })
  it.each([
    '> [!NOTE]   inline',
    '> [!NOTE]\t**inline**',
    '> \\[!NOTE]   \n> Literal',
    '> &#91;!NOTE]   \n> Literal',
    '> [!UNKNOWN]   \n> Literal'
  ])('does not reinterpret marker-like text: %j', (markdown) => {
    const { ref, container } = setup(markdown)
    expect(container.querySelector('[data-github-alert]')).toBeNull()
    const output = ref.current!.getMarkdown()
    act(() => { ref.current!.setMarkdown(output) })
    expect(container.querySelector('[data-github-alert]')).toBeNull()
    expect(ref.current!.getMarkdown()).toBe(output)
  })
})

it('keeps selection in editable content after changing an alert type and after undo/redo', async () => {
  const { editor, realm, ref } = setup('> [!NOTE]\n> Content')
  selectAlertBody(editor)
  expectSelectionInAlert(editor)
  act(() => { realm.pub(applyGitHubAlertType$, 'IMPORTANT') })
  await waitFor(() => { expect(ref.current!.getMarkdown()).toBe('> [!IMPORTANT]\n> Content') })
  expectSelectionInAlert(editor)
  expect(document.activeElement).toBe(editor.getRootElement())
  act(() => { editor.dispatchCommand(UNDO_COMMAND, undefined) })
  await waitFor(() => { expect(ref.current!.getMarkdown()).toBe('> [!NOTE]\n> Content') })
  expectSelectionInAlert(editor)
  act(() => { editor.dispatchCommand(REDO_COMMAND, undefined) })
  await waitFor(() => { expect(ref.current!.getMarkdown()).toBe('> [!IMPORTANT]\n> Content') })
  expectSelectionInAlert(editor)
})

it('does not leak current alert type or edits between editor instances', async () => {
  const first = setup('> [!NOTE]\n> First')
  const second = setup('> [!TIP]\n> Second')
  selectAlertBody(first.editor)
  act(() => { first.realm.pub(applyGitHubAlertType$, 'WARNING') })
  await waitFor(() => { expect(first.ref.current!.getMarkdown()).toBe('> [!WARNING]\n> First') })
  expect(second.ref.current!.getMarkdown()).toBe('> [!TIP]\n> Second')
  selectAlertBody(second.editor)
  act(() => { second.realm.pub(applyGitHubAlertType$, 'CAUTION') })
  await waitFor(() => { expect(second.ref.current!.getMarkdown()).toBe('> [!CAUTION]\n> Second') })
  expect(first.ref.current!.getMarkdown()).toBe('> [!WARNING]\n> First')
})

it('reports the required public quotePlugin instead of depending on private quote visitors', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(() => {
      render(<MDXEditor markdown="" plugins={[githubAlertsPlugin()]} />)
    }).toThrow(/requires quotePlugin\(\)/)
  } finally {
    errors.mockRestore()
  }
})

it('accepts quotePlugin registered after githubAlertsPlugin', () => {
  const ref = React.createRef<MDXEditorMethods>()
  render(
    <MDXEditor
      ref={ref}
      markdown={'> [!TIP]\n> Body\n\n> Ordinary'}
      plugins={[githubAlertsPlugin(), quotePlugin()]}
    />
  )
  expect(ref.current!.getMarkdown()).toBe('> [!TIP]\n> Body\n\n> Ordinary')
})


it.each(['Original', ''])('can undo and redo an alert inserted before the first focus into %j', async (markdown) => {
  const { editor, realm, ref } = setup(markdown)
  editor.getEditorState().read(() => { expect($getSelection()).toBeNull() })
  act(() => { realm.pub(applyGitHubAlertType$, 'CAUTION') })
  await waitFor(() => { expect(ref.current!.getMarkdown()).toContain('> [!CAUTION]') })
  const inserted = ref.current!.getMarkdown()
  expectSelectionInAlert(editor)
  act(() => { editor.dispatchCommand(UNDO_COMMAND, undefined) })
  await waitFor(() => { expect(ref.current!.getMarkdown()).toBe(markdown) })
  act(() => { editor.dispatchCommand(REDO_COMMAND, undefined) })
  await waitFor(() => { expect(ref.current!.getMarkdown()).toBe(inserted) })
  expectSelectionInAlert(editor)
})

it('preserves an alert and its following paragraph as siblings inside a list after a fresh reload', () => {
  const markdown = '* > [!NOTE]\n  > Inside\n\n  Outside alert but inside list'
  const first = setup(markdown)
  expect(first.container.querySelector('[data-github-alert]')?.textContent).toBe('Inside')
  const output = first.ref.current!.getMarkdown()
  first.unmount()
  const second = setup(output)
  expect(second.container.querySelector('[data-github-alert]')?.textContent).toBe('Inside')
  expect(second.ref.current!.getMarkdown()).toBe(output)
  expect(second.container.querySelector('li')?.textContent).toContain('Outside alert but inside list')
})
