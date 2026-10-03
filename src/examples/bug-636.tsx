import React from 'react'
import { MDXEditor, type MDXEditorMethods } from '../MDXEditor'
import { diffSourcePlugin } from '../plugins/diff-source'
import { toolbarPlugin } from '../plugins/toolbar'
import { DiffSourceToggleWrapper } from '../plugins/toolbar/components/DiffSourceToggleWrapper'

export const SourceInsertion = () => {
  const ref = React.useRef<MDXEditorMethods>(null)
  const [markdown, setMarkdown] = React.useState('')
  return (
    <>
      <MDXEditor
        ref={ref}
        markdown="original"
        plugins={[
          diffSourcePlugin({ diffMarkdown: 'comparison baseline' }),
          toolbarPlugin({ toolbarContents: () => <DiffSourceToggleWrapper>{null}</DiffSourceToggleWrapper> })
        ]}
      />
      <button
        type="button"
        onClick={() => {
          ref.current!.insertMarkdown('INSERT')
        }}
      >
        Insert text
      </button>
      <button
        type="button"
        onClick={() => {
          ref.current!.insertMarkdown('**replacement**')
        }}
      >
        Insert formatted markdown
      </button>
      <button
        type="button"
        onClick={() => {
          setMarkdown(ref.current!.getMarkdown())
        }}
      >
        Get Markdown
      </button>
      <pre aria-label="Current markdown">{markdown}</pre>
    </>
  )
}
