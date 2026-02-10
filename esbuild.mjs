import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "ES2020",
  sourcemap: !production,
  minify: production,
  treeShaking: true,
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    const result = await esbuild.build(buildOptions);
    if (result.errors.length === 0) {
      console.log("Build completed successfully");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
