(() => {
  if (globalThis.__batchImageDownloader) return;
  globalThis.__batchImageDownloader = true;

  const Gallery = globalThis.BatchImageGallery;
  const ImageIO = globalThis.BatchImageIO;
  if (!Gallery || !ImageIO) return;

  // Without a saved choice, follow the browser: Chinese for zh-*, English otherwise.
  const defaultLanguage = (() => {
    try {
      const browser = chrome.i18n?.getUILanguage?.() || "";
      return browser && !/^zh/i.test(browser) ? "en" : "zh";
    } catch {
      return "zh";
    }
  })();

  const state = {
    gallery: null,
    galleryUrl: "",
    items: [],
    selected: new Set(),
    results: new Map(),
    directory: null,
    batchPrefix: "",
    previewIndex: -1,
    scanning: false,
    busy: false,
    contextStale: false,
    language: defaultLanguage,
    scanIssue: null,
    saveNotice: null,
    thumbnailSources: new Set(),
    epoch: 0
  };

  const messages = {
    zh: {
      trigger: "批量下载图片", panel: "批量下载图片", close: "关闭",
      switchLanguage: "Switch to English", retry: "重试", selectAll: "全选", selectNone: "全不选",
      preview: "图片预览", closePreview: "关闭预览", previous: "上一张", next: "下一张",
      selectThis: "选择这张", reading: "正在读取…", notReady: "图片列表未就绪",
      counts: (total, selected) => `${total} 张已识别 · ${selected} 张已选`,
      saveButton: (count) => `下载已选${count ? ` ${count} 张` : ""}`,
      imageTitle: (number) => `第 ${String(number).padStart(2, "0")} 张`,
      selectImage: (number) => `选择第 ${number} 张`,
      imagePreview: (number) => `第 ${number} 张预览`,
      previewImage: (number) => `第 ${number} 张图片`,
      previewButton: (number) => `预览第 ${number} 张`,
      previewPosition: (number, total) => `第 ${number} / ${total} 张`,
      clickPreview: "点击预览", unknownDimensions: "尺寸待检测",
      missingGroup: "未找到当前图片组。请打开生成图片或全屏查看器后重试。",
      unresolved: (count) => `有 ${count} 张无法确认大图地址，请稍后重试。`,
      incomplete: "网页尚未加载完整图片组，请稍后重试。",
      noDirectoryPicker: "当前浏览器不支持选择目录",
      readFailed: (error) => `读取图片失败：${formatError(error)}`,
      changedSave: "图片组已变化，请重新打开后下载",
      changedIssue: "当前图片组已变化，请重新打开后重试。",
      cancelledPicker: "已取消目录选择",
      pickerFailed: (error) => `选择目录失败：${formatError(error)}`,
      permissionDenied: "目录写入权限未获准",
      cannotWrite: (error) => `无法写入目录：${formatError(error)}`,
      prepare: (count) => `准备保存 ${count} 张…`,
      fetching: "正在获取与写入…",
      saved: (size) => `已保存 · ${size} MiB`,
      failed: (error) => `失败：${formatError(error)}`,
      progress: (done, total, success) => `已处理 ${done}/${total}，成功 ${success} 张`,
      finished: (success, total) => `本次完成：${success}/${total} 张成功${success < total ? "；可再次点击重试失败项。" : "。"}`,
      leftPage: "当前图片组已离开页面，请重新打开后重试。",
      changedGeneric: "图片组已变化，请重试。"
    },
    en: {
      trigger: "Download image group", panel: "Download image group", close: "Close",
      switchLanguage: "切换为中文", retry: "Retry", selectAll: "Select all", selectNone: "Deselect all",
      preview: "Image preview", closePreview: "Close preview", previous: "Previous image", next: "Next image",
      selectThis: "Select this image", reading: "Loading images…", notReady: "Image list unavailable",
      counts: (total, selected) => `${total} found · ${selected} selected`,
      saveButton: (count) => `Download selected${count ? ` (${count})` : ""}`,
      imageTitle: (number) => `Image ${String(number).padStart(2, "0")}`,
      selectImage: (number) => `Select image ${number}`,
      imagePreview: (number) => `Preview of image ${number}`,
      previewImage: (number) => `Image ${number}`,
      previewButton: (number) => `Preview image ${number}`,
      previewPosition: (number, total) => `Image ${number} / ${total}`,
      clickPreview: "Click to preview", unknownDimensions: "Dimensions unavailable",
      missingGroup: "No image group found. Open a generated image or the full-screen viewer and try again.",
      unresolved: (count) => `Full-size image URLs are unavailable for ${count} images. Try again later.`,
      incomplete: "The full image group has not loaded. Try again later.",
      noDirectoryPicker: "This browser cannot choose a folder",
      readFailed: (error) => `Could not read images: ${formatError(error)}`,
      changedSave: "Image group changed. Reopen it before downloading.",
      changedIssue: "Image group changed. Reopen it and try again.",
      cancelledPicker: "Folder selection cancelled",
      pickerFailed: (error) => `Could not choose a folder: ${formatError(error)}`,
      permissionDenied: "Folder write permission was denied",
      cannotWrite: (error) => `Could not write to the folder: ${formatError(error)}`,
      prepare: (count) => `Preparing to save ${count} images…`,
      fetching: "Fetching and saving…",
      saved: (size) => `Saved · ${size} MiB`,
      failed: (error) => `Failed: ${formatError(error)}`,
      progress: (done, total, success) => `Processed ${done}/${total} · ${success} saved`,
      finished: (success, total) => `Finished: ${success}/${total} saved${success < total ? ". Click again to retry failed images." : "."}`,
      leftPage: "The image group is no longer on this page. Reopen it and try again.",
      changedGeneric: "Image group changed. Try again."
    }
  };

  function formatError(error) {
    if (error?.bgiKey) return t(error.bgiKey);
    let detail = String(error?.message || error);
    if (state.language === "zh") return detail;
    const equivalents = [
      ["图片文件为空", "Image file is empty"],
      ["单张图片超过 24 MiB 限制", "An image exceeds the 24 MiB limit"],
      ["获取到的内容不是受支持的图片文件", "The response is not a supported image"],
      ["页面请求返回 HTTP", "Page request returned HTTP"],
      ["扩展请求返回 HTTP", "Extension request returned HTTP"],
      ["扩展请求失败", "Extension request failed"],
      ["图片地址不在允许的 ChatGPT 资源域名内", "Image URL is outside allowed ChatGPT domains"],
      ["目录中没有可用文件名", "No available filename in the folder"],
      ["目录写入权限未获准", "Folder write permission was denied"],
      ["图片列表已离开页面，请重新打开图片组", "The image list left the page; reopen the group"],
      ["图片组已变化，请重试", "Image group changed; try again"]
    ];
    for (const [source, target] of equivalents) detail = detail.replaceAll(source, target);
    return detail.replaceAll("；", "; ");
  }

  function t(key, ...args) {
    const message = messages[state.language][key];
    return typeof message === "function" ? message(...args) : message;
  }

  const host = document.createElement("div");
  host.id = "bgi-extension-root";
  const shadow = host.attachShadow({ mode: "open" });
  const stylesheet = '<link rel="stylesheet" href="' + chrome.runtime.getURL("panel.css") + '">';
  shadow.innerHTML = [
    stylesheet,
    '<div id="backdrop" class="backdrop" hidden>',
    '  <section id="panel" class="panel" role="dialog" aria-modal="true" aria-label="批量下载图片">',
    '    <section class="section selection-section">',
    '      <div class="section-head">',
    '        <strong id="counts">0 张</strong>',
    '        <div class="header-actions">',
    '          <button id="language" type="button" class="language-toggle" aria-label="Switch to English" title="Switch to English">EN</button>',
    '          <button id="close" type="button" class="icon-button" aria-label="关闭">×</button>',
    '        </div>',
    '      </div>',
    '      <div id="scanIssue" class="scan-issue" role="status" hidden>',
    '        <span id="scanIssueText"></span>',
    '        <button id="retry" type="button">重试</button>',
    '      </div>',
    '      <div id="selectToolbar" class="toolbar">',
    '        <button id="selectAll" type="button">全选</button>',
    '        <button id="selectNone" type="button">全不选</button>',
    '      </div>',
    '      <div id="imageList" class="image-list"></div>',
    '    </section>',
    '    <footer id="saveFooter" class="panel-foot">',
    '      <span id="saveStatus" role="status" hidden></span>',
    '      <button id="save" type="button" class="primary" disabled>下载已选</button>',
    '    </footer>',
    '  </section>',
    '  <div id="preview" class="preview-overlay" hidden>',
    '    <section id="previewDialog" class="preview-dialog" role="dialog" aria-modal="true" aria-label="图片预览">',
    '      <button id="previewClose" type="button" class="icon-button preview-close" aria-label="关闭预览">',
    '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
    '      </button>',
    '      <button id="previewPrev" type="button" class="preview-nav preview-prev" aria-label="上一张"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>',
    '      <div class="preview-stage"><img id="previewImage" alt=""></div>',
    '      <button id="previewNext" type="button" class="preview-nav preview-next" aria-label="下一张"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>',
    '      <div class="preview-footer">',
    '        <span id="previewPosition" class="preview-position"></span>',
    '        <label class="preview-select"><input id="previewSelected" type="checkbox"><span id="previewSelectText">选择这张</span></label>',
    '      </div>',
    '    </section>',
    '  </div>',
    '</div>'
  ].join("");
  (document.body || document.documentElement).append(host);

  const triggerHost = document.createElement("span");
  triggerHost.id = "bgi-trigger-root";
  triggerHost.hidden = true;
  const triggerShadow = triggerHost.attachShadow({ mode: "open" });
  triggerShadow.innerHTML = [
    stylesheet,
    '<button id="trigger" type="button" aria-label="批量下载图片" title="批量下载图片">',
    '  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '    <path d="M5 3h11a2 2 0 0 1 2 2v3"/>',
    '    <rect x="2.5" y="6.5" width="13" height="13" rx="2"/>',
    '    <path d="m5.5 16 3-3 2 2 2-2"/>',
    '    <path d="M20 11v9m-3-3 3 3 3-3"/>',
    '  </svg>',
    '</button>'
  ].join("");
  (document.body || document.documentElement).append(triggerHost);

  const ui = (id) => shadow.getElementById(id);
  const trigger = triggerShadow.getElementById("trigger");
  let contextTimer;
  let languageChosen = false;
  const pageKey = () => location.origin + location.pathname;

  function paintMessages() {
    ui("scanIssueText").textContent = state.scanIssue
      ? t(state.scanIssue.key, ...state.scanIssue.args) : "";
    const saveStatus = ui("saveStatus");
    saveStatus.hidden = !state.saveNotice;
    saveStatus.textContent = state.saveNotice
      ? t(state.saveNotice.key, ...state.saveNotice.args) : "";
  }

  function applyLanguage() {
    host.lang = state.language;
    triggerHost.lang = state.language;
    trigger.setAttribute("aria-label", t("trigger"));
    trigger.title = t("trigger");
    ui("panel").setAttribute("aria-label", t("panel"));
    ui("close").setAttribute("aria-label", t("close"));
    ui("language").textContent = state.language === "zh" ? "EN" : "中文";
    ui("language").setAttribute("aria-label", t("switchLanguage"));
    ui("language").title = t("switchLanguage");
    for (const [id, key] of [["retry", "retry"], ["selectAll", "selectAll"],
                             ["selectNone", "selectNone"], ["previewSelectText", "selectThis"]]) {
      ui(id).textContent = t(key);
    }
    for (const [id, key] of [["previewDialog", "preview"], ["previewClose", "closePreview"],
                             ["previewPrev", "previous"], ["previewNext", "next"]]) {
      ui(id).setAttribute("aria-label", t(key));
    }
    paintMessages();
    renderItems();
    if (state.previewIndex >= 0) updatePreview();
  }

  function setLanguage(language, persist = false) {
    if (language !== "zh" && language !== "en") return;
    if (language !== state.language) {
      state.language = language;
      applyLanguage();
    }
    if (persist) {
      try { chrome.storage?.local?.set({ language })?.catch?.(() => {}); } catch { /* Page remains usable. */ }
    }
  }

  function pageTheme(anchor) {
    const html = document.documentElement;
    const body = document.body;
    if (html.classList?.contains?.("dark") || body?.classList?.contains?.("dark") ||
        html.getAttribute?.("data-theme") === "dark" ||
        body?.getAttribute?.("data-theme") === "dark") return "dark";
    if (html.classList?.contains?.("light") || body?.classList?.contains?.("light") ||
        html.getAttribute?.("data-theme") === "light" ||
        body?.getAttribute?.("data-theme") === "light") return "light";
    const nodes = [body, html];
    for (let node = anchor; node && node !== body && node !== html; node = node.parentElement) {
      nodes.push(node);
    }
    for (const node of nodes) {
      if (!node) continue;
      const color = getComputedStyle(node).backgroundColor || "";
      const values = color.match(/[\d.]+/g)?.map(Number) || [];
      if (values.length < 3 || (values.length > 3 && values[3] < 0.8)) continue;
      const brightness = values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      return brightness < 128 ? "dark" : "light";
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  function applyTheme(anchor) {
    const theme = pageTheme(anchor);
    host.dataset.theme = theme;
    triggerHost.dataset.theme = theme;
  }

  function selectedPending() {
    return state.items.filter((item) => state.selected.has(item.id) && state.results.get(item.id)?.kind !== "ok");
  }

  function canSave() {
    return !state.busy && !state.scanning && Boolean(state.directory || window.showDirectoryPicker) &&
      selectedPending().length > 0 &&
      !state.contextStale && Boolean(state.gallery?.rail?.isConnected) &&
      state.galleryUrl === pageKey();
  }

  function updateControls() {
    const selected = state.selected.size;
    const ready = !state.scanning && !state.contextStale && state.items.length > 0;
    ui("counts").textContent = state.scanning ? t("reading") :
      state.contextStale && !state.items.length ? t("notReady") :
        t("counts", state.items.length, selected);
    for (const id of ["selectToolbar", "imageList", "saveFooter"]) {
      ui(id).hidden = !ready;
    }
    ui("retry").disabled = state.scanning || state.busy;
    ui("selectAll").disabled = state.scanning || state.busy || !state.items.length;
    ui("selectNone").disabled = state.scanning || state.busy || !state.items.length;
    ui("save").disabled = !canSave();
    ui("save").textContent = t("saveButton", selectedPending().length);
  }

  function showScanIssue(key, ...args) {
    state.scanIssue = { key, args };
    paintMessages();
    ui("scanIssue").hidden = false;
  }

  function clearScanIssue() {
    state.scanIssue = null;
    ui("scanIssue").hidden = true;
    ui("scanIssueText").textContent = "";
  }

  function setSaveStatus(key, ...args) {
    state.saveNotice = key ? { key, args } : null;
    paintMessages();
  }

  function closePreview() {
    const index = state.previewIndex;
    const wasVisible = !ui("preview").hidden;
    ui("preview").hidden = true;
    ui("panel").inert = false;
    state.previewIndex = -1;
    ui("previewImage").removeAttribute("src");
    if (wasVisible && !ui("backdrop").hidden) {
      ui("imageList").children[index]?.children[1]?.focus?.();
    }
  }

  function updatePreview() {
    const index = state.previewIndex;
    const item = state.items[index];
    if (!item) return closePreview();
    const image = ui("previewImage");
    if (image.src !== item.source) image.src = item.source;
    image.alt = t("previewImage", index + 1);
    ui("previewPosition").textContent = t("previewPosition", index + 1, state.items.length);
    ui("previewPrev").disabled = index === 0;
    ui("previewNext").disabled = index === state.items.length - 1;
    ui("previewSelected").checked = state.selected.has(item.id);
    ui("previewSelected").disabled = state.scanning || state.busy;
  }

  function openPreview(index) {
    if (!state.items[index]) return;
    state.previewIndex = index;
    ui("panel").inert = true;
    ui("preview").hidden = false;
    updatePreview();
    ui("previewClose").focus?.();
  }

  function renderItems() {
    const list = ui("imageList");
    const scroll = list.scrollTop;
    list.replaceChildren();
    for (const [index, item] of state.items.entries()) {
      const card = document.createElement("div");
      card.className = "image-card";
      const selection = document.createElement("label");
      selection.className = "card-select";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.id = "bgi-select-" + index;
      check.setAttribute("aria-label", t("selectImage", index + 1));
      check.checked = state.selected.has(item.id);
      check.disabled = state.scanning || state.busy;
      check.addEventListener("change", () => {
        if (check.checked) state.selected.add(item.id);
        else state.selected.delete(item.id);
        updateControls();
      });
      const image = document.createElement("img");
      image.src = item.thumbnailSource || item.source;
      image.alt = t("imagePreview", index + 1);
      image.loading = "lazy";
      image.addEventListener("error", () => {
        if (image.src !== item.source) image.src = item.source;
      }, { once: true });
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.className = "preview-button";
      previewButton.title = t("clickPreview");
      previewButton.setAttribute("aria-label", t("previewButton", index + 1));
      previewButton.append(image);
      previewButton.addEventListener("click", () => openPreview(index));
      const body = document.createElement("span");
      body.className = "image-info";
      const title = document.createElement("strong");
      title.textContent = t("imageTitle", index + 1);
      const dimensions = document.createElement("small");
      dimensions.textContent = item.naturalWidth && item.naturalHeight
        ? item.naturalWidth + "×" + item.naturalHeight : t("unknownDimensions");
      const result = state.results.get(item.id);
      body.append(title, dimensions);
      if (result) {
        const status = document.createElement("small");
        status.className = "image-status";
        status.textContent = t(result.statusKey, ...(result.statusArgs || []));
        if (result.kind === "fail") status.classList.add("error");
        if (result.kind === "ok") status.classList.add("success");
        body.append(status);
      }
      selection.append(check, body);
      card.append(selection, previewButton);
      card.addEventListener("click", (event) => {
        if (check.disabled || selection.contains(event.target) ||
            previewButton.contains(event.target)) return;
        check.click();
      });
      list.append(card);
    }
    list.scrollTop = scroll;
    updateControls();
  }

  async function scanCurrent() {
    if (state.scanning || state.busy) return;
    closePreview();
    state.directory = null;
    const gallery = discoverCurrentGallery();
    if (!gallery) {
      state.contextStale = true;
      state.items = [];
      state.selected.clear();
      showScanIssue("missingGroup");
      setSaveStatus("");
      renderItems();
      return;
    }
    state.scanning = true;
    state.epoch += 1;
    const epoch = state.epoch;
    state.gallery = gallery;
    state.galleryUrl = pageKey();
    state.contextStale = false;
    state.thumbnailSources.clear();
    state.items = [];
    state.selected.clear();
    state.results.clear();
    state.batchPrefix = "";
    setSaveStatus("");
    clearScanIssue();
    renderItems();
    try {
      const result = await Gallery.scan(gallery);
      if (epoch !== state.epoch) return;
      if (!gallery.rail.isConnected || state.galleryUrl !== pageKey() ||
          discoverCurrentGallery()?.rail !== gallery.rail) throw new Error("图片组已变化，请重试");
      // A scrollable rail can leave trailing space that looks like unloaded
      // thumbnails. Every image found here has a confirmed full-size source,
      // so list them without an extra warning.
      if (result.unresolved || !result.items.length) {
        state.contextStale = true;
        setSaveStatus("");
        if (result.unresolved) showScanIssue("unresolved", result.unresolved);
        else showScanIssue("incomplete");
        return;
      }
      state.items = result.items;
      state.selected = new Set(result.items.map((item) => item.id));
      state.thumbnailSources = new Set(result.thumbnailSources);
      setSaveStatus(window.showDirectoryPicker ? "" : "noDirectoryPicker");
    } catch (error) {
      state.contextStale = true;
      setSaveStatus("");
      showScanIssue("readFailed", error);
    } finally {
      state.scanning = false;
      renderItems();
    }
  }

  function batchPrefix() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const timestamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" +
      pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    return "chatgpt-series-" + timestamp + "-" + crypto.randomUUID().slice(0, 8);
  }

  async function saveSelected() {
    if (!canSave()) return;
    const epoch = state.epoch;
    const rail = state.gallery.rail;
    const url = state.galleryUrl;
    const contextIsCurrent = () => epoch === state.epoch && !state.contextStale &&
      rail.isConnected && url === pageKey() && discoverCurrentGallery()?.rail === rail;
    const showChangedGallery = () => {
      state.contextStale = true;
      state.directory = null;
      setSaveStatus("changedSave");
      showScanIssue("changedIssue");
    };
    state.busy = true;
    updateControls();
    let directory = state.directory;
    if (!directory) {
      try {
        // Call the picker during the download click, before the first await.
        const picker = window.showDirectoryPicker({ mode: "readwrite" });
        directory = await picker;
        if (!contextIsCurrent()) {
          showChangedGallery();
          return;
        }
        state.directory = directory;
      } catch (error) {
        if (error.name === "AbortError") setSaveStatus("cancelledPicker");
        else setSaveStatus("pickerFailed", error);
        return;
      } finally {
        if (!state.directory) {
          state.busy = false;
          updateControls();
        }
      }
    }
    try {
      const permission = await directory.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        throw Object.assign(new Error("directory-permission-denied"), { bgiKey: "permissionDenied" });
      }
    } catch (error) {
      setSaveStatus("cannotWrite", error);
      state.directory = null;
      state.busy = false;
      updateControls();
      return;
    }
    if (!contextIsCurrent()) {
      showChangedGallery();
      state.busy = false;
      updateControls();
      return;
    }
    const batch = state.items.map((item, index) => ({ item, index }))
      .filter(({ item }) => state.selected.has(item.id) && state.results.get(item.id)?.kind !== "ok");
    if (!batch.length) {
      state.busy = false;
      updateControls();
      return;
    }
    if (!state.batchPrefix) state.batchPrefix = batchPrefix();
    const prefix = state.batchPrefix;
    let cursor = 0;
    let completed = 0;
    let successes = 0;
    setSaveStatus("prepare", batch.length);
    renderItems();
    try {
      async function worker() {
        while (cursor < batch.length) {
          const { item, index } = batch[cursor++];
          state.results.set(item.id, { statusKey: "fetching" });
          renderItems();
          try {
            const blob = await ImageIO.fetchImage(item.source);
            const base = prefix + "-" + String(index + 1).padStart(3, "0");
            const saved = await ImageIO.saveBlob(directory, blob, base);
            state.results.set(item.id, {
              kind: "ok", filename: saved.filename,
              statusKey: "saved", statusArgs: [(saved.size / 1024 / 1024).toFixed(2)]
            });
            successes += 1;
          } catch (error) {
            state.results.set(item.id, { kind: "fail", statusKey: "failed", statusArgs: [error] });
          }
          completed += 1;
          setSaveStatus("progress", completed, batch.length, successes);
          renderItems();
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, batch.length) }, worker));
      setSaveStatus("finished", successes, batch.length);
    } finally {
      state.busy = false;
      renderItems();
    }
  }

  function setOpen(open) {
    ui("backdrop").hidden = !open;
    if (!open) {
      closePreview();
      return;
    }
    const gallery = discoverCurrentGallery();
    if (!gallery) {
      state.contextStale = true;
      state.items = [];
      state.selected.clear();
      showScanIssue("missingGroup");
      setSaveStatus("");
      renderItems();
      return;
    }
    if (!state.gallery || state.gallery.rail !== gallery.rail || state.galleryUrl !== pageKey() ||
        state.contextStale || !state.items.length) {
      scanCurrent();
    }
  }

  function actionRowFor(gallery) {
    const railBox = gallery.rail.getBoundingClientRect();
    const groupBottom = Math.max(gallery.hero.rect.bottom, railBox.bottom);
    const groupLeft = Math.min(gallery.hero.rect.left, railBox.left);
    let scope = gallery.root;
    for (let depth = 0; scope && depth < 5 &&
         scope !== document.body && scope !== document.documentElement;
         depth += 1, scope = scope.parentElement) {
      const buttons = [...scope.querySelectorAll("button,[role='button']")].filter((button) => {
        const box = button.getBoundingClientRect();
        if (box.width < 8 || box.width > 52 || box.height < 8 || box.height > 52 ||
            box.top < groupBottom - 4 || box.top > groupBottom + 90 ||
            box.left < groupLeft - 25 || box.left > groupLeft + 230) return false;
        for (let node = button; node && node !== scope; node = node.parentElement) {
          if (["fixed", "sticky"].includes(getComputedStyle(node).position)) return false;
        }
        return true;
      }).sort((a, b) =>
        a.getBoundingClientRect().top - b.getBoundingClientRect().top ||
        a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      if (buttons.length < 2) continue;
      for (let row = buttons[0].parentElement; row && row !== scope; row = row.parentElement) {
        const box = row.getBoundingClientRect();
        if (box.height <= 70 && box.width <= 400 && box.top >= groupBottom - 8 &&
            buttons.filter((button) => row.contains(button)).length >= 2) return row;
      }
    }
    return null;
  }

  function placeGenerationTrigger(gallery) {
    const row = actionRowFor(gallery);
    if (row) {
      if (triggerHost.parentElement !== row) row.append(triggerHost);
      triggerHost.dataset.placement = "generation";
      return true;
    }
    let anchor = gallery.root;
    if (!anchor || anchor === document.body || anchor === document.documentElement) return false;
    for (let depth = 0; depth < 3; depth += 1) {
      const parent = anchor.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      const style = getComputedStyle(parent);
      if ((style.display.includes("flex") && style.flexDirection.startsWith("row")) ||
          style.display.includes("grid")) anchor = parent;
      else break;
    }
    if (anchor.nextElementSibling !== triggerHost) anchor.after(triggerHost);
    triggerHost.dataset.placement = "generation-fallback";
    return true;
  }

  function viewerToolbar(includeFallback = false) {
    const elements = document.querySelectorAll("button, [role='button']");
    const topRightControl = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 24 || rect.width > 120 || rect.height < 24 || rect.height > 56 ||
          rect.top < -4 || rect.bottom > 72 ||
          rect.left <= innerWidth * 0.55 || rect.right > innerWidth) return null;
      const style = getComputedStyle(element);
      return style.display === "none" || style.visibility === "hidden"
        ? null : { element, rect };
    };
    for (const element of elements) {
      if (!/\d{1,3}\s*%/.test((element.textContent || "") + " " +
          (element.getAttribute?.("aria-label") || ""))) continue;
      const zoom = topRightControl(element);
      if (zoom) return { controls: [zoom], zoom };
    }
    if (!includeFallback) return { controls: [], zoom: null };
    const controls = [...elements].map(topRightControl).filter(Boolean)
      .sort((a, b) => a.rect.left - b.rect.left);
    return { controls, zoom: null };
  }

  function discoverCurrentGallery(toolbar = viewerToolbar()) {
    return Gallery.discover(toolbar.zoom ? { preferMode: "viewer" } : undefined);
  }

  function placeViewerTrigger(toolbar = viewerToolbar(true)) {
    const container = document.body || document.documentElement;
    if (triggerHost.parentElement !== container) container.append(triggerHost);
    triggerHost.dataset.placement = "viewer-toolbar";
    const anchor = toolbar.zoom || toolbar.controls[0];
    const left = anchor ? anchor.rect.left - 44 : innerWidth - 280;
    const top = anchor ? anchor.rect.top + (anchor.rect.height - 36) / 2 : 8;
    triggerHost.style.left = Math.max(8, Math.min(innerWidth - 44, left)) + "px";
    triggerHost.style.top = Math.max(8, Math.min(innerHeight - 44, top)) + "px";
    return true;
  }

  function refreshContext() {
    const container = document.body || document.documentElement;
    if (!host.isConnected) container.append(host);
    if (!triggerHost.isConnected) container.append(triggerHost);
    if (state.scanning) {
      applyTheme(state.gallery?.root);
      return;
    }
    const toolbar = viewerToolbar();
    const gallery = discoverCurrentGallery(toolbar);
    applyTheme(gallery?.root);
    if (!gallery) {
      triggerHost.hidden = !toolbar.zoom;
      if (toolbar.zoom) placeViewerTrigger(toolbar);
      if (!ui("backdrop").hidden && state.gallery) {
        state.contextStale = true;
        showScanIssue("leftPage");
        setSaveStatus("");
        updateControls();
      }
      return;
    }
    triggerHost.hidden = toolbar.zoom || gallery.mode === "viewer"
      ? !placeViewerTrigger(toolbar.zoom ? toolbar : viewerToolbar(true))
      : !placeGenerationTrigger(gallery);
    if (!ui("backdrop").hidden && state.gallery &&
        (!state.gallery.rail.isConnected || state.gallery.rail !== gallery.rail ||
         state.galleryUrl !== pageKey() ||
         (!state.contextStale && state.items.length &&
           Gallery.thumbsInRail(gallery.rail).some((thumb) =>
             !state.thumbnailSources.has(thumb.currentSrc || thumb.src))))) {
      state.contextStale = true;
      showScanIssue("changedGeneric");
      setSaveStatus("");
      updateControls();
    }
  }

  function scheduleContext() {
    if (contextTimer) return;
    contextTimer = setTimeout(() => {
      contextTimer = undefined;
      refreshContext();
    }, 250);
  }

  trigger.addEventListener("click", () => setOpen(true));
  ui("close").addEventListener("click", () => setOpen(false));
  ui("language").addEventListener("click", () => {
    languageChosen = true;
    setLanguage(state.language === "zh" ? "en" : "zh", true);
  });
  ui("backdrop").addEventListener("click", (event) => {
    if (event.target === ui("backdrop")) setOpen(false);
  });
  ui("retry").addEventListener("click", scanCurrent);
  ui("selectAll").addEventListener("click", () => {
    state.selected = new Set(state.items.map((item) => item.id));
    renderItems();
  });
  ui("selectNone").addEventListener("click", () => {
    state.selected.clear();
    renderItems();
  });
  ui("save").addEventListener("click", saveSelected);
  ui("previewClose").addEventListener("click", closePreview);
  ui("preview").addEventListener("click", (event) => {
    if (event.target === ui("preview")) closePreview();
  });
  ui("previewPrev").addEventListener("click", () => {
    state.previewIndex -= 1;
    updatePreview();
  });
  ui("previewNext").addEventListener("click", () => {
    state.previewIndex += 1;
    updatePreview();
  });
  ui("previewSelected").addEventListener("change", () => {
    const item = state.items[state.previewIndex];
    if (!item || state.busy) return;
    if (ui("previewSelected").checked) state.selected.add(item.id);
    else state.selected.delete(item.id);
    renderItems();
    updatePreview();
  });
  host.addEventListener("click", (event) => event.stopPropagation());
  triggerHost.addEventListener("click", (event) => event.stopPropagation());
  window.addEventListener("wheel", (event) => {
    const list = ui("imageList");
    if (event.ctrlKey || list.hidden || !event.composedPath?.().includes(list)) return;
    const factor = event.deltaMode === 1 ? 16 :
      event.deltaMode === 2 ? list.clientHeight : 1;
    list.scrollTop += event.deltaY * factor;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  // Capture phase so the page's own shortcuts (close viewer, switch image)
  // do not also react while the panel is open.
  document.addEventListener("keydown", (event) => {
    if (ui("backdrop").hidden) return;
    const previewOpen = !ui("preview").hidden;
    if (event.key === "Escape") {
      if (previewOpen) closePreview();
      else setOpen(false);
    } else if (previewOpen && event.key === "ArrowLeft") {
      if (state.previewIndex > 0) {
        state.previewIndex -= 1;
        updatePreview();
      }
    } else if (previewOpen && event.key === "ArrowRight") {
      if (state.previewIndex < state.items.length - 1) {
        state.previewIndex += 1;
        updatePreview();
      }
    } else return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }, true);

  const observer = new MutationObserver(scheduleContext);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"]
  });
  const themeObserver = new MutationObserver(scheduleContext);
  const themeAttributes = { attributes: true, attributeFilter: ["class", "style", "data-theme"] };
  themeObserver.observe(document.documentElement, themeAttributes);
  if (document.body) themeObserver.observe(document.body, themeAttributes);
  document.addEventListener("load", (event) => {
    if (event.target?.tagName === "IMG" &&
        (triggerHost.hidden || triggerHost.dataset.placement !== "viewer-toolbar" ||
          state.gallery?.mode !== "viewer")) scheduleContext();
  }, true);
  window.addEventListener("resize", scheduleContext);
  document.addEventListener("scroll", scheduleContext, true);
  applyLanguage();
  refreshContext();
  try {
    chrome.storage?.local?.get("language")?.then?.(({ language }) => {
      if (!languageChosen) setLanguage(language);
    }).catch?.(() => {});
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area === "local" && changes.language?.newValue) {
        setLanguage(changes.language.newValue);
      }
    });
  } catch { /* Language switching still works for this page. */ }
})();
