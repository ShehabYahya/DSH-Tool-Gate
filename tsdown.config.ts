import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/bin.ts',
  },
  format: ['esm'],
  dts: true,
  outDir: 'lib',
  platform: 'node',
  target: 'node22.19',
  clean: true,
})
