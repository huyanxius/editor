import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Realm } from '@mdxeditor/gurx'
import { undo, redo } from '@codemirror/commands'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { $getRoot } from 'lexical'
import { MDXEditor, type MDXEditorMethods } from '../MDXEditor'
import { diffSourcePlugin } from '../plugins/diff-source'
import { insertMarkdown$, markdown$, rootEditor$, viewMode$ } from '../plugins/core'
import { realmPlugin } from '../RealmWithPlugins'

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects')
const originalRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
beforeAll(() => {
  // jsdom has no layout, but CodeMirror measures its actual document and selection.
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() })
})
afterAll(() => {
  if (originalRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRects)
  else Reflect.deleteProperty(Range.prototype, 'getClientRects')
  if (originalRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRect)
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
})

async function renderSourceEditor(mode: 'source' | 'diff', options: { readOnly?: boolean; readOnlyDiff?: boolean } = {}) {
  let realm!: Realm
  let currentView: EditorView | null = null
  const views: EditorView[] = []
  const capture = realmPlugin({
    init(value) {
      realm = value
    }
  })
  const ref = React.createRef<MDXEditorMethods>()
  const onChange = vi.fn()
  const result = render(
    <MDXEditor
      ref={ref}
      markdown="original"
      readOnly={options.readOnly}
      onChange={onChange}
      plugins={[
        capture(),
        diffSourcePlugin({
          diffMarkdown: 'comparison baseline',
          readOnlyDiff: options.readOnlyDiff,
          codeMirrorExtensions: [
            ViewPlugin.define((view) => {
              currentView = view
              views.push(view)
              return {}
            })
          ]
        })
      ]}
    />
  )
  await waitFor(() => {
    expect(realm.getValue(rootEditor$)).not.toBeNull()
  })
  act(() => {
    realm.getValue(rootEditor$)!.update(
      () => {
        $getRoot().selectEnd()
      },
      { discrete: true }
    )
    realm.pub(viewMode$, mode)
  })
  await waitFor(() => {
    expect(currentView).not.toBeNull()
  })
  return { ...result, realm, ref, onChange, getView: () => currentView!, views }
}

function changeSource(view: EditorView, text: string, from = text.length, to = from) {
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: from, head: to } })
  })
}

describe.each(['source', 'diff'] as const)('insertMarkdown in %s mode', (mode) => {
  it('preserves unsynchronized edits and does not replace the CodeMirror instance', async () => {
    const { ref, realm, getView, onChange, views } = await renderSourceEditor(mode)
    const view = getView()
    changeSource(view, 'unsaved source')
    expect(ref.current!.getMarkdown()).toBe('unsaved source')
    onChange.mockClear()
    act(() => {
      ref.current!.insertMarkdown('INSERT')
    })
    expect(ref.current!.getMarkdown()).toBe('unsaved sourceINSERT')
    expect(getView()).toBe(view)
    expect(view.state.doc.toString()).toBe('unsaved sourceINSERT')
    expect(realm.getValue(markdown$)).toBe('original')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('unsaved sourceINSERT', false)
    if (mode === 'diff') expect(views[0].state.doc.toString()).toBe('comparison baseline')
  })

  it('replaces the current selection and moves the caret after the inserted markdown', async () => {
    const { ref, getView } = await renderSourceEditor(mode)
    changeSource(getView(), 'abcdef', 2, 4)
    act(() => {
      ref.current!.insertMarkdown('**X**')
    })
    expect(ref.current!.getMarkdown()).toBe('ab**X**ef')
    expect(getView().state.selection.main.from).toBe(7)
    expect(getView().state.selection.main.empty).toBe(true)
  })

  it('keeps repeated inserts in separate native undo/redo steps', async () => {
    const { ref, getView } = await renderSourceEditor(mode)
    const view = getView()
    changeSource(view, 'draft')
    act(() => {
      ref.current!.insertMarkdown(' one')
      ref.current!.insertMarkdown(' two')
    })
    expect(ref.current!.getMarkdown()).toBe('draft one two')
    act(() => {
      expect(undo(view)).toBe(true)
    })
    expect(ref.current!.getMarkdown()).toBe('draft one')
    act(() => {
      expect(undo(view)).toBe(true)
    })
    expect(ref.current!.getMarkdown()).toBe('draft')
    act(() => {
      expect(redo(view)).toBe(true)
      expect(redo(view)).toBe(true)
    })
    expect(ref.current!.getMarkdown()).toBe('draft one two')
  })

  it('returns to rich text without stale source handlers and rebinds only once', async () => {
    const { ref, realm, getView } = await renderSourceEditor(mode)
    changeSource(getView(), 'draft')
    act(() => {
      ref.current!.insertMarkdown(' source')
    })
    const previousView = getView()
    act(() => {
      realm.pub(viewMode$, 'rich-text')
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toBe('draft source')
    })
    const oldDispatch = vi.spyOn(previousView, 'dispatch')
    act(() => {
      realm.getValue(rootEditor$)!.update(
        () => {
          $getRoot().selectEnd()
        },
        { discrete: true }
      )
      ref.current!.insertMarkdown('RICH')
    })
    await waitFor(() => {
      expect(ref.current!.getMarkdown()).toBe('draft sourceRICH')
    })
    expect(oldDispatch).not.toHaveBeenCalled()
    act(() => {
      realm.pub(viewMode$, mode)
    })
    await waitFor(() => {
      expect(getView()).not.toBe(previousView)
    })
    act(() => {
      getView().dispatch({ selection: { anchor: getView().state.doc.length } })
      ref.current!.insertMarkdown('ONCE')
    })
    expect(ref.current!.getMarkdown()).toBe('draft sourceRICHONCE')
    expect(oldDispatch).not.toHaveBeenCalled()
    oldDispatch.mockRestore()
  })

  it('unsubscribes from insertions when the editor is unmounted', async () => {
    const { realm, getView, unmount } = await renderSourceEditor(mode)
    const view = getView()
    unmount()
    const dispatch = vi.spyOn(view, 'dispatch')
    act(() => {
      realm.pub(insertMarkdown$, 'ignored')
    })
    expect(dispatch).not.toHaveBeenCalled()
    dispatch.mockRestore()
  })

  it('does not insert into another editor instance', async () => {
    const first = await renderSourceEditor(mode)
    const second = await renderSourceEditor(mode)
    changeSource(first.getView(), 'first draft')
    changeSource(second.getView(), 'second draft')
    act(() => {
      first.ref.current!.insertMarkdown('FIRST')
    })
    expect(first.ref.current!.getMarkdown()).toBe('first draftFIRST')
    expect(second.ref.current!.getMarkdown()).toBe('second draft')
    act(() => {
      second.ref.current!.insertMarkdown('SECOND')
    })
    expect(first.ref.current!.getMarkdown()).toBe('first draftFIRST')
    expect(second.ref.current!.getMarkdown()).toBe('second draftSECOND')
  })
})

it.each([
  { mode: 'source' as const, readOnly: true },
  { mode: 'diff' as const, readOnly: true },
  { mode: 'diff' as const, readOnlyDiff: true }
])('keeps explicit imperative updates available with readonly options: %j', async ({ mode, ...options }) => {
  const { ref, getView } = await renderSourceEditor(mode, options)
  expect(getView().state.readOnly).toBe(true)
  act(() => {
    getView().dispatch({ selection: { anchor: getView().state.doc.length } })
    ref.current!.insertMarkdown('INSERT')
  })
  expect(ref.current!.getMarkdown()).toBe('originalINSERT')
  expect(getView().state.readOnly).toBe(true)
})
