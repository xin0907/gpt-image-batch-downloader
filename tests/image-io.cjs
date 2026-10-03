const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64"
);

function loadIO(fetchImplementation) {
  const context = vm.createContext({
    URL, Blob, Uint8Array, atob,
    location: { href: "https://chatgpt.com/c/example", origin: "https://chatgpt.com" },
    fetch: fetchImplementation,
    chrome: { runtime: { sendMessage: async () => ({ ok: false, error: "扩展请求失败" }) } }
  });
  vm.runInContext(readFileSync("image-io.js", "utf8"), context);
  return context.BatchImageIO;
}

function directory(failWrite = false) {
  const files = new Map();
  return {
    files,
    async getFileHandle(name, options) {
      if (!files.has(name)) {
        if (!options?.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
        files.set(name, null);
      }
      return {
        async createWritable() {
          return {
            async write(blob) {
              const bytes = new Uint8Array(await blob.arrayBuffer());
              files.set(name, { bytes, type: blob.type });
              if (failWrite) throw new Error("write failed");
            },
            async close() {},
            async abort() {}
          };
        }
      };
    },
    async removeEntry(name) { files.delete(name); }
  };
}

test("fetches image bytes without conversion and writes a non-overwriting copy", async () => {
  const io = loadIO(async () => new Response(pngBytes, { headers: { "content-type": "image/png" } }));
  const blob = await io.fetchImage("https://chatgpt.com/image.png");
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), pngBytes);
  const target = directory();
  const first = await io.saveBlob(target, blob, "series-001");
  const second = await io.saveBlob(target, blob, "series-001");
  assert.equal(first.filename, "series-001.png");
  assert.equal(second.filename, "series-001-1.png");
  assert.equal(target.files.size, 2);
});

test("rejects non-image responses and removes a failed partial write", async () => {
  const io = loadIO(async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } }));
  await assert.rejects(io.fetchImage("https://chatgpt.com/image.png"), /不是受支持的图片文件/);
  const target = directory(true);
  await assert.rejects(io.saveBlob(target, new Blob([pngBytes], { type: "image/png" }), "series-001"), /write failed/);
  assert.equal(target.files.size, 0);
});
