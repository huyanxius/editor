import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  MDXEditor, type MDXEditorMethods, quotePlugin, listsPlugin, toolbarPlugin,
  UndoRedo, ListsToggle, BlockTypeSelect, headingsPlugin, BoldItalicUnderlineToggles
} from '@mdxeditor/editor'
import { githubAlertsPlugin, GitHubAlertTypeSelect } from '../src/index.js'
import '@mdxeditor/editor/style.css'
import '../src/style.css'
import './style.css'

const initialMarkdown = '> [!NOTE]\n> Start here. Select this text and apply a list.\n\n> Ordinary quotes still work.\n\nA paragraph outside the alert.'

function App() {
  const editor = React.useRef<MDXEditorMethods>(null)
  const [markdown, setMarkdown] = React.useState(initialMarkdown)
  const [readOnly, setReadOnly] = React.useState(false)
  return <main>
    <h1>GitHub alerts for MDXEditor</h1>
    <p>A standalone plugin using the public MDXEditor API. Try lists, change the alert type, and undo.</p>
    <label><input type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} /> Read only</label>
    <MDXEditor ref={editor} markdown={initialMarkdown} readOnly={readOnly} onChange={setMarkdown}
      plugins={[
        quotePlugin(), githubAlertsPlugin(), listsPlugin(), headingsPlugin(),
        toolbarPlugin({ toolbarContents: () => <><UndoRedo /><GitHubAlertTypeSelect /><ListsToggle /><BlockTypeSelect /><BoldItalicUnderlineToggles /></> })
      ]} />
    <h2>Markdown round trip</h2>
    <textarea aria-label="Markdown source" value={markdown} onChange={(event) => setMarkdown(event.target.value)} spellCheck={false} />
    <button type="button" disabled={readOnly} onClick={() => editor.current?.setMarkdown(markdown)}>Load Markdown</button>
    <button type="button" onClick={() => setMarkdown(editor.current?.getMarkdown() ?? '')}>Read Markdown</button>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
