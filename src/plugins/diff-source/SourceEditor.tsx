import { isolateHistory } from '@codemirror/commands'
import { markdown as markdownLanguageSupport } from '@codemirror/lang-markdown'
import { EditorState, Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { basicLight } from 'cm6-theme-basic-light'
import { basicSetup } from 'codemirror'
import React from 'react'
import { cmExtensions$ } from '.'
import { insertMarkdown$, markdown$, markdownSourceEditorValue$, onBlur$, readOnly$, viewMode$ } from '../core'
import { useCellValues, usePublisher, useRealm } from '@mdxeditor/gurx'

export const COMMON_STATE_CONFIG_EXTENSIONS: Extension[] = [
  basicSetup,
  basicLight,
  markdownLanguageSupport(),
  lineNumbers(),
  EditorView.lineWrapping
]

export const SourceEditor = () => {
  const realm = useRealm()
  const [markdown, readOnly, cmExtensions] = useCellValues(markdown$, readOnly$, cmExtensions$)
  const updateMarkdown = usePublisher(markdownSourceEditorValue$)
  const triggerOnBlur = usePublisher(onBlur$)
  const editorViewRef = React.useRef<EditorView | null>(null)

  React.useEffect(() => {
    return realm.sub(insertMarkdown$, (markdownToInsert) => {
      const view = editorViewRef.current
      if (view && realm.getValue(viewMode$) === 'source') {
        view.dispatch(view.state.replaceSelection(markdownToInsert), {
          annotations: isolateHistory.of('full'),
          userEvent: 'input.paste'
        })
      }
    })
  }, [realm])

  const ref = React.useCallback(
    (el: HTMLDivElement | null) => {
      if (el !== null) {
        const extensions = [
          // custom extensions should come first so that you can override the default extensions
          ...cmExtensions,
          ...COMMON_STATE_CONFIG_EXTENSIONS,
          EditorView.updateListener.of(({ state }) => {
            updateMarkdown(state.doc.toString())
          }),
          EditorView.focusChangeEffect.of((_, focused) => {
            if (!focused) {
              triggerOnBlur(new FocusEvent('blur'))
            }
            return null
          })
        ]
        if (readOnly) {
          extensions.push(EditorState.readOnly.of(true))
        }
        el.innerHTML = ''
        editorViewRef.current = new EditorView({
          parent: el,
          state: EditorState.create({ doc: markdown, extensions })
        })
      } else {
        editorViewRef.current?.destroy()
        editorViewRef.current = null
      }
    },
    [markdown, readOnly, updateMarkdown, cmExtensions, triggerOnBlur]
  )

  return <div ref={ref} className="cm-sourceView mdxeditor-source-editor" />
}
