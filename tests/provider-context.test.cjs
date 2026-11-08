const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
const path = require("node:path");
const zlib = require("node:zlib");
const { buildSync } = require("esbuild");

const root = path.join(__dirname, "..");
const calls = [];
let nextResponse;

function makeResponse({ status = 200, headers = {}, body = "" }) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    status,
    url: "https://example.test/final",
    headers,
    buffer: () => buffer,
  };
}

const stubCffi = {};
for (const name of ["get", "post", "put", "del", "head", "patch"]) {
  stubCffi[name] = async (url, options) => {
    calls.push({ name, url, options });
    return nextResponse;
  };
}
stubCffi.default = stubCffi;

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "curl-cffi-node") return stubCffi;
  return originalLoad.call(this, request, parent, isMain);
};

const built = buildSync({
  entryPoints: [path.join(root, "providers", "providerContext.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2018",
  write: false,
  external: ["curl-cffi-node"],
});

const loaded = { exports: {} };
new Function("module", "exports", "require", "__dirname", built.outputFiles[0].text)(
  loaded,
  loaded.exports,
  require,
  root,
);

const { providerContext, createKvStore } = loaded.exports;
const { axios } = providerContext;

function respond(options) {
  nextResponse = makeResponse(options);
  calls.length = 0;
}

test("kvStore implements the full provider storage contract", async () => {
  const store = createKvStore();
  assert.equal(await store.get("missing"), undefined);
  await store.set("a", { n: 1 });
  await store.set("b", "two");
  assert.deepEqual(await store.get("a"), { n: 1 });
  assert.deepEqual((await store.keys()).sort(), ["a", "b"]);
  assert.equal(await store.delete("a"), true);
  assert.equal(await store.delete("a"), false);
  await store.clear();
  assert.deepEqual(await store.keys(), []);
});

test("kvStore instances are isolated from each other", async () => {
  const first = createKvStore();
  const second = createKvStore();
  await first.set("shared", 1);
  assert.equal(await second.get("shared"), undefined);
});

test("context exposes every member of the provider contract", () => {
  for (const key of ["axios", "cheerio", "commonHeaders", "openWebView", "kvStore", "getCookies"]) {
    assert.ok(providerContext[key], `missing ${key}`);
  }
});

test("openWebView reports an explicit error outside the app runtime", async () => {
  await assert.rejects(
    () => providerContext.openWebView("https://example.test"),
    /openWebView is not available/,
  );
});

test("axios adapter parses JSON bodies by content type", async () => {
  respond({ headers: { "content-type": "application/json" }, body: '{"ok":true}' });
  const res = await axios.get("https://example.test/api");
  assert.deepEqual(res.data, { ok: true });
  assert.equal(res.status, 200);
});

test("axios adapter keeps invalid JSON as text instead of throwing", async () => {
  respond({ headers: { "content-type": "application/json" }, body: "not json" });
  const res = await axios.get("https://example.test/api");
  assert.equal(res.data, "not json");
});

test("axios adapter rejects 4xx and 5xx responses with a response object", async () => {
  respond({ status: 403, body: "blocked" });
  await assert.rejects(
    () => axios.get("https://example.test/locked"),
    (error) => error.response && error.response.status === 403 && error.response.data === "blocked",
  );
  respond({ status: 503, body: "down" });
  await assert.rejects(
    () => axios.get("https://example.test/down"),
    (error) => error.response && error.response.status === 503,
  );
});

test("axios adapter honours a custom validateStatus", async () => {
  respond({ status: 404, body: "nothing" });
  const res = await axios.get("https://example.test/missing", { validateStatus: () => true });
  assert.equal(res.status, 404);
});

test("axios adapter serialises query params into the request url", async () => {
  respond({ body: "ok" });
  await axios.get("https://example.test/search", { params: { q: "dune", page: 2 } });
  assert.equal(calls[0].url, "https://example.test/search?q=dune&page=2");
});

test("axios adapter joins baseURL and relative paths", async () => {
  respond({ body: "ok" });
  await axios.get("/movies", { baseURL: "https://example.test/" });
  assert.equal(calls[0].url, "https://example.test/movies");
});

test("axios adapter maps delete to the delete sender and strips accept-encoding", async () => {
  respond({ body: "ok" });
  await axios.delete("https://example.test/item", { headers: { "Accept-Encoding": "gzip", "X-Test": "1" } });
  assert.equal(calls[0].name, "del");
  assert.equal(calls[0].options.headers["X-Test"], "1");
  assert.equal(calls[0].options.headers["Accept-Encoding"], undefined);
});

test("axios adapter converts the axios timeout to whole seconds", async () => {
  respond({ body: "ok" });
  await axios.get("https://example.test/slow", { timeout: 2500 });
  assert.equal(calls[0].options.timeout, 3);
});

test("axios adapter decompresses gzip bodies", async () => {
  respond({ headers: { "content-encoding": "gzip" }, body: zlib.gzipSync("<html>zip</html>") });
  const res = await axios.get("https://example.test/page");
  assert.equal(res.data, "<html>zip</html>");
});

test("axios adapter returns raw buffers for arraybuffer responses", async () => {
  respond({ body: Buffer.from([1, 2, 3]) });
  const res = await axios.get("https://example.test/bin", { responseType: "arraybuffer" });
  assert.ok(Buffer.isBuffer(res.data));
  assert.deepEqual([...res.data], [1, 2, 3]);
});

test("axios adapter refuses to start an already aborted request", async () => {
  respond({ body: "ok" });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => axios.get("https://example.test/x", { signal: controller.signal }));
  assert.equal(calls.length, 0);
});

test("fetch shim reports ok, headers and body helpers", async () => {
  respond({ status: 201, headers: { "content-type": "application/json" }, body: '{"id":7}' });
  const res = await fetch("https://example.test/create", { method: "POST", body: "x" });
  assert.equal(res.ok, true);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("content-type"), "application/json");
  assert.equal(res.headers.has("x-missing"), false);
  assert.deepEqual(await res.json(), { id: 7 });
  assert.equal(calls[0].name, "post");
});

test("fetch shim disables redirects when redirect is manual", async () => {
  respond({ status: 302, body: "" });
  const res = await fetch("https://example.test/go", { redirect: "manual" });
  assert.equal(res.ok, false);
  assert.equal(calls[0].options.followRedirects, false);
});

test.after(() => {
  Module._load = originalLoad;
});
