---
title: Tables
slug: tables
position: 0.5
---

# Tables

The table plugin enables the usage of [GFM markdown tables](https://github.github.com/gfm/#tables-extension-).

```tsx
const markdown = `
| foo | bar |
| --- | --- |
| baz | bim |
`
//...
<MDXEditor
  markdown={markdown}
  plugins={[
    tablePlugin(),
    toolbarPlugin({toolbarContents: () => <InsertTable />})
  ]
  }
/>
```

## The table editor

The table editor allows the user to insert and remove rows and columns and to change the alignment of the columns. Each cell can include markdown content like formatting, links, images, etc.

Note: HTML tables are not supported.

### Reordering rows and columns

Open a row menu to move a body row up or down, or a column menu to move a column left or right. Columns move with their headers and alignment; the first row remains the GFM header and cannot be moved into the table body. Controls at a table boundary are disabled.

The menu buttons are keyboard accessible. After a move, focus follows the active cell, including its formatted content and empty cells. Each move can be undone or redone as a single operation. Reordering controls are not shown in read-only mode.
