import { $createParagraphNode, type ElementNode } from 'lexical'
import type * as Mdast from 'mdast'
import { defaultHandlers, type Options } from 'mdast-util-to-markdown'
import type { MdastImportVisitor } from '@mdxeditor/editor'
import type { LexicalExportVisitor } from '@mdxeditor/editor'
import type { GitHubAlert } from './markdown.js'
import { $createGitHubAlertNode, $isGitHubAlertNode, type GitHubAlertNode } from './GitHubAlertNode.js'

export const MdastGitHubAlertVisitor: MdastImportVisitor<GitHubAlert> = {
  testNode: 'githubAlert',
  visitNode({ mdastNode, lexicalParent, actions }) {
    const node = $createGitHubAlertNode(mdastNode.alertType)
    ;(lexicalParent as ElementNode).append(node)
    actions.visitChildren(mdastNode, node)
    if (node.isEmpty()) node.append($createParagraphNode())
  }
}

export const LexicalGitHubAlertVisitor: LexicalExportVisitor<GitHubAlertNode, GitHubAlert> = {
  testLexicalNode: $isGitHubAlertNode,
  visitLexicalNode({ actions, lexicalNode }) {
    actions.addAndStepInto('githubAlert', { alertType: lexicalNode.getAlertType() })
  }
}

export const githubAlertsToMarkdown: Options = {
  join: [(left, right, parent) => {
    if (!('spread' in parent) || parent.spread !== false) return undefined
    // The default joiner only knows built-in blockquote nodes. Without a blank
    // line, a following tight-list paragraph becomes the alert's lazy continuation.
    let tail = left
    while ((tail.type === 'list' || tail.type === 'listItem' || tail.type === 'blockquote') && tail.children.length) {
      tail = tail.children[tail.children.length - 1]
    }
    if (left.type === 'githubAlert' || right.type === 'githubAlert' || tail.type === 'githubAlert') return 1
    return undefined
  }],
  handlers: {
    githubAlert(node: GitHubAlert, parent, state, info) {
      // Use the standard quote serializer only for our own node. Ordinary quotes
      // still use whichever blockquote handler the consumer has registered.
      const quote: Mdast.Blockquote = { type: 'blockquote', children: node.children }
      const body = defaultHandlers.blockquote(quote, parent, state, info)
      return `> [!${node.alertType}]${body ? `\n${body}` : ''}`
    }
  }
}
