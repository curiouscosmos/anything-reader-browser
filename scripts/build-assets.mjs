import { build } from 'esbuild';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const assetsDir = path.resolve('assets');
const publicAssetsDir = path.resolve('assets-built');
const files = await readdir(assetsDir);

await rm(publicAssetsDir, { recursive: true, force: true });
await mkdir(publicAssetsDir, { recursive: true });

await Promise.all(
  files.map(async (file) => {
    if (file === '.DS_Store' || file.endsWith('.js')) {
      return;
    }

    const source = path.join(assetsDir, file);

    if (!file.endsWith('.ts')) {
      await cp(source, path.join(publicAssetsDir, file), { recursive: true });
      return;
    }

    const parsed = path.parse(file);
    return build({
      entryPoints: [source],
      outfile: path.join(publicAssetsDir, `${parsed.name}.js`),
      bundle: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      legalComments: 'none',
      logLevel: 'silent',
      sourcemap: false,
    });
  }),
);
