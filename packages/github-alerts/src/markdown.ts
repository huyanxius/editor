import type * as Mdast from 'mdast'
import type { GitHubAlertType } from './GitHubAlertNode.js'

/** A dedicated MDAST type avoids replacing any extension's blockquote handler. */
export interface GitHubAlert extends Omit<Mdast.Blockquote, 'type'> {
  type: 'githubAlert'
  alertType: GitHubAlertType
}

declare module 'mdast' {
  interface BlockContentMap { githubAlert: GitHubAlert }
  interface RootContentMap { githubAlert: GitHubAlert }
}

export function parseGitHubAlert(node: Mdast.Blockquote): { type: GitHubAlertType; children: Mdast.Blockquote['children'] } | null {
  const first = node.children.at(0)
  if (first?.type !== 'paragraph') return null
  const text = first.children.at(0)
  if (text?.type !== 'text' || !text.data?.githubAlertMarker) return null
  // A marker must occupy the entire first line. Do not consume unknown or inline markers.
  const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r\n|[\r\n]|$)/.exec(text.value)
  if (!match) return null
  const remainingText = text.value.slice(match[0].length)
  const paragraphChildren = [
    ...(remainingText ? [{ ...text, value: remainingText }] : []),
    ...first.children
      // Two trailing spaces produce an MDAST hard break after the marker.
      // That separator is syntax, not alert content.
      .slice(first.children[1]?.type === 'break' && !remainingText ? 2 : 1)
      .map((child, index) =>
        index === 0 && child.type === 'text' ? { ...child, value: child.value.replace(/^(?:\r\n|[\r\n])/, '') } : child
      )
      .filter((child) => child.type !== 'text' || child.value !== '')
  ]
  const children = [
    ...(paragraphChildren.length ? [{ ...first, children: paragraphChildren } as Mdast.Paragraph] : []),
    ...node.children.slice(1)
  ]
  return { type: match[1] as GitHubAlertType, children }
}
