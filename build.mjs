import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('.', import.meta.url));
const out = path.join(root, 'dist');
rmSync(out, {recursive: true, force: true}); mkdirSync(out, {recursive: true});
const inputs = new Set();
for (const entry of ['tree', 'pgn', 'contracts']) {
  const result = await build({entryPoints: [path.join(root, 'src', `${entry}.ts`)], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', external: ['chess.js'], outfile: path.join(out, `${entry}.js`), metafile: true, logLevel: 'silent'});
  for (const input of Object.keys(result.metafile.inputs)) inputs.add(path.relative(root, path.resolve(input)));
}
const config = {compilerOptions: {declaration: true, emitDeclarationOnly: true, allowJs: true, strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022'], types: [], skipLibCheck: true, rootDir: path.join(root, 'src'), outDir: out}, files: ['tree.ts', 'pgn.ts', 'contracts.ts'].map(file => path.join(root, 'src', file))};
const configFile = path.join(out, 'declarations.json'); writeFileSync(configFile, JSON.stringify(config));
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', configFile], {cwd: root, encoding: 'utf8'});
rmSync(configFile);
if (result.status !== 0) throw new Error(result.stdout + result.stderr);
for (const file of readdirSync(out).filter(file => file.endsWith('.d.ts'))) {
  const target = path.join(out, file);
  writeFileSync(target, readFileSync(target, 'utf8').replace(/from (['"])(\.\/[^'"]+)\1/g, (_all, quote, specifier) => `from ${quote}${specifier.endsWith('.js') ? specifier : specifier + '.js'}${quote}`));
}
const inventory = {package: '@knights-eye-chess/game-tree', runtimeInputs: [...inputs].sort(), externalDependencies: ['chess.js@1.4.0']};
writeFileSync(path.join(out, 'runtime-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify(inventory));
