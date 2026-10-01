const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function harness(picker) {
  let pickerCalls = 0, downloads = 0;
  global.window = picker ? { showDirectoryPicker: async function (options) {
    pickerCalls++;
    return picker(options);
  } } : {};
  global.document = {
    body: { appendChild() {} },
    createElement: () => ({ click() { downloads++; }, remove() {} }),
  };
  const source = process.env.REGRESSION_REF
    ? execFileSync('git', ['show', `${process.env.REGRESSION_REF}:src/export/exportAll.ts`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, 'src/export/exportAll.ts'), 'utf8');
  const blob = new Blob(['image-data']);
  class Zip { file() {} async generateAsync() { return new Blob(['zip-data']); } }
  const deps = {
    jszip: Zip,
    '../assets/assetStore': { useAssetStore: { getState: () => ({ assets: {} }) } },
    '../layers/layerStore': { useEditorStore: { getState: () => ({ canvas: {}, layers: [], selectedIds: [] }) } },
    '../layers/layerUtils': { validSelection: () => [] },
    './exportPNG': { canvasToBlob: async () => blob, rasterizeComposite: () => ({}) },
    './naming': { compositeName: () => 'composite.png' },
    '../vector/svgSafety': {}, '../vector/svgBoolean': {},
  };
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  const originalTimeout = global.setTimeout;
  // URL cleanup is synchronous in this adapter; no five-second test timer.
  global.setTimeout = fn => { fn(); return 0; };
  new Function('require', 'module', 'exports', js)(name => {
    if (!(name in deps)) throw new Error(`Unexpected dependency: ${name}`);
    return deps[name];
  }, module, module.exports);
  return {
    export: destination => module.exports.exportLayers('composite', 1, 'png', undefined, destination),
    counts: () => ({ pickerCalls, downloads }),
    dispose: () => { global.setTimeout = originalTimeout; },
  };
}

async function main() {
  const cases = [
    ['explicit ZIP never opens a restricted folder picker', async () => {
      const h = harness(() => { throw new DOMException('Restricted directory', 'AbortError'); });
      try { assert.equal(await h.export('zip'), 'zip'); assert.deepEqual(h.counts(), { pickerCalls: 0, downloads: 1 }); }
      finally { h.dispose(); }
    }],
    ['composite cancellation is not reported as folder success', async () => {
      const h = harness(() => { throw new DOMException('Cancelled', 'AbortError'); });
      try { assert.equal(await h.export('folder'), 'cancelled'); assert.equal(h.counts().downloads, 0); }
      finally { h.dispose(); }
    }],
    ['unavailable folder API reports ZIP destination', async () => {
      const h = harness();
      try { assert.equal(await h.export('folder'), 'zip'); assert.equal(h.counts().downloads, 1); }
      finally { h.dispose(); }
    }],
    ['folder write is awaited and reports folder destination', async () => {
      let writes = 0, closes = 0;
      const h = harness(async () => ({ getFileHandle: async () => ({ createWritable: async () => ({
        write: async data => { assert(data instanceof Blob); writes++; }, close: async () => { closes++; },
      }) }) }));
      try { assert.equal(await h.export('folder'), 'folder'); assert.equal(writes, 1); assert.equal(closes, 1); }
      finally { h.dispose(); }
    }],
  ];
  let failed = 0;
  for (const [name, run] of cases) {
    try { await run(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
  }
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
