(() => {
  if (globalThis.BatchImageIO) return;

  const maxBytes = 24 * 1024 * 1024;

  function fromBase64(base64, mime) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime || "application/octet-stream" });
  }

  async function normalizeImage(blob) {
    if (!blob.size) throw new Error("图片文件为空");
    if (blob.size > maxBytes) throw new Error("单张图片超过 24 MiB 限制");
    const bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
    const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
    let mime = "";
    if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") mime = "image/png";
    else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = "image/jpeg";
    else if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") mime = "image/webp";
    else if (ascii(0, 3) === "GIF") mime = "image/gif";
    else if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) mime = "image/avif";
    else if (ascii(0, 2) === "BM") mime = "image/bmp";
    else if (ascii(0, 4) === "II*\0" || ascii(0, 4) === "MM\0*") mime = "image/tiff";
    if (!mime) throw new Error("获取到的内容不是受支持的图片文件");
    return blob.type.split(";")[0].toLowerCase() === mime ? blob : new Blob([blob], { type: mime });
  }

  async function fetchFromPage(source) {
    const url = new URL(source, location.href);
    const credentials = url.origin === location.origin ? "include" : "omit";
    const response = await fetch(source, { credentials });
    if (!response.ok) throw new Error("页面请求返回 HTTP " + response.status);
    return normalizeImage(await response.blob());
  }

  async function fetchFromExtension(source) {
    const reply = await chrome.runtime.sendMessage({ type: "FETCH_REMOTE_IMAGE", source });
    if (!reply?.ok) throw new Error(reply?.error || "扩展请求失败");
    return normalizeImage(fromBase64(reply.base64, reply.mime));
  }

  async function fetchImage(source) {
    const protocol = new URL(source, location.href).protocol;
    const methods = protocol === "https:" ? [fetchFromPage, fetchFromExtension] : [fetchFromPage];
    const errors = [];
    for (const method of methods) {
      try {
        return await method(source);
      } catch (error) {
        errors.push(error.message);
      }
    }
    throw new Error(errors.join("；"));
  }

  function extensionForMime(mime) {
    return ({
      "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
      "image/gif": "gif", "image/avif": "avif", "image/bmp": "bmp",
      "image/tiff": "tiff"
    })[mime] || "img";
  }

  async function uniqueFilename(directory, base, extension) {
    for (let copy = 0; copy < 1000; copy += 1) {
      const filename = base + (copy ? "-" + copy : "") + "." + extension;
      try {
        await directory.getFileHandle(filename);
      } catch (error) {
        if (error.name === "NotFoundError") return filename;
        if (error.name !== "TypeMismatchError") throw error;
      }
    }
    throw new Error("目录中没有可用文件名");
  }

  async function saveBlob(directory, blob, base) {
    const filename = await uniqueFilename(directory, base, extensionForMime(blob.type));
    const handle = await directory.getFileHandle(filename, { create: true });
    let writable;
    try {
      writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { filename, size: blob.size };
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      await directory.removeEntry(filename).catch(() => {});
      throw error;
    }
  }

  globalThis.BatchImageIO = Object.freeze({ fetchImage, saveBlob });
})();
