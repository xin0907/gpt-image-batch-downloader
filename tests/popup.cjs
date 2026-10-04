const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function fixture({ saved = "zh", storageFails = false, uiLanguage } = {}) {
  const nodes = new Map();
  for (const id of ["name", "languageLabel", "githubLink", "zh", "en", "status",
    "supportLabel", "codeOptions", "supportHint", "alipay", "wechat", "alipayImage", "wechatImage"]) {
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
    i18n: uiLanguage ? { getUILanguage: () => uiLanguage } : undefined,
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

test("toolbar popup links to GitHub and keeps optional support codes collapsed", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  const html = readFileSync("popup.html", "utf8");
  const packaged = readFileSync("scripts/package.py", "utf8");
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.match(html, /id="githubLink"[^>]*href="https:\/\/github\.com\/xin0907\/gpt-image-batch-downloader"/);
  assert.doesNotMatch(html, /mailto:/);
  assert.match(html, /<details id="support"(?![^>]*\bopen\b)[^>]*>/, "support section starts collapsed");
  for (const method of ["alipay", "wechat"]) {
    assert.match(html, new RegExp(`src="assets/${method}-qr\\.png"`));
    assert.match(packaged, new RegExp(`assets/${method}-qr\\.png`));
    const bytes = readFileSync(`assets/${method}-qr.png`);
    assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  }
  assert.match(readFileSync("popup.css", "utf8"), /prefers-color-scheme: dark/);
});

test("support codes switch between Alipay and WeChat and follow the language", async () => {
  const popup = fixture({ saved: "zh" });
  await settled();
  assert.equal(popup.ui("supportLabel").textContent, "请作者喝杯咖啡");
  assert.equal(popup.ui("alipayImage").hidden, false);
  assert.equal(popup.ui("wechatImage").hidden, true);
  popup.ui("wechat").click();
  assert.equal(popup.ui("wechatImage").hidden, false);
  assert.equal(popup.ui("alipayImage").hidden, true);
  assert.equal(popup.ui("wechat").getAttribute("aria-pressed"), "true");
  await popup.ui("en").click();
  assert.equal(popup.ui("supportLabel").textContent, "Buy me a coffee");
  assert.equal(popup.ui("wechat").textContent, "WeChat");
  assert.equal(popup.ui("wechatImage").alt, "WeChat support QR code");
  assert.equal(popup.ui("wechatImage").hidden, false, "language switch keeps the chosen code");
});

test("language preference switches popup text without a ChatGPT tab", async () => {
  const popup = fixture({ saved: "en" });
  await settled();
  assert.equal(popup.document.documentElement.lang, "en");
  assert.equal(popup.ui("languageLabel").textContent, "Language");
  assert.equal(popup.ui("githubLink").getAttribute("aria-label"), "View source on GitHub");
  assert.equal(popup.ui("en").getAttribute("aria-pressed"), "true");

  await popup.ui("zh").click();
  assert.equal(popup.stored.language, "zh");
  assert.equal(popup.document.documentElement.lang, "zh-CN");
  assert.equal(popup.ui("languageLabel").textContent, "语言");
  assert.equal(popup.ui("githubLink").getAttribute("aria-label"), "在 GitHub 查看源代码");
  assert.equal(popup.ui("zh").getAttribute("aria-pressed"), "true");
});

test("popup follows the browser language until the user picks one", async () => {
  const english = fixture({ saved: null, uiLanguage: "en-US" });
  await settled();
  assert.equal(english.ui("languageLabel").textContent, "Language");
  const chinese = fixture({ saved: null, uiLanguage: "zh-TW" });
  await settled();
  assert.equal(chinese.ui("languageLabel").textContent, "语言");
  const saved = fixture({ saved: "zh", uiLanguage: "fr" });
  await settled();
  assert.equal(saved.ui("languageLabel").textContent, "语言");
});

test("manifest name and description are localized for Chinese and English", () => {
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  assert.equal(manifest.default_locale, "en");
  assert.equal(manifest.name, "__MSG_extName__");
  assert.equal(manifest.description, "__MSG_extDescription__");
  assert.equal(manifest.action.default_title, "__MSG_actionTitle__");
  const packaged = readFileSync("scripts/package.py", "utf8");
  for (const locale of ["en", "zh_CN"]) {
    const messages = JSON.parse(readFileSync(`_locales/${locale}/messages.json`, "utf8"));
    for (const key of ["extName", "extDescription", "actionTitle"]) assert.ok(messages[key]?.message, locale + " " + key);
    assert.ok(messages.extName.message.length <= 75);
    assert.ok(messages.extDescription.message.length <= 132);
    assert.match(packaged, new RegExp(`_locales/${locale}/messages\.json`));
  }
});

test("popup reports a language preference save failure", async () => {
  const popup = fixture({ storageFails: true });
  await settled();
  await popup.ui("en").click();
  assert.equal(popup.ui("status").hidden, false);
  assert.match(popup.ui("status").textContent, /Language preference was not saved/);
});
