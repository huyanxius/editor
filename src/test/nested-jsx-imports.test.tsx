import { describe, expect, it } from 'vitest'
import { $getRoot, createEditor, type LexicalNode } from 'lexical'
import type * as Mdast from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import { exportLexicalTreeToMdast, type ExportLexicalTreeOptions } from '../exportMarkdownFromLexical'
import { $createDirectiveNode, DirectiveNode } from '../plugins/directives/DirectiveNode'
import { DirectiveVisitor } from '../plugins/directives/DirectiveVisitor'
import { LexicalRootVisitor } from '../plugins/core/LexicalRootVisitor'
import { $createLexicalJsxNode, LexicalJsxNode } from '../plugins/jsx/LexicalJsxNode'
import { LexicalJsxVisitor } from '../plugins/jsx/LexicalJsxVisitor'
import type { JsxComponentDescriptor } from '../plugins/jsx'
import { $createTableNode, TableNode } from '../plugins/table/TableNode'
import { LexicalTableVisitor } from '../plugins/table/LexicalTableVisitor'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown } from 'mdast-util-mdx'
import { mdxjs } from 'micromark-extension-mdxjs'

function jsx(name: string | null, children: Mdast.BlockContent[] = []): MdxJsxFlowElement {
  return { type: 'mdxJsxFlowElement', name, attributes: [], children }
}

function descriptor(name: string, source?: string, defaultExport = false): JsxComponentDescriptor {
  return { name, kind: 'flow', source, defaultExport, props: [], hasChildren: false, Editor: () => null }
}

function admonition(children: Mdast.RootContent[]) {
  return $createDirectiveNode({
    type: 'containerDirective',
    name: 'tip',
    attributes: {},
    children: children as ContainerDirective['children']
  })
}

function exportNodes(createNodes: () => LexicalNode[], descriptors: JsxComponentDescriptor[], addImportStatements = true) {
  const editor = createEditor({
    nodes: [DirectiveNode, LexicalJsxNode, TableNode],
    onError: (error) => {
      throw error
    }
  })
  let result!: Mdast.Root
  editor.update(
    () => {
      const root = $getRoot()
      root.append(...createNodes())
      result = exportLexicalTreeToMdast({
        root,
        visitors: [
          LexicalRootVisitor,
          DirectiveVisitor,
          LexicalJsxVisitor,
          LexicalTableVisitor
        ] as unknown as ExportLexicalTreeOptions['visitors'],
        jsxComponentDescriptors: descriptors,
        jsxIsAvailable: true,
        addImportStatements
      })
    },
    { discrete: true }
  )
  return result
}

function importValues(root: Mdast.Root) {
  return root.children.filter((node) => node.type === 'mdxjsEsm').map((node) => node.value)
}

function parsedMdx(markdown: string) {
  return fromMarkdown(markdown, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] }).children
}

describe('imports from nested MDAST subtrees', () => {
  it('does not import intrinsic images from a stored directive with a source-backed wildcard', () => {
    const result = exportNodes(() => [admonition([jsx('img')])], [descriptor('*', '@components')])
    expect(importValues(result)).toEqual([])
  })

  it('does not import intrinsic images from a stored table cell with a source-backed wildcard', () => {
    const result = exportNodes(
      () => [
        $createTableNode({
          type: 'table',
          children: [
            { type: 'tableRow', children: [{ type: 'tableCell', children: [{ ...jsx('img'), type: 'mdxJsxTextElement', children: [] }] }] }
          ]
        })
      ],
      [descriptor('*', '@components')]
    )
    expect(importValues(result)).toEqual([])
  })

  it.each([
    ['exact', [descriptor('Existing', '@descriptor', true)]],
    ['wildcard', [descriptor('*', '@fallback')]]
  ] as const)('does not regenerate a preserved nested import with a source-backed %s descriptor', (_kind, descriptors) => {
    const children = parsedMdx("import Existing from '@existing'\n\n<Existing />")
    const result = exportNodes(() => [admonition(children)], [...descriptors])
    expect(importValues(result)).toEqual([])
    expect(result.children[0]).toMatchObject({ type: 'containerDirective', children })
  })

  it('deduplicates imports reconstructed by a nested editor without ESTree metadata', () => {
    const existingImport = { type: 'mdxjsEsm' as const, value: "import Existing from '@existing'" }
    const result = exportNodes(() => [admonition([existingImport, jsx('Existing')])], [descriptor('*', '@fallback')])
    expect(importValues(result)).toEqual([])
    expect(result.children[0]).toMatchObject({ children: [existingImport, jsx('Existing')] })
  })

  it('uses local bindings from named aliases and namespace imports without rewriting their declarations', () => {
    const children = parsedMdx(
      "import { Original as Existing } from '@existing'\nimport * as UI from '@ui'\n\n<Existing />\n\n<UI.Badge />"
    )
    const result = exportNodes(() => [admonition(children)], [descriptor('*', '@fallback')])
    expect(importValues(result)).toEqual([])
    expect(result.children[0]).toMatchObject({ children })
  })

  it('deduplicates a root reference against a preserved nested module binding', () => {
    const children = parsedMdx("import Existing from '@existing'\n\n<Existing />")
    const result = exportNodes(
      () => [$createLexicalJsxNode(jsx('Existing')), admonition(children)],
      [descriptor('Existing', '@descriptor', true)]
    )
    expect(importValues(result)).toEqual([])
    expect(result.children[1]).toMatchObject({ children })
  })

  it('keeps generating imports for unrelated components beside preserved ESM and intrinsic images', () => {
    const children = [...parsedMdx("import Existing from '@existing'\n\n<Existing />"), jsx('img'), jsx('Fresh'), jsx('Img')]
    const result = exportNodes(() => [admonition(children)], [descriptor('*', '@fallback')])
    expect(importValues(result)).toEqual(["import { Fresh, Img } from '@fallback'"])
  })

  it('does not treat side-effect imports or export declarations as imported component bindings', () => {
    const children = [...parsedMdx("import '@side-effect'\nexport const Fresh = 1"), jsx('Fresh')]
    const result = exportNodes(() => [admonition(children)], [descriptor('Fresh', '@fresh')])
    expect(importValues(result)).toEqual(["import { Fresh } from '@fresh'"])
  })

  it('keeps programmatically supplied invalid ESM unchanged instead of introducing export validation', () => {
    const invalidEsm = { type: 'mdxjsEsm' as const, value: 'import not valid MDX' }
    const result = exportNodes(() => [admonition([invalidEsm])], [])
    expect(result.children[0]).toMatchObject({ children: [invalidEsm] })
  })

  it('imports a default JSX component inside an admonition at the document root', () => {
    const result = exportNodes(() => [admonition([jsx('Zazz')])], [descriptor('Zazz', '@zazz', true)])
    expect(importValues(result)).toEqual(["import Zazz from '@zazz'"])
  })

  it('groups named imports and keeps default imports separate', () => {
    const result = exportNodes(
      () => [admonition([jsx('First'), jsx('Second'), jsx('Default')])],
      [descriptor('First', '@components'), descriptor('Second', '@components'), descriptor('Default', '@default', true)]
    )
    expect(importValues(result)).toEqual(["import { First, Second } from '@components'", "import Default from '@default'"])
  })

  it('deduplicates references shared by the root and multiple nested editors', () => {
    const result = exportNodes(
      () => [$createLexicalJsxNode(jsx('Zazz')), admonition([jsx('Zazz'), jsx('Zazz')]), admonition([jsx('Zazz')])],
      [descriptor('Zazz', '@zazz', true)]
    )
    expect(importValues(result)).toEqual(["import Zazz from '@zazz'"])
  })

  it('finds JSX references inside table cells', () => {
    const result = exportNodes(
      () => [
        $createTableNode({
          type: 'table',
          children: [
            {
              type: 'tableRow',
              children: [{ type: 'tableCell', children: [{ ...jsx('Badge'), type: 'mdxJsxTextElement', children: [] }] }]
            }
          ]
        })
      ],
      [descriptor('Badge', '@components')]
    )
    expect(importValues(result)).toEqual(["import { Badge } from '@components'"])
  })

  it('does not import HTML elements or fragments, but visits their component children', () => {
    const result = exportNodes(() => [admonition([jsx(null, [jsx('span', [jsx('Section')])])])], [descriptor('*', '@components')])
    expect(importValues(result)).toEqual(["import { Section } from '@components'"])
  })

  it('does not invent imports for unknown components', () => {
    const result = exportNodes(() => [admonition([jsx('Unknown')])], [])
    expect(importValues(result)).toEqual([])
  })

  it('uses wildcard descriptor sources only when there is no exact descriptor', () => {
    const result = exportNodes(
      () => [admonition([jsx('Exact'), jsx('Fallback'), jsx('NoImport')])],
      [descriptor('*', '@fallback'), descriptor('Exact', '@exact', true), descriptor('NoImport')]
    )
    expect(importValues(result)).toEqual(["import { Fallback } from '@fallback'", "import Exact from '@exact'"])
  })

  it('does not add imports for a source-less wildcard descriptor', () => {
    const result = exportNodes(() => [admonition([jsx('Unknown')])], [descriptor('*')])
    expect(importValues(result)).toEqual([])
  })

  it('keeps existing nested imports in place, as required by #734', () => {
    const existingImport = { type: 'mdxjsEsm' as const, value: "import Existing from '@existing'" }
    const result = exportNodes(
      () => [admonition([existingImport, jsx('Existing'), jsx('Zazz')])],
      [descriptor('*'), descriptor('Zazz', '@zazz', true)]
    )
    expect(importValues(result)).toEqual(["import Zazz from '@zazz'"])
    expect(result.children[1]).toMatchObject({ type: 'containerDirective', children: [existingImport, jsx('Existing'), jsx('Zazz')] })
  })

  it('does not generate fresh imports during a nested-editor export', () => {
    const result = exportNodes(() => [admonition([jsx('Zazz')])], [descriptor('Zazz', '@zazz', true)], false)
    expect(importValues(result)).toEqual([])
  })

  it('preserves the original JSX import source when nested export suppresses new imports', () => {
    const result = exportNodes(
      () => [$createLexicalJsxNode(jsx('Existing'), { source: '@existing', defaultExport: true })],
      [descriptor('*')],
      false
    )
    expect(importValues(result)).toEqual(["import Existing from '@existing'"])
  })
})
