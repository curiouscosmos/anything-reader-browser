import { isFirefoxRuntime } from '@/lib/browser-flavor.ts';

export type OrtWasmPaths = string | { mjs: string; wasm: string };

export function getKittenOrtWasmPaths(chromeRoot: string, firefoxPaths: { mjs: string; wasm: string }): OrtWasmPaths {
  return isFirefoxRuntime() ? firefoxPaths : chromeRoot;
}
