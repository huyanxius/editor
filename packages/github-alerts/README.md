# GitHub alerts for MDXEditor

A standalone, public-API-only plugin for native GitHub alert Markdown:

```md
> [!NOTE]
> A **formatted** message.
```

Supports `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`. Alert bodies are editable in the normal editor and share its undo/redo history. Lists and block conversion remain inside the alert container instead of discarding its marker.

## Status and compatibility

The provisional package name is **`mdx-editor-github-alerts`**. This is an unpublished development package (`private: true`), extracted from [MDXEditor #999](https://github.com/mdx-editor/editor/pull/999). No npm name has been reserved, repository created, or release workflow enabled. It can be built and installed from a local tarball independently of this checkout.

The compatibility baseline is **MDXEditor 4.3.4**, **Lexical 0.48.x**, and React 18/19. All Lexical packages in the consuming application must resolve to the same version. This package imports only package-root MDXEditor/Lexical APIs; it does not import MDXEditor source files, private quote visitors, or history internals.

## Build and use locally

From this directory:

```sh
npm ci
npm run build
npm pack
# In your application, install the resulting .tgz (and the required peers):
npm install /path/to/mdx-editor-github-alerts-0.0.0-development.tgz \
  @mdxeditor/editor@4.3.4 lexical@0.48.0 @lexical/utils@0.48.0
```

```tsx
import {
  MDXEditor, quotePlugin, listsPlugin, toolbarPlugin, UndoRedo, ListsToggle
} from '@mdxeditor/editor'
import { githubAlertsPlugin, GitHubAlertTypeSelect } from 'mdx-editor-github-alerts'
import '@mdxeditor/editor/style.css'
import 'mdx-editor-github-alerts/style.css'

export function Editor() {
  return <MDXEditor
    markdown={'> [!NOTE]\n> Hello **world**.'}
    plugins={[
      quotePlugin(), // Required: ordinary/unknown/escaped quotes remain ordinary quotes.
      githubAlertsPlugin(),
      listsPlugin(), // Optional: enables list content and list commands.
      toolbarPlugin({ toolbarContents: () => <>
        <UndoRedo /><GitHubAlertTypeSelect /><ListsToggle />
      </> })
    ]}
  />
}
```

`quotePlugin()` can appear before or after `githubAlertsPlugin()`. Missing it produces a clear initialization error. Add the usual MDXEditor plugins for links, headings, code blocks, tables, or other content you wish to support.

### Public API

- `githubAlertsPlugin()` registers the node, import/export visitors, syntax handling, and empty-final-paragraph Enter behavior.
- `GitHubAlertTypeSelect` inserts an alert or changes the selected alert type. Its toolbar strings use MDXEditor's `translation` callback (`toolbar.githubAlert`, `toolbar.githubAlertType`, and `githubAlerts.note/tip/important/warning/caution`).
- `applyGitHubAlertType$` is a Gurx signal; publish a supported uppercase type from a component using MDXEditor's `usePublisher`. It respects `readOnly` and editor editability.
- `githubAlertsFromMarkdown` and `githubAlertsToMarkdown` are reusable MDAST extensions; `GitHubAlert` is the custom export-node type for standalone Markdown tooling.
- `currentGitHubAlertType$` is a cell containing the selected type, or `''` outside an alert.
- `GitHubAlertNode`, `$createGitHubAlertNode`, `$isGitHubAlertNode`, `GITHUB_ALERT_TYPES`, and their TypeScript types are available for custom integrations. Use `$` helpers only during Lexical read/update cycles. Treat the node as a shadow-root block container, not an inline node.

The optional stylesheet uses `.mdx-github-alert` and `[data-github-alert]`. It uses MDXEditor theme variables with standalone color fallbacks and can be replaced by application CSS.

## Markdown and interoperability

- Markers must be uppercase and occupy the first line of a quote. Spaces/tabs after `]` are accepted, including Markdown's two-space hard-break form. Export normalizes markers to `> [!TYPE]` without trailing whitespace.
- Escaped brackets, character-reference brackets, unknown types, and inline marker-like text remain ordinary quotes. Markdown reference links elsewhere are not consumed.
- Export uses a dedicated `githubAlert` MDAST node/handler. It **does not replace the global `blockquote` serializer**; other extensions' ordinary-quote handlers work in either registration order.
- Alert content uses regular MDXEditor plugins, not a nested editor or manually mutated history stack. Enter in an empty final paragraph exits the alert. List Enter first follows Lexical's normal list behavior.
- This is a Markdown import/export plugin, not an automatic rich-text typing shortcut. Type markers in source Markdown and reload, or insert an alert through the toolbar.
- Nested Markdown content is preserved, but GitHub itself may not render alerts nested inside other elements as alerts.

## Development and verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:package    # Fresh packed consumers, React 18 and 19; no publishing.
npm run test:browser   # Browser UI regressions; requires Playwright Chromium.
npm run demo           # Local interactive example.
```

For an existing Chromium installation, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:browser`. Otherwise install Playwright's Chromium with `npx playwright install chromium`.

The tests exercise all five types, source reload, JSON, whitespace and reference-link parsing, quote-handler coexistence, bullet/number/check conversion and undo/redo, list removal, empty paragraph/list exit, focus, read-only behavior, and independent editors. The packed-consumer check verifies emitted exports/types and repeats integration tests without repository source aliases.

## License and provenance

MIT; see [LICENSE](./LICENSE). Original implementation was proposed in MDXEditor #999 at `dfdd0b25479c8c75e53a14e0fe27518e17a02bc8`. This extraction addresses the [maintainer's external-plugin review](https://github.com/mdx-editor/editor/pull/999#issuecomment-6445377079), without modifying MDXEditor core or claiming upstream acceptance.
