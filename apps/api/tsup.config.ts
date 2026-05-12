import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  clean: true,
  // Bundle ALL dependencies into dist/index.js so the zip is self-contained.
  // @azure/functions must remain external — the Functions worker intercepts
  // require('@azure/functions') to inject its gRPC channel at runtime.
  // The negative lookahead regex matches everything except @azure/functions*.
  noExternal: [/^(?!@azure\/functions).*/],
  external: ['@azure/functions', '@azure/functions-core'],
})
