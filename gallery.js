(() => {
  if (globalThis.BatchImageGallery) return;

  function sourceOf(image) {
    return image?.currentSrc || image?.src || image?.getAttribute?.("src") || "";
  }

  function usableSource(value) {
    if (!value || value.length > 2_000_000) return false;
    try {
      return ["https:", "blob:", "data:"].includes(new URL(value, location.href).protocol);
    } catch {
      return false;
    }
  }

  function visible(rect) {
    return rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
  }

  function imageIsHero(image) {
    if (image.closest?.("#bgi-extension-root")) return false;
    const rect = image.getBoundingClientRect();
    // Portrait images on a zoomed page or a small screen can be narrower than
    // 240 CSS px. Thumbnails never exceed 165 px on either side.
    return Math.max(rect.width, rect.height) >= 240 && Math.min(rect.width, rect.height) >= 120 &&
      visible(rect) && usableSource(sourceOf(image));
  }

  function findHero(root = document) {
    const images = root.images ? [...root.images] : [...root.querySelectorAll("img")];
    let best = null;
    for (const image of images) {
      if (!imageIsHero(image)) continue;
      const rect = image.getBoundingClientRect();
      const center = (rect.left + rect.right) / 2;
      const centerY = (rect.top + rect.bottom) / 2;
      const stack = document.elementsFromPoint?.(center, centerY);
      const hit = stack ? stack.find((element) =>
        element !== document.body && element !== document.documentElement &&
        element.id !== "bgi-extension-root" &&
        element.getRootNode?.().host?.id !== "bgi-extension-root")
        : document.elementFromPoint?.(center, centerY);
      const inFront = hit && (hit === image || image.contains?.(hit) || hit.contains?.(image));
      const score = rect.width * rect.height *
        (center > innerWidth * 0.2 && center < innerWidth * 0.85 ? 1.25 : 1) *
        (inFront ? 10 : 1);
      if (!best || score > best.score) best = { image, rect, source: sourceOf(image), score };
    }
    return best;
  }

  function thumbnailRect(image) {
    const rect = image.getBoundingClientRect();
    return rect.width >= 24 && rect.width <= 165 &&
      rect.height >= 24 && rect.height <= 165 && usableSource(sourceOf(image)) ? rect : null;
  }

  function thumbsInRail(rail, onlyVisible = true) {
    const box = rail.getBoundingClientRect();
    return [...rail.querySelectorAll("img")].filter((image) => {
      const rect = thumbnailRect(image);
      return rect && rect.left >= box.left - 15 && rect.right <= box.right + 15 &&
        (!onlyVisible || (rect.bottom > box.top && rect.top < box.bottom));
    }).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }

  function commonAncestor(a, b) {
    for (let node = a; node; node = node.parentElement) {
      if (node.contains(b)) return node;
    }
    return document.body;
  }

  function discover({ preferMode } = {}) {
    const hero = findHero();
    if (!hero) return null;
    const candidates = new Map();
    for (const image of document.images) {
      const rect = thumbnailRect(image);
      if (!rect || !visible(rect)) continue;
      let ancestor = image.parentElement;
      for (let depth = 0; ancestor && depth < 10; depth += 1, ancestor = ancestor.parentElement) {
        const box = ancestor.getBoundingClientRect();
        if (box.width < 45 || box.width > 260 || box.height < 120 || !visible(box)) continue;
        if (!candidates.has(ancestor)) candidates.set(ancestor, true);
      }
    }

    let winner = null;
    for (const rail of candidates.keys()) {
      const box = rail.getBoundingClientRect();
      const overlap = Math.min(box.bottom, hero.rect.bottom) - Math.max(box.top, hero.rect.top);
      if (overlap < Math.min(box.height, hero.rect.height) * 0.25) continue;
      const right = box.left >= hero.rect.right - 35 && box.left - hero.rect.right < 240;
      const left = box.right <= hero.rect.left + 35 &&
        (box.left < innerWidth * 0.25 || hero.rect.left - box.right < 240);
      if (!right && !left) continue;
      const mode = right ? "generation" : "viewer";
      if (preferMode && mode !== preferMode) continue;

      const thumbs = thumbsInRail(rail);
      if (thumbs.length < 2) continue;
      const scrolling = rail.scrollHeight > rail.clientHeight + 12 &&
        ["auto", "scroll"].includes(getComputedStyle(rail).overflowY);
      const distance = right ? Math.abs(box.left - hero.rect.right) : Math.abs(hero.rect.left - box.right);
      const root = commonAncestor(hero.image, rail);
      if (preferMode === "viewer" &&
          (root === document.body || root === document.documentElement)) continue;
      let rootDepth = 0;
      for (let node = root; node && node !== document.body; node = node.parentElement) rootDepth += 1;
      const score = thumbs.length * 40 + (scrolling ? 500 : 0) -
        distance * 1.2 - box.width / 10 + rootDepth * 100;
      if (!winner || score > winner.score) {
        winner = {
          rail, root, mode,
          hero, score
        };
      }
    }
    return winner;
  }

  function entireRailRendered(rail, thumbnails) {
    if (!thumbnails.length) return false;
    if (rail.scrollHeight <= rail.clientHeight + 12) return true;
    const box = rail.getBoundingClientRect();
    const first = thumbnails[0].getBoundingClientRect();
    const last = thumbnails[thumbnails.length - 1].getBoundingClientRect();
    const top = first.top - box.top + rail.scrollTop;
    const bottom = last.bottom - box.top + rail.scrollTop;
    // The scrolling wrapper can include controls and padding beyond the images.
    // Use the spacing between thumbnails to distinguish that space from a large
    // unrendered stretch of a virtualized list.
    const steps = [];
    for (let index = 1; index < thumbnails.length; index += 1) {
      const step = thumbnails[index].getBoundingClientRect().top -
        thumbnails[index - 1].getBoundingClientRect().top;
      if (step > 0) steps.push(step);
    }
    steps.sort((a, b) => a - b);
    const pitch = steps.length ? steps[Math.floor(steps.length / 2)] : last.height;
    const headTolerance = Math.max(24, Math.min(80, first.height));
    const tailTolerance = Math.max(80, Math.min(180, pitch * 2.5));
    return top <= headTolerance && bottom >= rail.scrollHeight - tailTolerance;
  }

  function explicitFullSource(thumbnail) {
    const clickable = thumbnail.closest("button,[role='button'],a");
    for (const node of [thumbnail, clickable]) {
      for (const attribute of ["data-full-src", "data-original-src", "data-download-url"]) {
        const value = node?.getAttribute?.(attribute);
        if (usableSource(value)) return new URL(value, location.href).href;
      }
    }
    return "";
  }

  const measuredSources = new Map();

  function measureSource(source) {
    if (!usableSource(source)) return Promise.resolve(null);
    if (measuredSources.has(source)) return measuredSources.get(source);
    if (typeof Image === "undefined") return Promise.resolve(null);
    const pending = new Promise((resolve) => {
      const image = new Image();
      const finish = (size) => {
        clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        resolve(size);
      };
      const timeout = setTimeout(() => finish(null), 6000);
      image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => finish(null);
      image.src = source;
    });
    if (measuredSources.size >= 128) measuredSources.delete(measuredSources.keys().next().value);
    measuredSources.set(source, pending);
    pending.then((size) => {
      if (!size) measuredSources.delete(source);
    });
    return pending;
  }

  async function fullSourceFor(thumbnail, hero, heroSize) {
    const thumbnailSource = sourceOf(thumbnail);
    const explicitSource = explicitFullSource(thumbnail);
    if (explicitSource) {
      const size = await measureSource(explicitSource);
      if (size) return { source: explicitSource, size };
    }
    const candidates = [...new Set([thumbnailSource, thumbnail.src].filter(usableSource))];
    for (const candidate of candidates) {
      const size = candidate === thumbnailSource && thumbnail.naturalWidth && thumbnail.naturalHeight
        ? { width: thumbnail.naturalWidth, height: thumbnail.naturalHeight }
        : await measureSource(candidate);
      if (candidate === hero?.source) return { source: candidate, size: heroSize || size };
      if (heroSize && size && size.width === heroSize.width && size.height === heroSize.height) {
        return { source: candidate, size };
      }
    }
    return null;
  }

  async function scan(gallery) {
    if (!gallery?.rail?.isConnected) throw new Error("图片列表已离开页面，请重新打开图片组");
    const thumbnails = thumbsInRail(gallery.rail, false);
    const hero = findHero(gallery.root) || findHero();
    const heroSize = hero?.image?.naturalWidth && hero.image.naturalHeight
      ? { width: hero.image.naturalWidth, height: hero.image.naturalHeight }
      : hero ? await measureSource(hero.source) : null;
    const resolved = await Promise.all(thumbnails.map((thumbnail) =>
      fullSourceFor(thumbnail, hero, heroSize)));
    const items = [];
    let unresolved = 0;
    for (const [index, thumbnail] of thumbnails.entries()) {
      const thumbnailSource = sourceOf(thumbnail);
      const match = resolved[index];
      if (!match) {
        unresolved += 1;
        continue;
      }
      items.push({
        id: crypto.randomUUID(), source: match.source, thumbnailSource,
        naturalWidth: match.size?.width || 0,
        naturalHeight: match.size?.height || 0
      });
    }
    const railComplete = entireRailRendered(gallery.rail, thumbnails);
    return {
      items,
      scannedThumbnails: thumbnails.length,
      thumbnailSources: thumbnails.map(sourceOf),
      unresolved,
      railComplete,
      complete: railComplete && !unresolved && items.length > 0,
      mode: gallery.mode
    };
  }

  globalThis.BatchImageGallery = Object.freeze({ discover, scan, findHero, thumbsInRail });
})();
