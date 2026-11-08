const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { minify } = require("terser");
const { createProviderHeader } = require("./provider-build-metadata");

const SKIP_MINIFY = process.env.SKIP_MINIFY === "true";

const providersDir = path.join(__dirname, "providers");
const distDir = path.join(__dirname, "dist");
const providerModules = ["catalog", "posts", "meta", "stream", "episodes", "settings"];
const utilityFiles = [
  { name: "headers", external: [], keepNodeBuiltins: false },
  { name: "providerContext", external: ["curl-cffi-node"], keepNodeBuiltins: true },
];

const providerDirs = fs
  .readdirSync(providersDir, { withFileTypes: true })
  .filter(
    (dirent) =>
      dirent.isDirectory() &&
      !dirent.name.startsWith(".") &&
      dirent.name !== "extractors",
  )
  .map((dirent) => dirent.name);

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"),
);
const providerHeaders = new Map(
  providerDirs.map((name) => [
    name,
    createProviderHeader(manifest.find((entry) => entry.value === name)),
  ]),
);

console.log(`Found ${providerDirs.length} providers to build`);

function bundle(entryPoint, outfile, external) {
  return esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2015",
    write: false,
    external,
    minify: false,
    keepNames: true,
    treeShaking: true,
    outfile,
  });
}

function stripNodeBuiltins(code) {
  return code.replace(/require\(['"]node:.*?['"]\)/g, "{}");
}

function applyDirectExports(code) {
  const exportMatch = code.match(/__export\((\w+),\s*\{([^}]+)\}\);/);

  if (exportMatch) {
    const exportEntries = exportMatch[2]
      .split(",")
      .map((entry) => {
        const match = entry.trim().match(/(\w+):\s*\(\)\s*=>\s*(\w+)/);
        return match ? { exportName: match[1], localName: match[2] } : null;
      })
      .filter(Boolean);

    code = code.replace(/module\.exports\s*=\s*__toCommonJS\((\w+)\);/g, "");

    const directExports = exportEntries
      .map(({ exportName, localName }) => `exports.${exportName} = ${localName};`)
      .join("\n");

    code = code.replace(
      /\/\/ Annotate the CommonJS export names for ESM import in node:/,
      `${directExports}\n// Annotate the CommonJS export names for ESM import in node:`,
    );
  }

  return code.replace(/0\s*&&\s*\(module\.exports\s*=\s*\{[^}]*\}\);?/g, "");
}

async function minifyCode(code) {
  const minified = await minify(code, {
    compress: {
      drop_console: false,
      passes: 2,
      unsafe: false,
      unsafe_arrows: false,
      unsafe_comps: false,
      unsafe_Function: false,
      unsafe_math: false,
      unsafe_symbols: false,
      unsafe_methods: false,
      unsafe_proto: false,
      unsafe_regexp: false,
      unsafe_undefined: false,
    },
    mangle: false,
    format: { comments: false },
  });
  return minified.code || code;
}

async function buildModule(providerName, moduleName, distPath) {
  const modulePath = path.join(providersDir, providerName, `${moduleName}.ts`);
  if (!fs.existsSync(modulePath)) return null;

  try {
    const result = await bundle(modulePath, `${moduleName}.js`, []);
    let code = applyDirectExports(stripNodeBuiltins(result.outputFiles[0].text));

    if (!SKIP_MINIFY) {
      code = await minifyCode(code);
    }

    code = providerHeaders.get(providerName) + code;
    fs.writeFileSync(path.join(distPath, `${moduleName}.js`), code);

    console.log(
      `✓ ${providerName}/${moduleName}.js (${(code.length / 1024).toFixed(1)}kb)`,
    );
    return { moduleName, size: code.length };
  } catch (error) {
    console.error(`✗ Error building ${providerName}/${moduleName}:`, error.message);
    throw error;
  }
}

async function buildProvider(providerName) {
  const distPath = path.join(distDir, providerName);
  fs.mkdirSync(distPath, { recursive: true });

  const results = [];
  for (const moduleName of providerModules) {
    const built = await buildModule(providerName, moduleName, distPath);
    if (built) results.push(built);
  }

  return { providerName, modules: results };
}

async function buildUtilityFiles() {
  for (const { name, external, keepNodeBuiltins } of utilityFiles) {
    const utilityPath = path.join(providersDir, `${name}.ts`);
    if (!fs.existsSync(utilityPath)) continue;

    try {
      const result = await bundle(utilityPath, `${name}.js`, external);
      let code = result.outputFiles[0].text;
      if (!keepNodeBuiltins) code = stripNodeBuiltins(code);

      fs.writeFileSync(path.join(distDir, `${name}.js`), code);
      console.log(`✓ ${name}.js (${(code.length / 1024).toFixed(1)}kb)`);
    } catch (error) {
      console.error(`✗ Error building ${name}:`, error.message);
      throw error;
    }
  }
}

async function buildAll() {
  const startTime = Date.now();
  console.log(`Building providers${SKIP_MINIFY ? " (without minification)" : ""}...\n`);

  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  await buildUtilityFiles();

  const results = await Promise.all(providerDirs.map(buildProvider));

  const totalModules = results.reduce((sum, r) => sum + r.modules.length, 0);
  const totalSize = results.reduce(
    (sum, r) => sum + r.modules.reduce((s, m) => s + m.size, 0),
    0,
  );

  console.log(
    `\n✓ Built ${totalModules} modules from ${providerDirs.length} providers in ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
  );
  console.log(`  Total size: ${(totalSize / 1024).toFixed(1)}kb`);
}

buildAll().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
