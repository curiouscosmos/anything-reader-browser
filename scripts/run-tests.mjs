import { build } from 'esbuild';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const testRoot = path.resolve('tests');
const buildRoot = path.resolve('.test-build');

await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildRoot, { recursive: true });

const testFiles = await collectTestFiles(testRoot);
if (testFiles.length === 0) {
  console.log('No test files found.');
  process.exit(0);
}

const builtFiles = [];
for (const file of testFiles) {
  const relative = path.relative(testRoot, file);
  const outfile = path.join(buildRoot, relative).replace(/\.[^.]+$/, '.mjs');
  await mkdir(path.dirname(outfile), { recursive: true });
  await build({
    entryPoints: [file],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: ['esbuild', 'jsdom'],
    legalComments: 'none',
    logLevel: 'silent',
    sourcemap: false,
    plugins: [mockOnnxRuntimePlugin()],
  });
  builtFiles.push(outfile);
}

await runNodeTests(builtFiles);

async function collectTestFiles(root) {
  const files = [];
  await walk(root, files);
  return files.filter((file) => file.endsWith('.test.ts') || file.endsWith('.spec.ts'));
}

async function walk(dir, files) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
}

async function runNodeTests(files) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', ...files], {
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Tests failed with exit code ${code}`));
    });

    child.on('error', reject);
  });
}

function mockOnnxRuntimePlugin() {
  const namespace = 'mock-onnxruntime-web';

  return {
    name: 'mock-onnxruntime-web',
    setup(build) {
      build.onResolve({ filter: /^onnxruntime-web$/ }, () => ({
        path: 'onnxruntime-web',
        namespace,
      }));

      build.onLoad({ filter: /.*/, namespace }, () => ({
        contents: `
          export const env = { logLevel: 'error', wasm: { logLevel: 'error', wasmPaths: '', numThreads: 1, proxy: false } };
          export class Tensor {
            constructor(type, data, dims) {
              this.type = type;
              this.data = data;
              this.dims = dims;
            }
          }
          export class InferenceSession {
            static async create() {
              throw new Error('InferenceSession.create is not available in tests');
            }
          }
        `,
        loader: 'js',
      }));
    },
  };
}
