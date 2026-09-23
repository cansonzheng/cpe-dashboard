import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build as rolldownBuild } from 'rolldown'
import { build as viteBuild } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'dist')
const publicDir = path.join(outputDir, 'public')
const serverDir = path.join(outputDir, 'server')

await rm(outputDir, { recursive: true, force: true })
await mkdir(serverDir, { recursive: true })

console.log('Building Vue PWA with Vite 8 + Rolldown...')
await viteBuild({
  root,
  configFile: path.join(root, 'vite.config.js'),
  build: {
    outDir: publicDir,
    emptyOutDir: true,
  },
})

console.log('Bundling the Koa server with Rolldown...')
await rolldownBuild({
  input: path.join(root, 'server/index.js'),
  platform: 'node',
  external: [/^node:/],
  output: {
    file: path.join(serverDir, 'index.mjs'),
    format: 'esm',
    sourcemap: false,
  },
})

console.log(`Distribution created at ${outputDir}`)
