import esbuild from 'esbuild';

esbuild.build({
  entryPoints: ['relay.js'],
  bundle: true,
  outfile: 'dist/bundled/bundle.cjs',
  platform: 'node',
  target: 'node22.11.0',
  format: 'cjs',
  sourcemap: true,
  minify: true,
  banner: {
  /*
   w/a: suppress following warning:
(node:124708) Warning: Currently the require() provided to the main script embedded into single-executable applications only supports loading built-in modules.
To load a module from disk after the single executable application is launched, use require("module").createRequire().
Support for bundled module loading or virtual file systems are under discussions in https://github.com/nodejs/single-executable
(Use `spet --trace-warnings ...` to show where the warning was created)   
  */
    js: `
const originalEmit = process.emit;
process.emit = function (name, data) {
    if (name === 'warning' && (
	data?.message?.includes('single-executable') ||
	data?.message?.includes('ExperimentalWarning')
    )) {
	return false;
    }
    return originalEmit.apply(process, arguments);
};
`.trim(),
  },
}).catch(() => process.exit(1));
