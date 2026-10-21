import { getPeerDependencyFromEditor } from '@lexical/extension'
import { HistoryExtension } from '@lexical/history'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  HISTORY_PUSH_TAG,
  PASTE_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor
} from 'lexical'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MDXEditor, type MDXEditorMethods } from '../MDXEditor'
import { rootEditor$ } from '../plugins/core'
import { tablePlugin } from '../plugins/table'

const markdown = '| H1 | H2 |\n| :-- | --: |\n| **a** | b |\n| c | d |\n\n| Next |\n| ---- |\n| End |'
const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects')

beforeEach(() => {
  vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 100, 20) })
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
  vi.stubGlobal('ClipboardEvent', class ClipboardEvent extends Event {})
  vi.stubGlobal('DragEvent', class DragEvent extends Event {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        return undefined
      }
      unobserve() {
        return undefined
      }
      disconnect() {
        return undefined
      }
    }
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (rangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rangeRect)
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  if (rangeRects) Object.defineProperty(Range.prototype, 'getClientRects', rangeRects)
  else Reflect.deleteProperty(Range.prototype, 'getClientRects')
})

const historyFor = (editor: LexicalEditor) =>
  getPeerDependencyFromEditor<typeof HistoryExtension>(editor, HistoryExtension.name)!.output.historyState.value

async function setup() {
  let root!: LexicalEditor
  const ref = React.createRef<MDXEditorMethods>()
  const view = render(
    <MDXEditor
      ref={ref}
      markdown={markdown}
      plugins={[
        tablePlugin(),
        {
          postInit: (realm) => {
            root = realm.getValue(rootEditor$)!
          }
        }
      ]}
    />
  )
  const firstTableCells = () =>
    Array.from(view.container.querySelector('table')!.querySelectorAll<HTMLElement>('tbody [contenteditable="true"]'))
  const cellEditor = (index: number) => (firstTableCells()[index] as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
  const values = () => firstTableCells().map((cell) => cell.textContent)
  const shape = () =>
    root.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((node) => node.getType())
    )
  await waitFor(() => {
    expect(firstTableCells()).toHaveLength(6)
  })
  const focus = async (index: number) => {
    act(() => {
      firstTableCells()[index].focus()
    })
    await waitFor(() => {
      expect(firstTableCells()[index].closest('td, th')).toHaveAttribute('data-active', 'true')
    })
  }
  const paste = (index: number, text: string) => {
    const event = new ClipboardEvent('paste', { cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: { files: [], types: ['text/plain'], getData: (type: string) => (type === 'text/plain' ? text : '') }
    })
    act(() => {
      cellEditor(index).dispatchCommand(PASTE_COMMAND, event)
    })
  }
  const type = (index: number, text: string) => {
    act(() => {
      cellEditor(index).update(
        () => {
          $getRoot().selectEnd()
        },
        { discrete: true }
      )
      cellEditor(index).update(
        () => {
          const paragraph = $getRoot().getFirstChildOrThrow()
          if (!$isParagraphNode(paragraph)) throw new Error('Expected cell paragraph')
          paragraph.append($createTextNode(text))
        },
        { discrete: true, tag: HISTORY_PUSH_TAG }
      )
    })
  }
  const insert = async (before: boolean) => {
    const menu = screen.getAllByRole('button', { name: 'Table menu' })[0]
    act(() => {
      menu.focus()
    })
    fireEvent.click(menu)
    fireEvent.click(await screen.findByRole('button', { name: `Insert paragraph ${before ? 'before' : 'after'} table` }))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  }
  return { ...view, root, ref, cells: firstTableCells, cellEditor, values, shape, focus, paste, type, insert }
}

describe('combined table paste, reordering and prose entry', () => {
  it('commits pasted-cell typing once when prose takes focus, preserving ordered Undo and Redo', async () => {
    const v = await setup()
    await v.focus(4)
    v.paste(4, 'x\ty')
    await waitFor(() => {
      expect(v.values()).toEqual(['H1', 'H2', 'a', 'b', 'x', 'y'])
    })
    await v.focus(4)
    v.type(4, ' typed')
    const localHistory = historyFor(v.cellEditor(4))
    expect(localHistory.undoStack.length).toBeGreaterThan(0)
    await v.insert(false)
    expect(v.shape()).toEqual(['table', 'paragraph', 'table', 'paragraph'])
    expect(v.root.getRootElement()).toHaveFocus()
    expect(v.ref.current!.getMarkdown()).toContain('x typed')
    expect(localHistory.undoStack).toHaveLength(0)
    act(() => {
      v.root.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.shape()).toEqual(['table', 'table', 'paragraph'])
    })
    expect(v.values()[4]).toBe('x typed')
    await v.focus(4)
    act(() => {
      v.cellEditor(4).dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()[4]).toBe('x')
    })
    act(() => {
      v.cellEditor(4).dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()).toEqual(['H1', 'H2', 'a', 'b', 'c', 'd'])
    })
    act(() => {
      v.cellEditor(4).dispatchCommand(REDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()[4]).toBe('x')
    })
    act(() => {
      v.cellEditor(4).dispatchCommand(REDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()[4]).toBe('x typed')
    })
    act(() => {
      v.root.dispatchCommand(REDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.shape()).toEqual(['table', 'paragraph', 'table', 'paragraph'])
    })
  })

  it('saves the moved active cell at its new coordinates before prose and undoes each operation once', async () => {
    const v = await setup()
    await v.focus(4)
    v.paste(4, 'x\ty')
    await waitFor(() => {
      expect(v.values()[4]).toBe('x')
    })
    await v.focus(4)
    v.type(4, ' before move')
    const rowMenu = screen.getAllByRole('button', { name: 'Row menu' })[2]
    act(() => {
      rowMenu.focus()
    })
    fireEvent.click(rowMenu)
    fireEvent.click(await screen.findByRole('button', { name: 'Move row up' }))
    await waitFor(() => {
      expect(v.values()).toEqual(['H1', 'H2', 'x before move', 'y', 'a', 'b'])
      expect(v.cells()[2]).toHaveFocus()
    })
    v.type(2, ' after move')
    await v.insert(true)
    expect(v.shape()).toEqual(['paragraph', 'table', 'table', 'paragraph'])
    expect(v.root.getRootElement()).toHaveFocus()
    expect(v.values()).toEqual(['H1', 'H2', 'x before move after move', 'y', 'a', 'b'])
    expect(v.ref.current!.getMarkdown()).toContain('**a**')
    expect(v.cells()[3].closest('td')!.className).toContain('rightAlignedCell')
    act(() => {
      v.root.dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.shape()).toEqual(['table', 'table', 'paragraph'])
    })
    await v.focus(2)
    act(() => {
      v.cellEditor(2).dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()[2]).toBe('x before move')
    })
    act(() => {
      v.cellEditor(2).dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()).toEqual(['H1', 'H2', 'a', 'b', 'x before move', 'y'])
    })
    act(() => {
      v.cellEditor(4).dispatchCommand(REDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()).toEqual(['H1', 'H2', 'x before move', 'y', 'a', 'b'])
    })
    act(() => {
      v.cellEditor(2).dispatchCommand(REDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()[2]).toBe('x before move after move')
    })
    act(() => {
      v.root.dispatchCommand(REDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.shape()).toEqual(['paragraph', 'table', 'table', 'paragraph'])
    })
  })
})
