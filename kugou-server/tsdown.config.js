import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: false,
  entry: {
    app: './index.js',
    'util/*': './util/*',
    'module/*': './module/*.js'
  },
  outDir: './bin/api_js/',
  fixedExtension: false,
  format: 'cjs',
  platform: 'node',
  target: 'node14',
  minify: true
});