import { act, fireEvent, render, waitFor, within, screen } from '@testing-library/react'
import {
  $getRoot,
  $getSelection,
  $isTextNode,
  $isRangeSelection,
  $createTextNode,
  UNDO_COMMAND,
  BLUR_COMMAND,
  REDO_COMMAND,
  type LexicalEditor,
  createEditor
} from 'lexical'
import React from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MDXEditor, type MDXEditorMethods } from '../MDXEditor'
import { linkPlugin } from '../plugins/link'
import { tablePlugin, TableNode, $createTableNode } from '../plugins/table'

const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 100, 20) })
  vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {
        /* no layout in jsdom */
      }
      unobserve() {
        /* no layout in jsdom */
      }
      disconnect() {
        /* no layout in jsdom */
      }
    }
  )
})
afterAll(() => {
  if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect)
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const markdown = '| H1 | H2 | H3 |\n| :-- | :-: | --: |\n| **a** | [b](https://example.com) | |\n| d | e | f |\n| g | h | i |'
async function setup(initial = markdown, readOnly = false) {
  const ref = React.createRef<MDXEditorMethods>()
  const view = render(<MDXEditor ref={ref} markdown={initial} readOnly={readOnly} plugins={[tablePlugin(), linkPlugin()]} />)
  const cells = () => Array.from(view.container.querySelectorAll<HTMLElement>('tbody [contenteditable]'))
  await waitFor(() => {
    expect(cells().length).toBeGreaterThan(0)
  })
  const editor = (index: number) => (cells()[index] as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
  const values = () => cells().map((c) => c.textContent)
  const move = async (axis: 'Row' | 'Column', index: number, direction: string) => {
    fireEvent.click(within(view.container).getAllByRole('button', { name: axis + ' menu' })[index])
    fireEvent.click(await screen.findByRole('button', { name: 'Move ' + axis.toLowerCase() + ' ' + direction }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25))
    })
  }
  return { ...view, ref, cells, editor, values, move }
}
describe('table reordering', () => {
  it('moves whole columns with headers, alignment, rich content and blanks; undo/redo in one step', async () => {
    const v = await setup()
    act(() => {
      v.cells()[4].focus()
    })
    await v.move('Column', 1, 'right')
    expect(v.values()).toEqual(['H1', 'H3', 'H2', 'a', '', 'b', 'd', 'f', 'e', 'g', 'i', 'h'])
    expect(v.cells()[5].closest('td')).toHaveAttribute('data-active', 'true')
    expect(v.ref.current!.getMarkdown()).toContain('**a**')
    expect(v.ref.current!.getMarkdown()).toContain('[b](https://example.com)')
    expect(v.cells()[5].closest('td')!.className).toContain('centeredCell')
    act(() => {
      v.editor(5).dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()).toEqual(['H1', 'H2', 'H3', 'a', 'b', '', 'd', 'e', 'f', 'g', 'h', 'i'])
    })
    act(() => {
      v.editor(4).dispatchCommand(REDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()[5]).toBe('b')
    })
  })
  it('moves body rows, commits unsaved typing, and reverses repeated moves separately', async () => {
    const v = await setup()
    act(() => {
      v.cells()[6].focus()
      v.editor(6).update(
        () => {
          $getRoot().getLastDescendant()!.insertAfter($createTextNode(' typed'))
        },
        { discrete: true }
      )
    })
    await v.move('Row', 2, 'up')
    expect(v.values().slice(3, 6)).toEqual(['d typed', 'e', 'f'])
    expect(v.cells()[3].closest('td')).toHaveAttribute('data-active', 'true')
    await v.move('Row', 1, 'down')
    expect(v.values()[6]).toBe('d typed')
    act(() => {
      v.editor(6).dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()[3]).toBe('d typed')
    })
    act(() => {
      v.editor(3).dispatchCommand(UNDO_COMMAND, undefined)
    })
    await waitFor(() => {
      expect(v.values()[6]).toBe('d typed')
    })
    expect(v.values().slice(0, 3)).toEqual(['H1', 'H2', 'H3'])
  })
  it('disables boundary moves and the header row', async () => {
    const v = await setup()
    fireEvent.click(within(v.container).getAllByRole('button', { name: 'Row menu' })[0])
    expect(screen.getByRole('button', { name: 'Move row up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move row down' })).toBeDisabled()
  })
  it.each([
    ['Row', 1, 'up'],
    ['Row', 3, 'down'],
    ['Column', 0, 'left'],
    ['Column', 2, 'right']
  ] as const)('disables the %s %s boundary toward %s', async (axis, index, direction) => {
    const v = await setup()
    fireEvent.click(within(v.container).getAllByRole('button', { name: axis + ' menu' })[index])
    expect(screen.getByRole('button', { name: 'Move ' + axis.toLowerCase() + ' ' + direction })).toBeDisabled()
  })
  it('has no valid move for a header-only single-column table', async () => {
    const v = await setup('| H |\n| --- |')
    fireEvent.click(within(v.container).getByRole('button', { name: 'Column menu' }))
    expect(screen.getByRole('button', { name: 'Move column left' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move column right' })).toBeDisabled()
  })
  it('does not expose controls in readOnly mode', async () => {
    const v = await setup(markdown, true)
    expect(within(v.container).queryByRole('button', { name: 'Row menu' })).toBeNull()
    expect(within(v.container).queryByRole('button', { name: 'Column menu' })).toBeNull()
  })
  it('isolates two editor instances', async () => {
    const a = await setup()
    const b = await setup()
    await a.move('Row', 1, 'down')
    expect(a.values()[3]).toBe('d')
    expect(b.values()[3]).toBe('a')
  })
  it('ignores retained pre-move blur callbacks without losing focus or overwriting neighbors', async () => {
    const v = await setup()
    const oldEditor = v.editor(6)
    const register = oldEditor.registerCommand.bind(oldEditor)
    let retained: ((event: FocusEvent) => boolean) | undefined
    const spy = vi.spyOn(oldEditor, 'registerCommand').mockImplementation((command, listener, priority) => {
      if (command === BLUR_COMMAND) retained = listener as (event: FocusEvent) => boolean
      return register(command, listener, priority)
    })
    fireEvent.focus(v.cells()[6])
    await waitFor(() => {
      expect(retained).toBeDefined()
    })
    spy.mockRestore()
    await v.move('Row', 2, 'up')
    act(() => {
      retained!(new FocusEvent('blur', { relatedTarget: null }))
    })
    expect(v.values().slice(3, 9)).toEqual(['d', 'e', 'f', 'a', 'b', ''])
    expect(v.cells()[3].closest('td')).toHaveAttribute('data-active', 'true')
  })
  it('moves sparse columns through short rows without changing the source snapshot', () => {
    const editor = createEditor({
      nodes: [TableNode],
      onError: (e) => {
        throw e
      }
    })
    let key = ''
    editor.update(
      () => {
        const table = $createTableNode({
          type: 'table',
          align: ['left'],
          children: [
            { type: 'tableRow', children: ['a', 'b', 'c'].map((value) => ({ type: 'tableCell', children: [{ type: 'text', value }] })) },
            { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: 'short' }] }] }
          ]
        })
        $getRoot().append(table)
        key = table.getKey()
      },
      { discrete: true }
    )
    const before = editor.getEditorState().read(() => ($getRoot().getFirstChildOrThrow() as TableNode).getMdastNode())
    editor.update(
      () => {
        const table = $getRoot().getFirstChildOrThrow() as TableNode
        expect(table.getKey()).toBe(key)
        expect(table.moveColumn(0, 2)).toBe(true)
      },
      { discrete: true }
    )
    expect(before.children[1].children).toHaveLength(1)
    editor.getEditorState().read(() => {
      const table = $getRoot().getFirstChildOrThrow() as TableNode
      expect(table.getMdastNode().align).toEqual([null, null, 'left'])
      expect(table.getMdastNode().children[1].children).toEqual([
        { type: 'tableCell', children: [] },
        { type: 'tableCell', children: [] },
        { type: 'tableCell', children: [{ type: 'text', value: 'short' }] }
      ])
    })
  })
  it('rejects invalid node moves without marking the table dirty', () => {
    const editor = createEditor({
      nodes: [TableNode],
      onError: (e) => {
        throw e
      }
    })
    editor.update(
      () => {
        const table = $createTableNode({ type: 'table', children: [{ type: 'tableRow', children: [{ type: 'tableCell', children: [] }] }] })
        $getRoot().append(table)
        for (const [from, to] of [
          [0, 1],
          [1, 0],
          [-1, 0],
          [NaN, 0],
          [0, Infinity],
          [0, 0]
        ]) {
          expect(table.moveRow(from, to)).toBe(false)
          expect(table.moveColumn(from, to)).toBe(false)
        }
      },
      { discrete: true }
    )
  })
  it.each([
    ['Column', 1, 'right', 8],
    ['Row', 2, 'up', 4]
  ] as const)('restores DOM focus and exact selection after moving an active %s', async (axis, index, direction, destination) => {
    const v = await setup()
    act(() => {
      v.cells()[7].focus()
      v.editor(7).update(
        () => {
          const text = $getRoot().getLastDescendant()
          if (!$isTextNode(text)) throw new Error('Expected text cell')
          text.select(0, 0)
        },
        { discrete: true }
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    const original = v.cells()[7]
    await v.move(axis, index, direction)
    await waitFor(() => {
      expect(v.cells()[destination]).toBe(original)
      expect(document.activeElement).toBe(original)
    })
    v.editor(destination)
      .getEditorState()
      .read(() => {
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
        if ($isRangeSelection(selection)) {
          expect(selection.anchor.offset).toBe(0)
          expect(selection.focus.offset).toBe(0)
        }
      })
  })
})
