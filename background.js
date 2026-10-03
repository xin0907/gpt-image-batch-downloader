const MAX_IMAGE_BYTES = 24 * 1024 * 1024;

function allowedImageUrl(source) {
  try {
    const url = new URL(source);
    const host = url.hostname;
    return url.protocol === "https:" && (
      host === "chatgpt.com" || host === "chat.openai.com" ||
      host === "oaiusercontent.com" || host.endsWith(".oaiusercontent.com") ||
      host === "oaistatic.com" || host.endsWith(".oaistatic.com")
    );
  } catch {
    return false;
  }
}

function fromChatGpt(sender) {
  const source = sender.url || sender.tab?.url || "";
  return source.startsWith("https://chatgpt.com/") || source.startsWith("https://chat.openai.com/");
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let result = "";
  const step = 24_576;
  for (let offset = 0; offset < bytes.length; offset += step) {
    result += btoa(String.fromCharCode(...bytes.subarray(offset, offset + step)));
  }
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "FETCH_REMOTE_IMAGE") return false;
  if (!fromChatGpt(sender) || !allowedImageUrl(message.source)) {
    sendResponse({ ok: false, error: "图片地址不在允许的 ChatGPT 资源域名内" });
    return false;
  }
  (async () => {
    const response = await fetch(message.source, { credentials: "include" });
    if (!response.ok) throw new Error("扩展请求返回 HTTP " + response.status);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_IMAGE_BYTES) throw new Error("单张图片超过 24 MiB 限制");
    const blob = await response.blob();
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("单张图片超过 24 MiB 限制");
    return { ok: true, mime: blob.type, base64: toBase64(await blob.arrayBuffer()) };
  })().then(sendResponse, (error) => sendResponse({ ok: false, error: String(error.message || error) }));
  return true;
});
