const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const vm = require("node:vm");

function galleryFixture(mode, {
  initialOutside = false, previewOnly = false,
  virtualized = false, lazy = false, explicitFull = false,
  fallbackFull = false, coveredHero = false, count = 3,
  tailPadding = 0, headPadding = 0
} = {}) {
  const urls = Array.from({ length: count }, (_, index) =>
    "https://chatgpt.com/image/" + (index + 1) + ".png");
  const heroBox = mode === "generation"
    ? { left: 603, right: 1003, top: 90, bottom: 800, width: 400, height: 710 }
    : { left: 788, right: 1188, top: 53, bottom: 763, width: 400, height: 710 };
  const railBox = mode === "generation"
    ? { left: 1015, right: 1090, top: 90, bottom: 390, width: 75, height: 300 }
    : { left: 58, right: 143, top: 53, bottom: 353, width: 85, height: 300 };
  const body = {
    parentElement: null,
    getBoundingClientRect: () => ({ left: 0, right: 1920, top: 0, bottom: 900, width: 1920, height: 900 }),
    contains(target) {
      for (let node = target; node; node = node.parentElement) if (node === this) return true;
      return false;
    },
    querySelectorAll: () => images
  };
  const card = {
    parentElement: body,
    getBoundingClientRect: () => ({ left: 40, right: 1220, top: 40, bottom: 820, width: 1180, height: 780 }),
    contains: body.contains,
    querySelectorAll: () => [hero, ...thumbs]
  };
  const hero = {
    currentSrc: initialOutside ? "https://chatgpt.com/image/outside.png" : urls[2],
    naturalWidth: 941,
    naturalHeight: 1672,
    parentElement: card,
    contains: body.contains,
    closest: () => null,
    getBoundingClientRect: () => heroBox
  };
  const backgroundHero = coveredHero ? {
    currentSrc: "https://chatgpt.com/image/covered.png",
    parentElement: body,
    closest: () => null,
    contains: body.contains,
    getBoundingClientRect: () => ({
      left: 650, right: 1250, top: 20, bottom: 870, width: 600, height: 850
    })
  } : null;
  const rail = {
    parentElement: card,
    contains: body.contains,
    isConnected: true,
    scrollTop: 0,
    scrollHeight: virtualized ? 490 : Math.max(300, 10 + count * 70 + tailPadding + headPadding),
    clientHeight: 300,
    querySelectorAll: () => thumbs,
    getBoundingClientRect: () => railBox
  };
  let railClicks = 0;
  const thumbs = urls.map((url, index) => {
    const button = {
      parentElement: rail,
      isConnected: true,
      contains: body.contains,
      getBoundingClientRect: () => ({
        left: railBox.left + 7, right: railBox.left + 57,
        top: railBox.top + 10 + headPadding + index * 70 - rail.scrollTop,
        bottom: railBox.top + 60 + headPadding + index * 70 - rail.scrollTop,
        width: 50, height: 50
      }),
      click() {
        railClicks += 1;
        hero.currentSrc = url;
      }
    };
    return {
      currentSrc: previewOnly || explicitFull || fallbackFull
        ? "https://chatgpt.com/thumbnail/" + (index + 1) + ".png" : url,
      src: fallbackFull ? url : undefined,
      naturalWidth: lazy ? 0 : previewOnly || explicitFull || fallbackFull ? 64 : 941,
      naturalHeight: lazy ? 0 : previewOnly || explicitFull || fallbackFull ? 64 : 1672,
      parentElement: button,
      contains: body.contains,
      closest: () => button,
      getAttribute: (name) => explicitFull && name === "data-full-src" ? url : null,
      getBoundingClientRect: () => ({
        left: railBox.left + 7, right: railBox.left + 57,
        top: railBox.top + 10 + headPadding + index * 70 - rail.scrollTop,
        bottom: railBox.top + 60 + headPadding + index * 70 - rail.scrollTop,
        width: 50, height: 50
      })
    };
  });
  let strayClicks = 0;
  const strayRail = {
    parentElement: body,
    contains: body.contains,
    isConnected: true,
    scrollTop: 0,
    scrollHeight: 490,
    clientHeight: 300,
    querySelectorAll: () => strayThumbs,
    getBoundingClientRect: () => ({ left: 50, right: 130, top: 90, bottom: 390, width: 80, height: 300 })
  };
  const strayThumbs = mode === "generation" ? [1, 2, 3, 4, 5].map((number, index) => {
    const button = {
      parentElement: strayRail,
      contains: body.contains,
      getBoundingClientRect: () => ({
        left: 58, right: 108, top: 100 + index * 55, bottom: 150 + index * 55,
        width: 50, height: 50
      }),
      click() { strayClicks += 1; }
    };
    return {
      currentSrc: "https://chatgpt.com/unrelated/" + number + ".png",
      parentElement: button,
      contains: body.contains,
      closest: () => button,
      getBoundingClientRect: () => ({
        left: 58, right: 108, top: 100 + index * 55, bottom: 150 + index * 55,
        width: 50, height: 50
      })
    };
  }) : [];
  const images = [backgroundHero, hero, ...thumbs, ...strayThumbs].filter(Boolean);
  const document = {
    images,
    body,
    elementFromPoint: coveredHero ? () => hero : undefined,
    elementsFromPoint: coveredHero ? () => [{ id: "bgi-extension-root" }, hero, backgroundHero] : undefined,
    querySelectorAll: () => []
  };
  const context = vm.createContext({
    URL, document, location: { href: "https://chatgpt.com/c/example" },
    innerWidth: 1920, innerHeight: 900,
    getComputedStyle: () => ({ overflowY: "auto" }),
    crypto: { randomUUID }, setTimeout, clearTimeout,
    Image: class {
      set src(value) {
        this.naturalWidth = value.includes("/thumbnail/") ? 64 : 941;
        this.naturalHeight = value.includes("/thumbnail/") ? 64 : 1672;
        setTimeout(() => this.onload?.(), 0);
      }
    }
  });
  vm.runInContext(readFileSync("gallery.js", "utf8"), context);
  return {
    gallery: context.BatchImageGallery, urls,
    getStrayClicks: () => strayClicks,
    getRailClicks: () => railClicks,
    getHeroSource: () => hero.currentSrc,
    getScrollTop: () => rail.scrollTop
  };
}

for (const mode of ["generation", "viewer"]) {
  test("reads the " + mode + " thumbnail rail without moving the page", async () => {
    const { gallery, urls, getStrayClicks, getRailClicks, getHeroSource, getScrollTop } = galleryFixture(mode);
    const scope = gallery.discover();
    assert.equal(scope.mode, mode);
    const originalHero = getHeroSource();
    const result = await gallery.scan(scope);
    assert.deepEqual(Array.from(result.items, (item) => item.source), urls);
    assert.deepEqual(Array.from(result.thumbnailSources), urls);
    assert.equal(result.scannedThumbnails, 3);
    assert.equal(result.complete, true);
    assert.equal(getRailClicks(), 0);
    assert.equal(getScrollTop(), 0);
    assert.equal(getHeroSource(), originalHero);
    assert.equal(getStrayClicks(), 0);
  });
}

test("does not include a previously displayed image outside the current rail", async () => {
  const { gallery, urls } = galleryFixture("viewer", { initialOutside: true });
  const result = await gallery.scan(gallery.discover());
  assert.deepEqual(Array.from(result.items, (item) => item.source), urls);
});

test("viewer hero remains active when a larger image is covered behind it", () => {
  const { gallery, urls } = galleryFixture("viewer", { coveredHero: true });
  assert.equal(gallery.findHero().source, urls[2]);
  assert.equal(gallery.discover({ preferMode: "viewer" }).mode, "viewer");
});

test("viewer-only discovery does not select a generation rail", () => {
  const { gallery } = galleryFixture("generation");
  assert.equal(gallery.discover({ preferMode: "viewer" }), null);
});

test("does not treat thumbnail previews as full images", async () => {
  const { gallery, getRailClicks } = galleryFixture("viewer", { previewOnly: true });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, false);
  assert.equal(result.unresolved, 3);
  assert.equal(result.items.length, 0);
  assert.equal(getRailClicks(), 0);
});

test("detects a partially rendered rail without scrolling it", async () => {
  const { gallery, getRailClicks, getScrollTop } = galleryFixture("viewer", { virtualized: true });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, false);
  assert.equal(result.railComplete, false);
  assert.equal(result.scannedThumbnails, 3);
  assert.equal(getRailClicks(), 0);
  assert.equal(getScrollTop(), 0);
});

test("loads lazy image dimensions without moving the page", async () => {
  const { gallery, urls, getRailClicks } = galleryFixture("generation", { lazy: true });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, true);
  assert.deepEqual(Array.from(result.items, (item) => item.source), urls);
  assert.equal(getRailClicks(), 0);
});

test("reads twenty offscreen thumbnails without scrolling", async () => {
  const { gallery, urls, getRailClicks, getScrollTop } = galleryFixture("viewer", { count: 20 });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, true);
  assert.deepEqual(Array.from(result.items, (item) => item.source), urls);
  assert.equal(getRailClicks(), 0);
  assert.equal(getScrollTop(), 0);
});

test("accepts a fully rendered rail with trailing layout space", async () => {
  const { gallery, urls, getScrollTop } = galleryFixture("viewer", {
    count: 20, tailPadding: 140
  });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, true);
  assert.deepEqual(Array.from(result.items, (item) => item.source), urls);
  assert.equal(getScrollTop(), 0);
});

test("keeps a large unrendered tail marked as uncertain", async () => {
  const { gallery, getScrollTop } = galleryFixture("viewer", {
    count: 20, tailPadding: 500
  });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, false);
  assert.equal(result.railComplete, false);
  assert.equal(result.items.length, 20);
  assert.equal(getScrollTop(), 0);
});

test("does not mistake missing thumbnails above the rendered range for padding", async () => {
  const { gallery, getScrollTop } = galleryFixture("viewer", {
    count: 20, headPadding: 140
  });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, false);
  assert.equal(result.railComplete, false);
  assert.equal(getScrollTop(), 0);
});

test("uses explicit full image URLs instead of thumbnail URLs", async () => {
  const { gallery, urls } = galleryFixture("generation", { explicitFull: true });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, true);
  assert.deepEqual(Array.from(result.items, (item) => item.source), urls);
});

test("uses the full src when currentSrc is a preview variant", async () => {
  const { gallery, urls } = galleryFixture("viewer", { fallbackFull: true });
  const result = await gallery.scan(gallery.discover());
  assert.equal(result.complete, true);
  assert.deepEqual(Array.from(result.items, (item) => item.source), urls);
});
