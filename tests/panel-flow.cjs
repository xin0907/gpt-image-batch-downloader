const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { webcrypto } = require("node:crypto");
const test = require("node:test");
const vm = require("node:vm");

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64"
);

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    const classes = new Set();
    this.classList = {
      add(value) { classes.add(value); },
      contains(value) { return classes.has(value); }
    };
    this.style = {};
    this.dataset = {};
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.scrollTop = 0;
    this.isConnected = true;
    this.attributes = new Map();
  }

  attachShadow() {
    this.shadowRoot = new Shadow();
    return this.shadowRoot;
  }

  append(...children) {
    for (const child of children) {
      if (child.parentElement) {
        child.parentElement.children = child.parentElement.children.filter((entry) => entry !== child);
      }
      child.parentElement = this;
      this.children.push(child);
    }
  }
  after(element) {
    const parent = this.parentElement;
    if (element.parentElement) {
      element.parentElement.children = element.parentElement.children.filter((entry) => entry !== element);
    }
    element.parentElement = parent;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, element);
  }
  get nextElementSibling() {
    if (!this.parentElement) return null;
    return this.parentElement.children[this.parentElement.children.indexOf(this) + 1] || null;
  }
  contains(target) {
    for (let node = target; node; node = node.parentElement) if (node === this) return true;
    return false;
  }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "src") this.src = undefined;
  }
  focus() {}
  getBoundingClientRect() {
    return this.rect || { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ target: this, stopPropagation() {} });
    }
  }
  click() {
    this.dispatch("click");
    if (this.tagName === "INPUT" && this.type === "checkbox" && !this.disabled) {
      this.checked = !this.checked;
      this.dispatch("change");
    }
    if (this.tagName === "LABEL") {
      const checkbox = this.children.find((child) => child.type === "checkbox");
      if (checkbox && !checkbox.disabled) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatch("change");
      }
    }
  }
}

class Shadow {
  set innerHTML(html) {
    this.html = html;
    this.nodes = new Map();
    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
      this.nodes.set(id, new Element());
    }
    for (const id of ["backdrop", "scanIssue", "partialConfirmLabel", "preview"]) {
      if (this.nodes.has(id)) this.nodes.get(id).hidden = true;
    }
  }
  getElementById(id) { return this.nodes.get(id); }
}

async function eventually(check) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for panel state");
}

function fixture({
  failOnceForSecond = false, mode = "generation",
  withActionRow = true, stickyActionRow = false,
  themeDark = false, darkBackgroundOnly = false,
  viewerZoom = true, scanIncomplete = false, cancelPickerOnce = false,
  changeGalleryDuringPicker = false, viewerOverlay = false,
  galleryInitiallyMissing = false, storageState = {}, uiLanguage
} = {}) {
  const files = new Map();
  const directory = {
    name: "test",
    requestPermission: async () => "granted",
    async getFileHandle(name, options) {
      if (!files.has(name)) {
        if (!options?.create) throw Object.assign(new Error("missing"), { name: "NotFoundError" });
        files.set(name, null);
      }
      return {
        async createWritable() {
          return {
            async write(blob) { files.set(name, blob); },
            async close() {},
            async abort() {}
          };
        }
      };
    },
    async removeEntry(name) { files.delete(name); }
  };
  const rail = {
    isConnected: true,
    getBoundingClientRect: () => ({ left: 492, right: 557, top: 0, bottom: 668 })
  };
  const sources = [1, 2, 3].map((n) => "https://chatgpt.com/image/" + n + ".png");
  let failedSecond = false;
  const body = new Element();
  const documentElement = new Element();
  if (themeDark) documentElement.classList.add("dark");
  documentElement.append(body);
  const scope = new Element();
  body.append(scope);
  const galleryRoot = new Element();
  scope.append(galleryRoot);
  const actionRow = new Element();
  if (stickyActionRow) actionRow.position = "sticky";
  actionRow.rect = { left: 108, right: 268, top: 684, bottom: 716, width: 160, height: 32 };
  const copyButton = new Element();
  copyButton.rect = { left: 112, right: 136, top: 688, bottom: 712, width: 24, height: 24 };
  const moreButton = new Element();
  moreButton.rect = { left: 144, right: 168, top: 688, bottom: 712, width: 24, height: 24 };
  actionRow.append(copyButton, moreButton);
  if (withActionRow) scope.append(actionRow);
  scope.querySelectorAll = () => withActionRow ? [copyButton, moreButton] : [];
  const gallery = {
    rail, mode, root: galleryRoot,
    hero: { rect: mode === "viewer"
      ? { left: 788, right: 1188, top: 53, bottom: 763 }
      : { left: 108, right: 483, top: 0, bottom: 668 } }
  };
  let currentGallery = gallery;
  let galleryReady = !galleryInitiallyMissing;
  const backgroundGallery = { ...gallery, mode: "generation", rail: { isConnected: true } };
  const thumbnails = sources.map((src) => ({ currentSrc: src }));
  let scanComplete = !scanIncomplete;
  const Gallery = {
    discover: (options) => galleryReady
      ? viewerOverlay && mode === "viewer" && options?.preferMode !== "viewer"
        ? backgroundGallery : currentGallery
      : null,
    thumbsInRail: () => thumbnails,
    scan: async () => ({
      items: sources.map((source, index) => ({
        id: "item-" + index,
        source,
        thumbnailSource: source,
        naturalWidth: 1,
        naturalHeight: 1
      })),
      scannedThumbnails: 3,
      thumbnailSources: sources,
      unresolved: 0,
      railComplete: scanComplete,
      complete: scanComplete
    })
  };
  const hosts = new Map();
  const appendToBody = body.append.bind(body);
  body.append = (...elements) => {
    appendToBody(...elements);
    for (const element of elements) if (element.id) hosts.set(element.id, element);
  };
  let messageListener;
  let storageListener;
  let pickerCalls = 0;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const observers = [];
  const zoomButton = new Element();
  zoomButton.textContent = "44%";
  zoomButton.rect = { left: 1692, right: 1752, top: 8, bottom: 42, width: 60, height: 34 };
  const downloadButton = new Element();
  downloadButton.rect = { left: 1760, right: 1796, top: 8, bottom: 44, width: 36, height: 36 };
  const document = {
    body,
    documentElement,
    createElement: (tagName) => new Element(tagName),
    querySelectorAll: () => mode === "viewer"
      ? (viewerZoom ? [downloadButton, zoomButton] : [downloadButton]) : [],
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    }
  };
  const window = {
    showDirectoryPicker: () => {
      pickerCalls += 1;
      if (changeGalleryDuringPicker) currentGallery = { ...gallery, rail: { isConnected: true } };
      if (cancelPickerOnce && pickerCalls === 1) {
        return Promise.reject(Object.assign(new Error("cancelled"), { name: "AbortError" }));
      }
      return Promise.resolve(directory);
    },
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    }
  };
  const chrome = {
    i18n: uiLanguage ? { getUILanguage: () => uiLanguage } : undefined,
    storage: {
      local: {
        async get() { return { language: storageState.language }; },
        async set(values) { Object.assign(storageState, values); }
      },
      onChanged: { addListener(listener) { storageListener = listener; } }
    },
    runtime: {
      getURL: (path) => "https://chatgpt.com/" + path,
      sendMessage: async () => ({ ok: false }),
      onMessage: { addListener(listener) { messageListener = listener; } }
    }
  };
  const context = vm.createContext({
    URL, Blob, Response, Uint8Array, atob, crypto: webcrypto,
    document, window, chrome, setTimeout,
    location: {
      href: "https://chatgpt.com/c/example",
      origin: "https://chatgpt.com",
      pathname: "/c/example"
    },
    innerWidth: 1920,
    innerHeight: 900,
    MutationObserver: class {
      constructor(callback) { observers.push(callback); }
      observe() {}
    },
    getComputedStyle: (element) => ({
      position: element.position || "static",
      display: "block", flexDirection: "column",
      backgroundColor: themeDark || darkBackgroundOnly
        ? "rgb(33, 33, 33)" : "rgb(255, 255, 255)"
    }),
    fetch: async (source) => {
      if (failOnceForSecond && source === sources[1] && !failedSecond) {
        failedSecond = true;
        throw new Error("temporary network error");
      }
      return new Response(png, { headers: { "content-type": "image/png" } });
    },
    BatchImageGallery: Gallery
  });
  vm.runInContext(readFileSync("image-io.js", "utf8"), context);
  vm.runInContext(readFileSync("content.js", "utf8"), context);
  const panelHost = hosts.get("bgi-extension-root");
  const triggerHost = hosts.get("bgi-trigger-root");
  return {
    ui: (id) => panelHost.shadowRoot.getElementById(id),
    trigger: () => triggerHost.shadowRoot.getElementById("trigger"),
    triggerMarkup: triggerHost.shadowRoot.html,
    triggerHost,
    panelHost,
    actionRow,
    body,
    galleryRoot,
    files,
    storageState,
    getPickerCalls: () => pickerCalls,
    dispatchWheel({ deltaY = 120, deltaMode = 0, overList = true, ctrlKey = false } = {}) {
      const event = {
        deltaY, deltaMode, ctrlKey,
        defaultPrevented: false, stopped: false,
        composedPath: () => overList ? [panelHost.shadowRoot.getElementById("imageList"), panelHost] : [body],
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; }
      };
      for (const listener of windowListeners.get("wheel") || []) listener(event);
      return event;
    },
    dispatchKey(key) {
      const event = {
        key, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; }
      };
      for (const listener of documentListeners.get("keydown") || []) listener(event);
      return event;
    },
    makeScanComplete() { scanComplete = true; },
    revealGallery() {
      galleryReady = true;
      for (const listener of documentListeners.get("load") || []) {
        listener({ target: new Element("img") });
      }
    },
    switchToDark() {
      documentElement.classList.add("dark");
      for (const callback of observers) callback();
    },
    setStoredLanguage(language) {
      storageState.language = language;
      storageListener({ language: { newValue: language } }, "local");
    }
  };
}

test("generation icon joins the message action row and viewer icon joins the top toolbar", async () => {
  const generation = fixture();
  assert.doesNotMatch(generation.panelHost.shadowRoot.html, /id="panelTitle"|CHATGPT 图片|id="scan"/);
  assert.equal(generation.ui("scanIssue").hidden, true);
  assert.match(generation.triggerMarkup, /aria-label="批量下载图片"/);
  assert.match(generation.triggerMarkup, /<svg viewBox="0 0 24 24"/);
  assert.equal(generation.triggerHost.parentElement, generation.actionRow);
  assert.equal(generation.triggerHost.dataset.placement, "generation");
  assert.equal(generation.triggerHost.style.top, undefined);
  generation.trigger().click();
  assert.equal(generation.ui("backdrop").hidden, false);
  await eventually(() => generation.ui("imageList").children.length === 3);

  const viewer = fixture({ mode: "viewer" });
  assert.equal(viewer.triggerHost.parentElement, viewer.body);
  assert.equal(viewer.triggerHost.dataset.placement, "viewer-toolbar");
  assert.equal(viewer.triggerHost.style.left, "1648px");
  assert.equal(viewer.triggerHost.style.top, "8px");
  viewer.trigger().click();
  assert.equal(viewer.ui("backdrop").hidden, false);
  await eventually(() => viewer.ui("imageList").children.length === 3);
});

test("an uncertain rail lists found images but needs explicit confirmation", async () => {
  const page = fixture({ scanIncomplete: true });
  page.trigger().click();
  await eventually(() => !page.ui("scanIssue").hidden);
  assert.match(page.ui("scanIssueText").textContent, /无法确认网页是否还有未加载的图片/);
  assert.equal(page.ui("imageList").children.length, 3);
  assert.equal(page.ui("selectToolbar").hidden, false);
  assert.equal(page.ui("saveFooter").hidden, false);
  assert.equal(page.ui("partialConfirmLabel").hidden, false);
  assert.equal(page.ui("save").disabled, true);
  page.ui("partialConfirm").checked = true;
  page.ui("partialConfirm").dispatch("change");
  assert.equal(page.ui("save").disabled, false);
  page.ui("save").click();
  await eventually(() => page.files.size === 3);
  assert.equal(page.getPickerCalls(), 1);
});

test("wheel input over the image list scrolls it without reaching the page", async () => {
  const page = fixture({ scanIncomplete: true });
  page.trigger().click();
  await eventually(() => page.ui("imageList").children.length === 3);
  const list = page.ui("imageList");
  list.clientHeight = 200;
  list.scrollTop = 10;
  const wheel = page.dispatchWheel({ deltaY: 120 });
  assert.equal(list.scrollTop, 130);
  assert.equal(wheel.defaultPrevented, true);
  assert.equal(wheel.stopped, true);
  const outside = page.dispatchWheel({ overList: false });
  assert.equal(list.scrollTop, 130);
  assert.equal(outside.defaultPrevented, false);
  const zoom = page.dispatchWheel({ ctrlKey: true });
  assert.equal(list.scrollTop, 130);
  assert.equal(zoom.defaultPrevented, false);
});

test("toolbar language preference translates the panel and preserves selection, scroll and confirmation", async () => {
  const storageState = {};
  const page = fixture({ scanIncomplete: true, storageState });
  page.trigger().click();
  await eventually(() => page.ui("imageList").children.length === 3);
  page.ui("imageList").children[0].children[0].click();
  page.ui("imageList").scrollTop = 37;
  page.ui("partialConfirm").checked = true;
  page.ui("partialConfirm").dispatch("change");
  assert.equal(page.ui("save").disabled, false);

  page.setStoredLanguage("en");
  assert.equal(storageState.language, "en");
  assert.equal(page.ui("counts").textContent, "3 found · 2 selected");
  assert.match(page.ui("scanIssueText").textContent, /page may still be loading more/);
  assert.equal(page.ui("partialConfirmText").textContent, "I've checked these 3 images");
  assert.equal(page.ui("selectAll").textContent, "Select all");
  assert.equal(page.ui("save").textContent, "Download selected (2)");
  assert.equal(page.ui("imageList").scrollTop, 37);
  assert.equal(page.ui("imageList").children[0].children[0].children[0].checked, false);
  assert.equal(page.ui("save").disabled, false);
  assert.equal(page.trigger().getAttribute("aria-label"), "Download image group");
  page.ui("imageList").children[1].children[1].click();
  assert.equal(page.ui("previewPosition").textContent, "Image 2 / 3");
  assert.equal(page.ui("previewSelectText").textContent, "Select this image");
  page.ui("previewClose").click();

  const reloaded = fixture({ storageState });
  await eventually(() => reloaded.ui("selectAll").textContent === "Select all");
  reloaded.trigger().click();
  await eventually(() => reloaded.ui("imageList").children.length === 3);
  assert.equal(reloaded.ui("counts").textContent, "3 found · 3 selected");
  reloaded.setStoredLanguage("zh");
  assert.equal(storageState.language, "zh");
  assert.equal(reloaded.ui("selectAll").textContent, "全选");
});

test("toolbar language preference retranslates completed and failed download results", async () => {
  const page = fixture({ failOnceForSecond: true });
  page.trigger().click();
  await eventually(() => page.ui("imageList").children.length === 3);
  page.ui("save").click();
  await eventually(() => page.ui("saveStatus").textContent?.includes("本次完成"));
  page.setStoredLanguage("en");
  assert.match(page.ui("saveStatus").textContent, /^Finished: 2\/3 saved/);
  const failedInfo = page.ui("imageList").children[1].children[0].children[1];
  assert.equal(failedInfo.children[0].textContent, "Image 02");
  assert.match(failedInfo.children[2].textContent, /^Failed: temporary network error/);
  page.ui("save").click();
  await eventually(() => page.ui("saveStatus").textContent?.includes("Finished: 1/1 saved"));
  assert.equal(page.files.size, 3);
  page.setStoredLanguage("zh");
  assert.match(page.ui("saveStatus").textContent, /^本次完成：1\/1 张成功/);
});

test("retry clears the uncertain-list confirmation after a complete scan", async () => {
  const page = fixture({ scanIncomplete: true });
  page.trigger().click();
  await eventually(() => !page.ui("partialConfirmLabel").hidden);
  page.makeScanComplete();
  page.ui("retry").click();
  await eventually(() => page.ui("scanIssue").hidden &&
    page.ui("imageList").children.length === 3);
  assert.equal(page.ui("imageList").children.length, 3);
  assert.equal(page.ui("scanIssue").hidden, true);
  assert.equal(page.ui("partialConfirmLabel").hidden, true);
  assert.equal(page.ui("saveFooter").hidden, false);
  assert.equal(page.ui("save").disabled, false);
});

test("viewer icon uses the first toolbar control when zoom is absent", () => {
  const viewer = fixture({ mode: "viewer", viewerZoom: false });
  assert.equal(viewer.triggerHost.style.left, "1716px");
  assert.equal(viewer.triggerHost.style.top, "8px");
});

test("viewer toolbar stays available while the image group finishes loading", async () => {
  const page = fixture({ mode: "viewer", galleryInitiallyMissing: true });
  assert.equal(page.triggerHost.hidden, false);
  assert.equal(page.triggerHost.dataset.placement, "viewer-toolbar");
  page.revealGallery();
  await eventually(() => page.triggerHost.dataset.placement === "viewer-toolbar" && !page.triggerHost.hidden);
  page.trigger().click();
  await eventually(() => page.ui("imageList").children.length === 3);
});

test("fullscreen viewer takes precedence over the covered generation group", async () => {
  const page = fixture({ mode: "viewer", viewerOverlay: true });
  assert.equal(page.triggerHost.dataset.placement, "viewer-toolbar");
  assert.equal(page.triggerHost.parentElement, page.body);
  page.trigger().click();
  await eventually(() => page.ui("imageList").children.length === 3);
});

test("generation icon falls back to normal flow when no action row is found", () => {
  const page = fixture({ withActionRow: false });
  assert.equal(page.triggerHost.parentElement, page.galleryRoot.parentElement);
  assert.equal(page.galleryRoot.nextElementSibling, page.triggerHost);
  assert.equal(page.triggerHost.dataset.placement, "generation-fallback");
});

test("sticky composer controls are not used as the message action row", () => {
  const page = fixture({ stickyActionRow: true });
  assert.equal(page.triggerHost.parentElement, page.galleryRoot.parentElement);
  assert.equal(page.galleryRoot.nextElementSibling, page.triggerHost);
  assert.equal(page.triggerHost.dataset.placement, "generation-fallback");
});

test("icon and panel follow ChatGPT light and dark themes", async () => {
  const light = fixture();
  assert.equal(light.triggerHost.dataset.theme, "light");
  assert.equal(light.panelHost.dataset.theme, "light");
  light.switchToDark();
  await eventually(() => light.triggerHost.dataset.theme === "dark");
  assert.equal(light.panelHost.dataset.theme, "dark");

  const dark = fixture({ themeDark: true });
  assert.equal(dark.triggerHost.dataset.theme, "dark");
  assert.equal(dark.panelHost.dataset.theme, "dark");

  const darkBackground = fixture({ darkBackgroundOnly: true });
  assert.equal(darkBackground.triggerHost.dataset.theme, "dark");
  assert.equal(darkBackground.panelHost.dataset.theme, "dark");
});

test("thumbnail preview navigates and changes selection without closing the panel", async () => {
  const page = fixture();
  page.trigger().click();
  await eventually(() => page.ui("imageList").children.length === 3);
  const firstCard = page.ui("imageList").children[0];
  firstCard.children[0].click();
  assert.equal(page.ui("counts").textContent, "3 张已识别 · 2 张已选");
  assert.equal(firstCard.children[0].children[0].checked, false);
  firstCard.children[0].click();
  assert.equal(page.ui("counts").textContent, "3 张已识别 · 3 张已选");
  firstCard.click();
  assert.equal(page.ui("counts").textContent, "3 张已识别 · 2 张已选");
  firstCard.click();
  assert.equal(page.ui("counts").textContent, "3 张已识别 · 3 张已选");
  firstCard.children[1].click();
  assert.equal(page.ui("preview").hidden, false);
  assert.equal(page.ui("counts").textContent, "3 张已识别 · 3 张已选");
  assert.equal(page.ui("panel").inert, true);
  assert.equal(page.ui("previewImage").src, "https://chatgpt.com/image/1.png");
  assert.equal(page.ui("previewPosition").textContent, "第 1 / 3 张");
  page.ui("previewNext").click();
  assert.equal(page.ui("previewImage").src, "https://chatgpt.com/image/2.png");
  page.ui("previewSelected").checked = false;
  page.ui("previewSelected").dispatch("change");
  assert.equal(page.ui("counts").textContent, "3 张已识别 · 2 张已选");
  assert.equal(page.ui("imageList").children[1].children[0].children[0].checked, false);
  assert.equal(page.dispatchKey("ArrowLeft").stopped, true);
  assert.equal(page.ui("previewImage").src, "https://chatgpt.com/image/1.png");
  assert.equal(page.dispatchKey("ArrowLeft").stopped, true, "edge key stays inside the preview");
  assert.equal(page.dispatchKey("a").stopped, false, "unhandled keys pass through");
  assert.equal(page.dispatchKey("Escape").stopped, true);
  assert.equal(page.ui("preview").hidden, true);
  assert.equal(page.ui("backdrop").hidden, false);
  assert.equal(page.ui("panel").inert, false);
});

test("default selection, partial selection, and selected-only saving", async () => {
  const { ui, files, getPickerCalls, panelHost, trigger } = fixture();
  trigger().click();
  assert.equal(ui("backdrop").hidden, false);
  await eventually(() => ui("imageList").children.length === 3);
  assert.doesNotMatch(panelHost.shadowRoot.html, /id="saveSection"|id="chooseDirectory"/);
  assert.equal(ui("counts").textContent, "3 张已识别 · 3 张已选");
  assert.ok(ui("imageList").children.every((card) => card.children[0].children[0].checked));
  assert.equal(ui("save").disabled, false);

  ui("selectNone").click();
  assert.equal(ui("counts").textContent, "3 张已识别 · 0 张已选");
  assert.equal(ui("save").disabled, true);
  ui("selectAll").click();
  const firstCheck = ui("imageList").children[0].children[0].children[0];
  firstCheck.checked = false;
  firstCheck.dispatch("change");
  assert.equal(ui("counts").textContent, "3 张已识别 · 2 张已选");

  ui("save").click();
  assert.equal(getPickerCalls(), 1);
  await eventually(() => ui("saveStatus").textContent?.includes("本次完成"));
  assert.equal(files.size, 2);
  for (const blob of files.values()) {
    assert.deepEqual(Buffer.from(await blob.arrayBuffer()), png);
  }
  assert.match(ui("saveStatus").textContent, /2\/2 张成功/);
  ui("close").click();
  assert.equal(ui("backdrop").hidden, true);
});

test("retry saves only failed entries and does not duplicate completed files", async () => {
  const { ui, files, getPickerCalls, trigger } = fixture({ failOnceForSecond: true });
  trigger().click();
  await eventually(() => ui("imageList").children.length === 3);
  assert.equal(ui("save").disabled, false);

  ui("save").click();
  await eventually(() => ui("saveStatus").textContent?.includes("2/3 张成功"));
  assert.equal(files.size, 2);
  assert.equal(ui("save").disabled, false);
  assert.equal(ui("save").textContent, "下载已选 1 张");

  ui("save").click();
  await eventually(() => ui("saveStatus").textContent?.includes("1/1 张成功"));
  assert.equal(files.size, 3);
  assert.equal(ui("save").disabled, true);
  assert.equal(getPickerCalls(), 1);
});

test("cancelled directory selection saves nothing and can be retried", async () => {
  const page = fixture({ cancelPickerOnce: true });
  page.trigger().click();
  await eventually(() => page.ui("imageList").children.length === 3);
  page.ui("save").click();
  await eventually(() => page.ui("saveStatus").textContent === "已取消目录选择");
  assert.equal(page.files.size, 0);
  assert.equal(page.ui("save").disabled, false);
  page.ui("save").click();
  await eventually(() => page.ui("saveStatus").textContent?.includes("3/3 张成功"));
  assert.equal(page.getPickerCalls(), 2);
  assert.equal(page.files.size, 3);
});

test("changing image groups while choosing a folder prevents saving the old group", async () => {
  const page = fixture({ changeGalleryDuringPicker: true });
  page.trigger().click();
  await eventually(() => page.ui("imageList").children.length === 3);
  page.ui("save").click();
  await eventually(() => page.ui("saveStatus").textContent?.includes("图片组已变化"));
  assert.equal(page.files.size, 0);
  assert.equal(page.ui("save").disabled, true);
  assert.equal(page.getPickerCalls(), 1);
});

test("panel follows the browser language when no language was saved", async () => {
  const english = fixture({ uiLanguage: "en-GB" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(english.trigger().getAttribute("aria-label"), "Download image group");
  const chinese = fixture({ uiLanguage: "zh-CN" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(chinese.trigger().getAttribute("aria-label"), "批量下载图片");
  const saved = fixture({ uiLanguage: "en-US", storageState: { language: "zh" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved.trigger().getAttribute("aria-label"), "批量下载图片");
});
