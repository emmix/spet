import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import esbuild from 'esbuild'; // added

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- PARAMETER PARSING ---
const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('Usage: node make-sea.js <entry_file> [native_dll_1] [native_dll_2] ...');
    console.error('Example: node make-sea.js spet.js ./node_modules/.../node_datachannel.node');
    process.exit(1);
}

const ENTRY_FILE = args[0];
const NATIVE_DLLS = args.slice(1); // Array of paths to .node files

const CONFIG = {
    projectName: path.basename(ENTRY_FILE, '.js'),
    distDir: path.join(__dirname, 'dist'),
    bundleFile: path.join(__dirname, 'dist/bundled/bundle.cjs'),
    seaBlob: path.join(__dirname, 'dist/sea/sea-prep.blob'),
    get outputExe() { return path.join(this.distDir, `${this.projectName}.exe`); }
};

async function build() {
    console.log(`🚀 Building Standalone: ${CONFIG.projectName}.exe`);

    // 1. Setup Directories
    [CONFIG.distDir, 'dist/bundled', 'dist/sea'].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    // 2. Process Native Modules (Map filename -> Base64)
    console.log('📦 Encoding Native Modules...');
    const encodedModules = {};
    NATIVE_DLLS.forEach(dllPath => {
        if (fs.existsSync(dllPath)) {
            const fileName = path.basename(dllPath);
            encodedModules[fileName] = fs.readFileSync(dllPath).toString('base64');
            console.log(`   - Encoded: ${fileName}`);
        } else {
            console.warn(`   ⚠️  Warning: ${dllPath} not found, skipping.`);
        }
    });

    // 3. Create Runtime Bootstrapper (Banner)
    // This logic handles extraction and redirection for ALL provided DLLs
    const bannerJs = `
    // 1. 拦截 SEA 和 实验性特性的警告
const originalEmit = process.emit;
process.emit = function (name, data) {
  if (name === 'warning' && data?.message?.includes('single-executable')) {
    return false;
  }
  return originalEmit.apply(process, arguments);
};
      (function() {
        // use unique local names to avoid colliding with bundle top-level identifiers
        const _sea_fs = require('fs');
        const _sea_path = require('path');
        const _sea_Module = require('module');

     
        const exeDir = _sea_path.dirname(process.execPath);
        const encodedAssets = ${JSON.stringify(encodedModules)};
        const extractedPaths = {};
      
        // Extraction Logic
        Object.keys(encodedAssets).forEach(filename => {
          const targetPath = _sea_path.join(exeDir, filename);
          extractedPaths[filename] = targetPath;
          if (!_sea_fs.existsSync(targetPath)) {
            try {
              _sea_fs.writeFileSync(targetPath, Buffer.from(encodedAssets[filename], 'base64'));
            } catch (e) {
              // avoid throwing during bootstrap
              try { console.error('Failed to extract ' + filename + ':', e && e.message); } catch (_) {}
            }
          }
        });
      
        // Require Hook to intercept .node loading
        const _sea_originalRequire = _sea_Module.prototype.require;
        _sea_Module.prototype.require = function (id) {
          for (const filename of Object.keys(extractedPaths)) {
            if (id && id.includes && id.includes(filename)) {
              return _sea_originalRequire.call(this, extractedPaths[filename]);
            }
          }
          return _sea_originalRequire.apply(this, arguments);
        };
      
        // SEA Environment Fixes
        try {
          global.__filename = process.execPath;
          global.__dirname = exeDir;
        } catch (_) {}
      })();
      `.trim();

    // 4. Bundling with esbuild (use API to avoid CLI quoting issues)
    console.log('🏗️  Bundling with esbuild...');
    try {
        // Mark native modules as external so esbuild doesn't try to parse binary as JS
        const externals = NATIVE_DLLS.map(d => path.basename(d));

        // compute a stable import.meta.url value at build time
        const importMetaUrl = pathToFileURL(path.resolve(ENTRY_FILE)).href;
        console.log(`   - path resolved: ${path.resolve(ENTRY_FILE)}`);
        console.log(`   - import.meta.url set to: ${importMetaUrl}`);
        console.log(`   - JSON.stringify(importMetaUrl): ${JSON.stringify(importMetaUrl)}`);

        await esbuild.build({
            entryPoints: [ENTRY_FILE],
            bundle: true,
            platform: 'node',
            format: 'cjs',
            outfile: CONFIG.bundleFile,
            define: {
                'import.meta.url': JSON.stringify(importMetaUrl)
            },
            minify: true,
            external: externals,
            banner: {
                js: bannerJs
            }
        });

        // Note: banner was prepended by esbuild; no manual prepend necessary.
    } catch (e) {
        console.error('❌ Bundling failed', e);
        process.exit(1);
    }

    // 5. SEA Blob Generation
    console.log('🧪 Generating SEA Blob...');
    const seaConfig = { main: CONFIG.bundleFile, output: CONFIG.seaBlob, disableExperimentalSEAWarning: true, disableSentinel: true };
    fs.writeFileSync(`${CONFIG.distDir}/sea-config.json`, JSON.stringify(seaConfig, null, 2));
    execSync(`node --experimental-sea-config ${CONFIG.distDir}/sea-config.json`);

    // 6. Final Injection
    console.log('🔨 Creating Executable...');
    fs.copyFileSync(process.execPath, CONFIG.outputExe);
    execSync(`npx postject "${CONFIG.outputExe}" NODE_SEA_BLOB "${CONFIG.seaBlob}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`);

    console.log(`\n✅ DONE! Result: ${CONFIG.outputExe}`);
}

build();