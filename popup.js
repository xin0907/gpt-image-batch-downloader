(() => {
  const messages = {
    zh: {
      name: "图片批量下载",
      language: "语言",
      github: "在 GitHub 查看源代码",
      storage: "语言偏好未保存，请重试。"
    },
    en: {
      name: "Batch download images",
      language: "Language",
      github: "View source on GitHub",
      storage: "Language preference was not saved. Try again."
    }
  };

  const byId = (id) => document.getElementById(id);
  let language = "zh";
  let languageChosen = false;
  let storageError = false;

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

  byId("zh").addEventListener("click", () => chooseLanguage("zh"));
  byId("en").addEventListener("click", () => chooseLanguage("en"));
  render();

  chrome.storage.local.get("language").then(({ language: saved }) => {
    if (!languageChosen && (saved === "zh" || saved === "en")) {
      language = saved;
      render();
    }
  }).catch(() => {});
})();
