const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function fixture({ saved = "zh", storageFails = false } = {}) {
  const nodes = new Map();
  for (const id of ["name", "languageLabel", "emailLabel", "supportLabel", "codeOptions", "zh", "en",
    "alipay", "wechat", "alipayCode", "wechatCode", "alipayImage", "wechatImage",
    "alipayLink", "wechatLink", "enlargeHint", "status"]) {
    nodes.set(id, {
      textContent: "",
      hidden: false,
      attributes: new Map(),
      listeners: new Map(),
      setAttribute(name, value) { this.attributes.set(name, value); },
      getAttribute(name) { return this.attributes.get(name); },
      addEventListener(type, listener) { this.listeners.set(type, listener); },
      click() { return this.listeners.get("click")?.(); }
    });
  }
  const stored = { language: saved };
  const chrome = {
    storage: { local: {
      async get() { return { ...stored }; },
      async set(values) {
        if (storageFails) throw new Error("storage unavailable");
        Object.assign(stored, values);
      }
    } }
  };
  const document = {
    documentElement: { lang: "zh-CN" },
    getElementById(id) { return nodes.get(id); }
  };
  vm.runInNewContext(readFileSync("popup.js", "utf8"), { chrome, document });
  return { ui: (id) => nodes.get(id), stored, document };
}

async function settled() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("toolbar popup bundles both original donation codes without a selector button", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  const html = readFileSync("popup.html", "utf8");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.doesNotMatch(html, /id="open"|id="openText"/);
  assert.match(html, /<details id="support">/);
  assert.match(html, /id="emailLink" href="mailto:xinyiu777@gmail\.com"/);
  for (const method of ["alipay", "wechat"]) {
    assert.match(html, new RegExp(`src="assets/${method}\\.jpg"`));
    const bytes = readFileSync(`assets/${method}.jpg`);
    assert.ok(bytes.length > 50_000);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  }
  assert.match(readFileSync("popup.css", "utf8"), /prefers-color-scheme: dark/);
});

test("language preference and both donation methods work without a ChatGPT tab", async () => {
  const popup = fixture({ saved: "en" });
  await settled();
  assert.equal(popup.document.documentElement.lang, "en");
  assert.equal(popup.ui("supportLabel").textContent, "Support");
  assert.equal(popup.ui("emailLabel").textContent, "Email");
  assert.equal(popup.ui("alipayCode").hidden, false);
  assert.equal(popup.ui("wechatCode").hidden, true);

  popup.ui("wechat").click();
  assert.equal(popup.ui("wechatCode").hidden, false);
  assert.equal(popup.ui("alipayCode").hidden, true);
  assert.equal(popup.ui("wechat").getAttribute("aria-pressed"), "true");
  assert.equal(popup.ui("wechatImage").alt, "WeChat support QR code");

  await popup.ui("zh").click();
  assert.equal(popup.stored.language, "zh");
  assert.equal(popup.ui("supportLabel").textContent, "赞赏码");
  assert.equal(popup.ui("emailLabel").textContent, "邮箱");
  assert.equal(popup.ui("wechatCode").hidden, false);
  assert.equal(popup.ui("wechatLink").getAttribute("aria-label"), "查看微信赞赏码原图");
  popup.ui("alipay").click();
  assert.equal(popup.ui("alipayCode").hidden, false);
});

test("popup reports a language preference save failure", async () => {
  const popup = fixture({ storageFails: true });
  await settled();
  await popup.ui("en").click();
  assert.equal(popup.ui("status").hidden, false);
  assert.match(popup.ui("status").textContent, /Language preference was not saved/);
});
