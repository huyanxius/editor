import { describe, expect, it } from 'vitest'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { BlockContent, ListItem, Root } from 'mdast'
import { githubAlertsFromMarkdown, githubAlertsToMarkdown, type GitHubAlert } from '../src/index'

const paragraph = (value: string) => ({ type: 'paragraph' as const, children: [{ type: 'text' as const, value }] })
const alert = (value: string, alertType: GitHubAlert['alertType'] = 'NOTE'): GitHubAlert => ({ type: 'githubAlert', alertType, children: [paragraph(value)] })
function roundTrip(children: ListItem['children']) {
  const tree: Root = { type: 'root', children: [{ type: 'list', ordered: false, spread: false, children: [{ type: 'listItem', spread: false, children }] }] }
  const markdown = toMarkdown(tree, { extensions: [githubAlertsToMarkdown] })
  const parsed = fromMarkdown(markdown, { mdastExtensions: [githubAlertsFromMarkdown] })
  const list = parsed.children[0]
  if (list.type !== 'list') throw new Error('Expected a list')
  return { children: list.children[0].children, markdown, parsed }
}

describe('custom alert MDAST list boundaries', () => {
  it('does not swallow a following tight-list paragraph into the alert', () => {
    const result = roundTrip([alert('Inside'), paragraph('Outside alert but inside list')])
    expect(result.children.map((node) => node.type)).toEqual(['githubAlert', 'paragraph'])
    expect(result.children[0]).toMatchObject({ children: [paragraph('Inside')] })
    expect(result.children[1]).toMatchObject(paragraph('Outside alert but inside list'))
    expect(toMarkdown(result.parsed, { extensions: [githubAlertsToMarkdown] })).toBe(result.markdown)
  })
  it.each([
    ['alert', alert('Second', 'TIP')],
    ['quote', { type: 'blockquote', children: [paragraph('Second')] } as BlockContent]
  ] as const)('keeps an adjacent %s as a separate container', (_label, second) => {
    const result = roundTrip([alert('First'), second])
    expect(result.children.map((node) => node.type)).toEqual(['githubAlert', second.type])
    expect(result.children[0]).toMatchObject({ children: [paragraph('First')] })
    expect(result.children[1]).toMatchObject({ children: [paragraph('Second')] })
  })
  it('preserves a paragraph following a nested list ending in an alert', () => {
    const inner: BlockContent = { type: 'list', ordered: false, spread: false, children: [{ type: 'listItem', spread: false, children: [alert('Deep')] }] }
    const result = roundTrip([inner, paragraph('Outside nested list')])
    expect(result.children.map((node) => node.type)).toEqual(['list', 'paragraph'])
    expect(result.children[1]).toMatchObject(paragraph('Outside nested list'))
  })
})


it('does not override the default separator between a top-level list and indented code', () => {
  const tree: Root = { type: 'root', children: [
    { type: 'list', ordered: false, spread: false, children: [{ type: 'listItem', spread: false, children: [alert('Inside')] }] },
    { type: 'code', value: 'outside code' }
  ] }
  const markdown = toMarkdown(tree, { extensions: [githubAlertsToMarkdown], fences: false })
  expect(markdown).toContain('<!---->')
  const parsed = fromMarkdown(markdown, { mdastExtensions: [githubAlertsFromMarkdown] })
  expect(parsed.children.at(-1)).toMatchObject({ type: 'code', value: 'outside code' })
})
