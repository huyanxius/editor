import React from 'react'
import { MDXEditor, MDXEditorMethods, tablePlugin, toolbarPlugin, UndoRedo } from '../'

const adjacentTables = '| First |\n| ----- |\n| One |\n\n| Second |\n| ------ |\n| Two |'

export function TableProseEntry() {
  const ref = React.useRef<MDXEditorMethods>(null)
  const [savedMarkdown, setSavedMarkdown] = React.useState('')
  return (
    <>
      <button
        onClick={() => {
          setSavedMarkdown(ref.current!.getMarkdown())
        }}
      >
        Save Markdown
      </button>
      <MDXEditor ref={ref} markdown={adjacentTables} plugins={[tablePlugin(), toolbarPlugin({ toolbarContents: () => <UndoRedo /> })]} />
      <pre data-testid="saved-markdown">{savedMarkdown}</pre>
    </>
  )
}
