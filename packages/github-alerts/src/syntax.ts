import type { Extension as MdastExtension } from 'mdast-util-from-markdown'
import type { Paragraph } from 'mdast'
import type { GitHubAlertType } from './GitHubAlertNode.js'
import { parseGitHubAlert, type GitHubAlert } from './markdown.js'

// Use stable 2.0 compiler hooks, not the listeners introduced in 2.1. Capture
// spelling in the paragraph tokenizer (whole blockQuote tokens may belong to a
// different chunk stream). Leave paragraph exit to GFM task-list extensions.
export const githubAlertsFromMarkdown: MdastExtension = {
  enter: {
    paragraph(token) {
      const parent = this.stack[this.stack.length - 1]
      const paragraph: Paragraph = { type: 'paragraph', children: [] }
      if (parent.type === 'blockquote' && parent.children.length === 0) {
        const marker = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r\n|[\r\n]|$)/.exec(this.sliceSerialize(token))
        if (marker) paragraph.data = { githubAlertMarkerType: marker[1] as GitHubAlertType }
      }
      this.enter(paragraph, token)
    }
  },
  exit: {
    blockQuote(token) {
      const node = this.stack[this.stack.length - 1]
      if (node.type === 'blockquote') {
        const paragraph = node.children[0]
        if (paragraph?.type === 'paragraph' && paragraph.data?.githubAlertMarkerType) {
          const first = paragraph.children[0]
          if (first?.type === 'text') {
            first.data = { ...first.data, githubAlertMarker: true }
          } else if (first?.type === 'linkReference' && first.referenceType === 'shortcut') {
            // A reference definition must not consume a genuine first-line marker.
            paragraph.children[0] = {
              type: 'text', value: `[!${paragraph.data.githubAlertMarkerType}]`,
              data: { githubAlertMarker: true }, position: first.position
            }
          }
        }
        const alert = parseGitHubAlert(node)
        if (alert) {
          // Nested decorators retain/export MDAST before their Lexical content is
          // edited, so the source AST and the Lexical export must use the same type.
          const normalized: GitHubAlert = { ...node, type: 'githubAlert', alertType: alert.type, children: alert.children }
          Object.assign(node, normalized)
        }
      }
      this.exit(token)
    }
  }
}

declare module 'mdast' {
  interface ParagraphData {
    githubAlertMarkerType?: GitHubAlertType
  }
  interface TextData {
    githubAlertMarker?: boolean
  }
}
