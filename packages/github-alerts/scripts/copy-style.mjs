import { copyFileSync } from 'node:fs'
copyFileSync(new URL('../src/style.css', import.meta.url), new URL('../dist/style.css', import.meta.url))
