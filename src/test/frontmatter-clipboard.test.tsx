import { $getClipboardDataFromSelection, $insertDataTransferForRichText, type LexicalClipboardData } from '@lexical/clipboard'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { $getRoot, $getSelection, $isTextNode, type LexicalEditor } from 'lexical'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { MDXEditor, type MDXEditorMethods } from '../MDXEditor'
import { rootEditor$ } from '../plugins/core'
import { $isFrontmatterNode, frontmatterPlugin } from '../plugins/frontmatter'

const markdown = '---\ntitle: Document metadata\n---\n\nVisible body'

function renderDocument() {
  let editor!: LexicalEditor
  const ref = React.createRef<MDXEditorMethods>()
  render(
    <MDXEditor
      ref={ref}
      markdown={markdown}
      plugins={[frontmatterPlugin(), { postInit: (realm) => (editor = realm.getValue(rootEditor$)!) }]}
    />
  )
  const selectAll = (backward = false) => {
    act(() => {
      editor.update(
        () => {
          const root = $getRoot()
          const end = root.getChildrenSize()
          root.select(backward ? end : 0, backward ? 0 : end)
        },
        { discrete: true }
      )
    })
  }
  return { editor, ref, selectAll }
}

describe('frontmatter clipboard isolation (#727)', () => {
  it.each([false, true])('copies only visible content with a whole-document range (backward: %s)', (backward) => {
    const { editor, ref, selectAll } = renderDocument()
    selectAll(backward)

    const clipboard = editor.read(() => $getClipboardDataFromSelection())
    expect(clipboard['application/x-lexical-editor']).not.toContain('frontmatter')
    expect(clipboard['application/x-lexical-editor']).not.toContain('Document metadata')
    expect(clipboard['text/plain'].trim()).toBe('Visible body')
    expect(clipboard['text/html']).not.toContain('<div')
    expect(clipboard['text/html']).toContain('Visible body')
    expect(ref.current?.getSelectionMarkdown()).toBe('Visible body')
    expect(ref.current?.getMarkdown()).toBe(markdown)
  })

  it('does not paste a second frontmatter node with copied body content', () => {
    const { editor, ref, selectAll } = renderDocument()
    selectAll()
    const clipboard = editor.read(() => $getClipboardDataFromSelection())

    act(() => {
      editor.update(
        () => {
          $getRoot().selectEnd()
          const data = { getData: (format: keyof LexicalClipboardData) => clipboard[format] ?? '' } as DataTransfer
          $insertDataTransferForRichText(data, $getSelection()!, editor)
        },
        { discrete: true }
      )
    })

    expect(editor.getEditorState().read(() => $getRoot().getChildren().filter($isFrontmatterNode))).toHaveLength(1)
    expect(ref.current?.getMarkdown().match(/title: Document metadata/g)).toHaveLength(1)
    expect(ref.current?.getMarkdown().match(/Visible body/g)).toHaveLength(2)
  })

  it('still includes frontmatter in full document JSON serialization', () => {
    const { editor, ref } = renderDocument()
    const serialized = editor.getEditorState().toJSON()
    expect(serialized.root.children[0]).toMatchObject({ type: 'frontmatter', yaml: 'title: Document metadata' })

    act(() => {
      editor.setEditorState(editor.parseEditorState(serialized))
    })

    expect(ref.current?.getMarkdown()).toBe(markdown)
  })

  it('keeps normal partial body selections clipped', () => {
    const { editor, ref } = renderDocument()
    act(() => {
      editor.update(
        () => {
          const text = $getRoot().getLastDescendant()
          if (!$isTextNode(text)) throw new Error('Expected body text')
          text.select(8, 12)
        },
        { discrete: true }
      )
    })

    const clipboard = editor.read(() => $getClipboardDataFromSelection())
    expect(clipboard['text/plain']).toBe('body')
    expect(clipboard['application/x-lexical-editor']).not.toContain('frontmatter')
    expect(ref.current?.getSelectionMarkdown()).toBe('body')
    expect(ref.current?.getMarkdown()).toBe(markdown)
  })

  it('preserves document metadata when deleting a whole-document range', async () => {
    const { editor, ref, selectAll } = renderDocument()
    selectAll()

    fireEvent.keyDown(editor.getRootElement()!, { key: 'Backspace', keyCode: 8 })

    await waitFor(() => {
      expect(ref.current?.getMarkdown()).toBe('---\ntitle: Document metadata\n---')
    })
    expect(editor.getEditorState().read(() => $getRoot().getChildren().filter($isFrontmatterNode))).toHaveLength(1)
  })
})
