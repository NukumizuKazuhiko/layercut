const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/project/projectTypes.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
// projectTypes reaches for the shared hex validator; transpile it for real.
const colorJs = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '..', 'src/utils/color.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText;
const colorUtils = {};
new Function('require', 'exports', colorJs)(() => {}, colorUtils);
const projectTypes = {};
new Function('require', 'exports', 'fetch', js)(
  name => {
    if (name === '../utils/color') return colorUtils;
    throw new Error('unexpected module import');
  },
  projectTypes,
  () => { throw new Error('CSP blocked fetch(blob:)'); },
);

(async () => {
  const bytes = fs.readFileSync(path.join(__dirname, '..', 'fixtures/red_disc.png'));
  const sourceBlob = new Blob([bytes], { type: 'image/png' });
  const layer = {
    id: 'test-layer', name: 'test', type: 'png', assetId: 'test-asset',
    visible: true, locked: false, aspectLocked: false, occludesWhenHidden: false, opacity: 1,
    transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
  };
  const asset = {
    id: 'test-asset', kind: 'png', fileName: 'red_disc.png', mimeType: 'image/png',
    naturalWidth: 400, naturalHeight: 400, bitmap: null,
    previewUrl: 'blob:http://tauri.localhost/unavailable', sourceBlob,
  };
  const project = await projectTypes.serializeProject(
    'test', { width: 100, height: 100, background: 'transparent' },
    [layer], { 'test-asset': asset },
  );
  assert.equal(project.assets['test-asset'].data, `data:image/png;base64,${bytes.toString('base64')}`);
  const decoded = projectTypes.embeddedAssetBlob(project.assets['test-asset'].data, 'image/png');
  assert.deepEqual(Buffer.from(await decoded.arrayBuffer()), bytes);
  console.log('PASS project saves and reads original PNG bytes without fetch(blob:/data:)');
})().catch((error) => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
