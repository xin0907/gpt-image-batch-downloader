(() => {
  const messages = {
    zh: {
      name: "图片批量下载助手 for ChatGPT",
      language: "语言",
      github: "在 GitHub 查看源代码",
      support: "请作者喝杯咖啡",
      methods: "赞赏方式",
      alipay: "支付宝",
      wechat: "微信",
      alipayImage: "支付宝赞赏码",
      wechatImage: "微信赞赏码",
      supportHint: "扫码随意赞赏，完全自愿，不影响任何功能",
      storage: "语言偏好未保存，请重试。"
    },
    en: {
      name: "Image Batch Downloader for ChatGPT",
      language: "Language",
      github: "View source on GitHub",
      support: "Buy me a coffee",
      methods: "Support method",
      alipay: "Alipay",
      wechat: "WeChat",
      alipayImage: "Alipay support QR code",
      wechatImage: "WeChat support QR code",
      supportHint: "Entirely optional. Every feature stays free.",
      storage: "Language preference was not saved. Try again."
    }
  };

  const byId = (id) => document.getElementById(id);
  // Without a saved choice, follow the browser: Chinese for zh-*, English otherwise.
  const defaultLanguage = (() => {
    try {
      const browser = chrome.i18n?.getUILanguage?.() || "";
      return browser && !/^zh/i.test(browser) ? "en" : "zh";
    } catch {
      return "zh";
    }
  })();
  let language = defaultLanguage;
  let languageChosen = false;
  let storageError = false;
  let selectedCode = "alipay";

  function render() {
    const text = messages[language];
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    byId("name").textContent = text.name;
    byId("languageLabel").textContent = text.language;
    byId("githubLink").setAttribute("aria-label", text.github);
    byId("githubLink").title = text.github;
    for (const value of ["zh", "en"]) {
      byId(value).setAttribute("aria-pressed", String(language === value));
    }
    byId("supportLabel").textContent = text.support;
    byId("codeOptions").setAttribute("aria-label", text.methods);
    byId("supportHint").textContent = text.supportHint;
    for (const value of ["alipay", "wechat"]) {
      byId(value).textContent = text[value];
      byId(value).setAttribute("aria-pressed", String(selectedCode === value));
      byId(value + "Image").alt = text[value + "Image"];
      byId(value + "Image").hidden = selectedCode !== value;
    }
    byId("status").hidden = !storageError;
    byId("status").textContent = storageError ? text.storage : "";
  }

  async function chooseLanguage(next) {
    languageChosen = true;
    language = next;
    storageError = false;
    render();
    try {
      await chrome.storage.local.set({ language: next });
    } catch {
      storageError = true;
      render();
    }
  }

  function chooseCode(next) {
    selectedCode = next;
    render();
  }

  byId("zh").addEventListener("click", () => chooseLanguage("zh"));
  byId("en").addEventListener("click", () => chooseLanguage("en"));
  byId("alipay").addEventListener("click", () => chooseCode("alipay"));
  byId("wechat").addEventListener("click", () => chooseCode("wechat"));
  render();

  chrome.storage.local.get("language").then(({ language: saved }) => {
    if (!languageChosen && (saved === "zh" || saved === "en")) {
      language = saved;
      render();
    }
  }).catch(() => {});
})();
