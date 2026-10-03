(() => {
  const messages = {
    zh: {
      name: "图片批量下载",
      language: "语言",
      email: "邮箱",
      support: "赞赏码",
      methods: "赞赏方式",
      alipay: "支付宝",
      wechat: "微信",
      alipayImage: "支付宝赞赏码",
      wechatImage: "微信赞赏码",
      alipayLink: "查看支付宝赞赏码原图",
      wechatLink: "查看微信赞赏码原图",
      enlarge: "点击图片放大扫码",
      storage: "语言偏好未保存，请重试。"
    },
    en: {
      name: "Batch download images",
      language: "Language",
      email: "Email",
      support: "Support",
      methods: "Support method",
      alipay: "Alipay",
      wechat: "WeChat",
      alipayImage: "Alipay support QR code",
      wechatImage: "WeChat support QR code",
      alipayLink: "Open full-size Alipay QR code",
      wechatLink: "Open full-size WeChat QR code",
      enlarge: "Click the image to enlarge for scanning",
      storage: "Language preference was not saved. Try again."
    }
  };

  const byId = (id) => document.getElementById(id);
  let language = "zh";
  let languageChosen = false;
  let selectedCode = "alipay";
  let storageError = false;

  function render() {
    const text = messages[language];
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    byId("name").textContent = text.name;
    byId("languageLabel").textContent = text.language;
    byId("emailLabel").textContent = text.email;
    byId("supportLabel").textContent = text.support;
    byId("codeOptions").setAttribute("aria-label", text.methods);
    byId("alipay").textContent = text.alipay;
    byId("wechat").textContent = text.wechat;
    byId("alipayImage").alt = text.alipayImage;
    byId("wechatImage").alt = text.wechatImage;
    byId("alipayLink").setAttribute("aria-label", text.alipayLink);
    byId("wechatLink").setAttribute("aria-label", text.wechatLink);
    byId("enlargeHint").textContent = text.enlarge;
    for (const value of ["zh", "en"]) {
      byId(value).setAttribute("aria-pressed", String(language === value));
    }
    for (const value of ["alipay", "wechat"]) {
      byId(value).setAttribute("aria-pressed", String(selectedCode === value));
      byId(value + "Code").hidden = selectedCode !== value;
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
