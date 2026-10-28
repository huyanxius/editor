import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'mdx-alerts-consumer-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(args, cwd = root, options = {}) {
  return execFileSync(npm, args, { cwd, stdio: 'inherit', ...options })
}
try {
  run(['run', 'build'])
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})])
  for (const file of readdirSync(join(root, 'dist')).filter((name) => /\.(?:d\.ts|js)$/.test(name))) {
    const content = readFileSync(join(root, 'dist', file), 'utf8')
    for (const match of content.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1]
      if (specifier.startsWith('.')) continue
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
      assert(declared.has(name) || declared.has(`@types/${name}`), `${file} imports undeclared dependency ${specifier}`)
      assert(!specifier.startsWith('@mdxeditor/editor/'), `${file} imports a non-root MDXEditor API: ${specifier}`)
    }
  }
  const pack = JSON.parse(run(['pack', '--json', '--pack-destination', temp], root, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }))[0]
  assert(pack.files.some((file) => file.path === 'dist/index.js'))
  assert(pack.files.some((file) => file.path === 'dist/index.d.ts'))
  assert(pack.files.some((file) => file.path === 'dist/style.css'))
  assert(pack.files.every((file) => !file.path.startsWith('node_modules/')))
  for (const [version, parserVersion] of [['18.3.1', '2.0.0'], ['19.2.1', '2.1.0']]) {
    const cwd = join(temp, `react-${version}`)
    mkdirSync(cwd)
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({
      name: 'isolated-alerts-consumer', private: true, type: 'module',
      dependencies: {
        'mdx-editor-github-alerts': `file:${join(temp, pack.filename)}`,
        '@mdxeditor/editor': '4.3.4', '@lexical/list': '0.48.0', '@lexical/utils': '0.48.0', lexical: '0.48.0',
        react: version, 'react-dom': version,
        'mdast-util-from-markdown': parserVersion, 'mdast-util-to-markdown': '^2.1.3'
      },
      overrides: { 'mdast-util-from-markdown': parserVersion },
      devDependencies: {
        '@testing-library/react': '16.3.0', '@testing-library/jest-dom': '^6.9.1',
        '@types/node': '^22.0.0',
        '@types/react': version.startsWith('18.') ? '^18.3.0' : '^19.0.0',
        '@types/react-dom': version.startsWith('18.') ? '^18.3.0' : '^19.0.0',
        typescript: '^5.9.3', vitest: '1.6.1', vite: '^5.4.21', jsdom: '23.2.0'
      }
    }))
    run(['install', '--no-audit', '--no-fund'], cwd)
    // These imports resolve to the packed package, not its checkout or an alias.
    for (const file of readdirSync(join(root, 'test')).filter((name) => /\.test\.tsx?$/.test(name))) {
      const tests = readFileSync(join(root, 'test', file), 'utf8')
        .replace(/(['"])\.\.\/src\/(?:index|syntax)(?:\.js)?\1/g, "'mdx-editor-github-alerts'")
      writeFileSync(join(cwd, file), tests)
    }
    cpSync(join(root, 'test/setup.ts'), join(cwd, 'setup.ts'))
    writeFileSync(join(cwd, 'vite.config.ts'), `import { defineConfig } from 'vitest/config'; export default defineConfig({ css: { postcss: { plugins: [] } }, test: { environment: 'jsdom', setupFiles: ['setup.ts'], pool: 'forks', poolOptions: { forks: { singleFork: true } } } })`)
    writeFileSync(join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
      target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable', 'ESNext.Disposable'], module: 'ESNext', moduleResolution: 'Bundler',
      jsx: 'react-jsx', strict: true, skipLibCheck: false, esModuleInterop: true,
      types: ['node', '@testing-library/jest-dom/vitest']
    }, include: ['*.test.tsx', '*.test.ts', 'setup.ts'] }))
    run(['exec', '--', 'tsc', '--noEmit'], cwd)
    run(['exec', '--', 'vitest', 'run', '--reporter=dot'], cwd)
    for (const [dependency, expected] of [['lexical', '0.48.0'], ['mdast-util-from-markdown', parserVersion]]) {
      const graph = JSON.parse(run(['ls', dependency, '--all', '--json'], cwd, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }))
      const versions = new Set()
      function visit(node) {
        for (const [name, child] of Object.entries(node.dependencies ?? {})) {
          if (name === dependency) versions.add(child.version)
          visit(child)
        }
      }
      visit(graph)
      assert.deepEqual([...versions], [expected], `Unexpected ${dependency} graph`)
    }
    console.log(`Packed consumer passed: React ${version}, MDXEditor 4.3.4, parser ${parserVersion}, Lexical 0.48.0`)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}
