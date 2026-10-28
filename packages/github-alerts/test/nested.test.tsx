import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  MDXEditor,
  AdmonitionDirectiveDescriptor,
  activeEditor$,
  directivesPlugin,
  quotePlugin,
  rootEditor$,
  type MDXEditorMethods,
  type Realm
} from '@mdxeditor/editor'
import {
  $getRoot,
  $isTextNode,
  HISTORY_PUSH_TAG,
  getNearestEditorFromDOMNode,
  REDO_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor
} from 'lexical'
import { applyGitHubAlertType$, githubAlertsPlugin, $isGitHubAlertNode } from '../src/index'

const original = ':::note\n> [!TIP]\n> Nested\n:::'

function setup(markdown = original) {
  const ref = React.createRef<MDXEditorMethods>()
  let realm!: Realm
  let root!: LexicalEditor
  const rendered = render(
    <div>
      <button type="button">Outside editor</button>
      <MDXEditor
        ref={ref}
        markdown={markdown}
        plugins={[
          quotePlugin(),
          githubAlertsPlugin(),
          directivesPlugin({ directiveDescriptors: [AdmonitionDirectiveDescriptor] }),
          { postInit(r) { realm = r; root = r.getValue(rootEditor$)! } }
        ]}
      />
    </div>
  )
  return {
    ...rendered,
    ref,
    get realm() { return realm },
    get root() { return root },
    async focusNested() {
      const nested = rendered.container.querySelector<HTMLElement>('[contenteditable="true"] [contenteditable="true"]')
      if (!nested) throw new Error('Expected the public directive editor to render a nested contenteditable')
      // DOM focus alone does not synthesize a selectionchange in jsdom. Resolve
      // through Lexical's public DOM API and focus/select with its public methods.
      const editor = getNearestEditorFromDOMNode(nested)
      if (!editor || editor === root) throw new Error('Expected a distinct nested Lexical editor')
      act(() => { editor.focus() })
      act(() => {
        editor.update(() => {
          const alert = $getRoot().getFirstChildOrThrow()
          if (!$isGitHubAlertNode(alert)) throw new Error('Expected a nested alert node')
          alert.getFirstChildOrThrow().selectEnd()
        }, { discrete: true })
      })
      act(() => { document.dispatchEvent(new Event('selectionchange')) })
      await waitFor(() => { expect(realm.getValue(activeEditor$)).toBe(editor) })
      return editor
    },
    blurNested(editor: LexicalEditor) {
      const editable = editor.getRootElement()
      if (!editable) throw new Error('Expected a mounted nested editor')
      act(() => {
        fireEvent.blur(editable, { relatedTarget: rendered.getByRole('button', { name: 'Outside editor' }) })
      })
    }
  }
}

describe('alerts in a directive nested editor', () => {
  it('exports untouched nested MDAST without escaping its marker and reloads the alert', () => {
    const { ref, container } = setup()
    expect(container.querySelector('[data-github-alert="TIP"]')).not.toBeNull()
    expect(ref.current!.getMarkdown()).toBe(original)
    act(() => { ref.current!.setMarkdown(ref.current!.getMarkdown()) })
    expect(container.querySelector('[data-github-alert="TIP"]')).not.toBeNull()
    expect(ref.current!.getMarkdown()).toBe(original)
  })

  it('serializes nested content and type edits, then restores the alert after Markdown reload', async () => {
    const view = setup()
    const nested = await view.focusNested()
    act(() => {
      nested.update(() => {
        const text = $getRoot().getFirstDescendant()
        if (!$isTextNode(text)) throw new Error('Expected editable alert text')
        text.setTextContent('Edited nested content')
      }, { discrete: true, tag: HISTORY_PUSH_TAG })
    })
    act(() => { view.realm.pub(applyGitHubAlertType$, 'WARNING') })
    await waitFor(() => { expect(view.container.querySelector('[data-github-alert="WARNING"]')).not.toBeNull() })
    view.blurNested(nested)
    const expected = ':::note\n> [!WARNING]\n> Edited nested content\n:::'
    await waitFor(() => { expect(view.ref.current!.getMarkdown()).toBe(expected) })
    act(() => { view.ref.current!.setMarkdown(expected) })
    expect(view.container.querySelector('[data-github-alert="WARNING"]')).not.toBeNull()
    expect(view.ref.current!.getMarkdown()).toBe(expected)
  })

  it('remounts edited nested alerts from the public Lexical JSON state', async () => {
    const first = setup()
    const nested = await first.focusNested()
    act(() => {
      nested.update(() => {
        const text = $getRoot().getFirstDescendant()
        if (!$isTextNode(text)) throw new Error('Expected editable alert text')
        text.setTextContent('Saved content')
      }, { discrete: true, tag: HISTORY_PUSH_TAG })
    })
    act(() => { first.realm.pub(applyGitHubAlertType$, 'IMPORTANT') })
    await waitFor(() => { expect(first.container.querySelector('[data-github-alert="IMPORTANT"]')).not.toBeNull() })
    first.blurNested(nested)
    const expected = ':::note\n> [!IMPORTANT]\n> Saved content\n:::'
    await waitFor(() => { expect(first.ref.current!.getMarkdown()).toBe(expected) })
    const json = JSON.stringify(first.root.getEditorState().toJSON())
    first.unmount()
    const second = setup('')
    act(() => { second.root.setEditorState(second.root.parseEditorState(json)) })
    await waitFor(() => { expect(second.container.querySelector('[data-github-alert="IMPORTANT"]')).not.toBeNull() })
    expect(second.ref.current!.getMarkdown()).toBe(expected)
    const restoredNested = await second.focusNested()
    restoredNested.getEditorState().read(() => {
      const alert = $getRoot().getFirstChildOrThrow()
      expect($isGitHubAlertNode(alert) && alert.getAlertType()).toBe('IMPORTANT')
      expect(alert.getTextContent()).toBe('Saved content')
    })
  })

  it('undoes and redoes nested alert type changes without changing the nested body', async () => {
    const view = setup()
    const nested = await view.focusNested()
    act(() => { view.realm.pub(applyGitHubAlertType$, 'CAUTION') })
    await waitFor(() => { expect(view.container.querySelector('[data-github-alert="CAUTION"]')).toHaveTextContent('Nested') })
    act(() => { nested.dispatchCommand(UNDO_COMMAND, undefined) })
    await waitFor(() => { expect(view.container.querySelector('[data-github-alert="TIP"]')).toHaveTextContent('Nested') })
    act(() => { nested.dispatchCommand(REDO_COMMAND, undefined) })
    await waitFor(() => { expect(view.container.querySelector('[data-github-alert="CAUTION"]')).toHaveTextContent('Nested') })
    view.blurNested(nested)
    await waitFor(() => { expect(view.ref.current!.getMarkdown()).toBe(':::note\n> [!CAUTION]\n> Nested\n:::') })
  })

  it('retains the alert type and marker when nested content is undone and redone', async () => {
    const view = setup()
    const nested = await view.focusNested()
    act(() => {
      nested.update(() => {
        const text = $getRoot().getFirstDescendant()
        if (!$isTextNode(text)) throw new Error('Expected editable alert text')
        text.setTextContent('Changed')
      }, { discrete: true, tag: HISTORY_PUSH_TAG })
    })
    expect(view.container.querySelector('[data-github-alert="TIP"]')).toHaveTextContent('Changed')
    act(() => { nested.dispatchCommand(UNDO_COMMAND, undefined) })
    await waitFor(() => { expect(view.container.querySelector('[data-github-alert="TIP"]')).toHaveTextContent('Nested') })
    act(() => { nested.dispatchCommand(REDO_COMMAND, undefined) })
    await waitFor(() => { expect(view.container.querySelector('[data-github-alert="TIP"]')).toHaveTextContent('Changed') })
    view.blurNested(nested)
    await waitFor(() => { expect(view.ref.current!.getMarkdown()).toBe(':::note\n> [!TIP]\n> Changed\n:::') })
  })
})
