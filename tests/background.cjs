const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

test("remote fetching stays on allowed hosts", async () => {
  let messageHandler;
  const chrome = {
    runtime: { onMessage: { addListener(listener) { messageHandler = listener; } } }
  };
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const context = vm.createContext({
    URL, Uint8Array, btoa, chrome,
    fetch: async () => new Response(bytes, { headers: { "content-type": "image/png" } })
  });
  vm.runInContext(readFileSync("background.js", "utf8"), context);

  const sender = { url: "https://chatgpt.com/c/example" };
  const forbidden = await new Promise((resolve) => {
    messageHandler({
      type: "FETCH_REMOTE_IMAGE",
      source: "https://other.example/image.png"
    }, sender, resolve);
  });
  assert.equal(forbidden.ok, false);

  const allowed = await new Promise((resolve) => {
    messageHandler({
      type: "FETCH_REMOTE_IMAGE",
      source: "https://files.oaiusercontent.com/image.png"
    }, sender, resolve);
  });
  assert.equal(allowed.ok, true);
  assert.deepEqual(Buffer.from(allowed.base64, "base64"), bytes);
});
