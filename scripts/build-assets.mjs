import { build } from 'esbuild';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const sourceDirs = [
  path.resolve('assets'),
  path.resolve('entrypoints/shared'),
];
const publicAssetsDir = path.resolve('assets-built');

await rm(publicAssetsDir, { recursive: true, force: true });
await mkdir(publicAssetsDir, { recursive: true });

const tasks = [];

for (const sourceDir of sourceDirs) {
  const files = await readdir(sourceDir);

  for (const file of files) {
    if (file === '.DS_Store' || file.endsWith('.js')) {
      continue;
    }

    const source = path.join(sourceDir, file);

    if (!file.endsWith('.ts')) {
      tasks.push(cp(source, path.join(publicAssetsDir, file), { recursive: true }));
      continue;
    }

    const parsed = path.parse(file);
    tasks.push(build({
      entryPoints: [source],
      outfile: path.join(publicAssetsDir, `${parsed.name}.js`),
      bundle: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      legalComments: 'none',
      logLevel: 'silent',
      sourcemap: false,
    }));
  }
}

await Promise.all(tasks);
