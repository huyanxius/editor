import React from 'react'
import { Cell, Signal, useCellValue, usePublisher, type NodeRef } from '@mdxeditor/editor'
import {
  $createParagraphNode,
  $getSelection,
  $getRoot,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  INSERT_PARAGRAPH_COMMAND,
  COMMAND_PRIORITY_LOW,
  $isParagraphNode
} from 'lexical'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import { realmPlugin } from '@mdxeditor/editor'
import {
  activeEditor$,
  activePlugins$,
  addActivePlugin$,
  addExportVisitor$,
  addImportVisitor$,
  addLexicalNode$,
  addToMarkdownExtension$,
  addMdastExtension$,
  createActiveEditorSubscription$,
  readOnly$,
  useTranslation
} from '@mdxeditor/editor'
import { Select } from '@mdxeditor/editor'
import { $createGitHubAlertNode, $isGitHubAlertNode, GITHUB_ALERT_TYPES, GitHubAlertNode, type GitHubAlertType } from './GitHubAlertNode.js'
import { githubAlertsToMarkdown, LexicalGitHubAlertVisitor, MdastGitHubAlertVisitor } from './visitors.js'
import { githubAlertsFromMarkdown } from './syntax.js'
export * from './GitHubAlertNode.js'

function $selectedAlert(): GitHubAlertNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  let node = selection.anchor.getNode()
  while (node.getParent()) {
    if ($isGitHubAlertNode(node)) return node
    node = node.getParent()!
  }
  return null
}

/** The alert type at the selection, or an empty string outside an alert. @group GitHub Alerts */
export const currentGitHubAlertType$: NodeRef<GitHubAlertType | ''> = Cell<GitHubAlertType | ''>('', (r) => {
  r.pub(createActiveEditorSubscription$, (editor) =>
    editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        r.pub(currentGitHubAlertType$, $selectedAlert()?.getAlertType() ?? '')
      })
    })
  )
})

/** Changes the selected alert's type, or inserts an empty alert at the selection. @group GitHub Alerts */
export const applyGitHubAlertType$: NodeRef<GitHubAlertType> = Signal<GitHubAlertType>((r) => {
  r.sub(applyGitHubAlertType$, (type) => {
    const editor = r.getValue(activeEditor$)
    if (!editor || !editor.isEditable() || r.getValue(readOnly$) || !GITHUB_ALERT_TYPES.includes(type)) return
    if (editor.getEditorState().read(() => $getSelection() === null)) {
      // A toolbar action can precede the editor's first focus. Commit its caret
      // before changing content, so normal Lexical history has a baseline to
      // undo to. Do not inspect or mutate the editor's private history stacks.
      editor.update(() => { $getRoot().selectEnd() }, { discrete: true })
    }
    editor.update(
      () => {
        const alert = $selectedAlert()
        if (alert) alert.setAlertType(type)
        else {
          const node = $createGitHubAlertNode(type).append($createParagraphNode())
          $insertNodeToNearestRoot(node)
          node.selectStart()
        }
      },
      { tag: HISTORY_PUSH_TAG }
    )
  })
})

/** A toolbar control for inserting GitHub alerts and changing their type. @group Toolbar Components */
export function GitHubAlertTypeSelect() {
  const type = useCellValue(currentGitHubAlertType$)
  const apply = usePublisher(applyGitHubAlertType$)
  const t = useTranslation()
  return (
    <Select
      value={type}
      onChange={(value) => {
        if (value) apply(value)
      }}
      triggerTitle={t('toolbar.githubAlertType', 'GitHub alert type')}
      placeholder={t('toolbar.githubAlert', 'GitHub alert')}
      items={GITHUB_ALERT_TYPES.map((value) => ({ value, label: t(`githubAlerts.${value.toLowerCase()}`, value) }))}
    />
  )
}

/**
 * Adds native GitHub alerts (`> [!NOTE]`) without enabling directive syntax.
 * Supports NOTE, TIP, IMPORTANT, WARNING and CAUTION. Include the public quotePlugin() for ordinary block quotes.
 * Add {@link GitHubAlertTypeSelect} to a toolbar to insert alerts or change their type.
 * @group GitHub Alerts
 */
export const githubAlertsPlugin = realmPlugin({
  postInit(realm) {
    if (!realm.getValue(activePlugins$).includes('quote')) {
      throw new Error('githubAlertsPlugin requires quotePlugin() from @mdxeditor/editor.')
    }
  },
  init(realm) {
    realm.pubIn({
      [addActivePlugin$]: 'github-alerts',
      [addLexicalNode$]: GitHubAlertNode,
      [addImportVisitor$]: MdastGitHubAlertVisitor,
      [addExportVisitor$]: LexicalGitHubAlertVisitor,
      [addToMarkdownExtension$]: githubAlertsToMarkdown,
      [addMdastExtension$]: githubAlertsFromMarkdown
    })
    realm.pub(createActiveEditorSubscription$, (editor) =>
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          if (!editor.isEditable()) return false
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false
          const paragraph = selection.anchor.getNode()
          if (!$isParagraphNode(paragraph) || !paragraph.isEmpty()) return false
          const alert = paragraph.getParent()
          if (!$isGitHubAlertNode(alert) || paragraph.getNextSibling() !== null) return false
          const after = $createParagraphNode()
          alert.insertAfter(after)
          paragraph.remove()
          if (alert.isEmpty()) alert.remove()
          after.selectStart()
          return true
        },
        COMMAND_PRIORITY_LOW
      )
    )
    realm.register(currentGitHubAlertType$)
    realm.register(applyGitHubAlertType$)
  }
})

// Standalone Markdown tooling may reuse the same parser/serializer extensions.
export { githubAlertsFromMarkdown } from './syntax.js'
export { githubAlertsToMarkdown } from './visitors.js'
export type { GitHubAlert } from './markdown.js'
