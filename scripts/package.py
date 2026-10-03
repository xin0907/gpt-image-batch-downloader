"""Create the upload ZIP with manifest.json at its root.

Run from anywhere with: python scripts/package.py
"""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
FILES = (
    "manifest.json",
    "background.js",
    "content.js",
    "gallery.js",
    "image-io.js",
    "panel.css",
    "popup.html",
    "popup.css",
    "popup.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "LICENSE",
    "PRIVACY.md",
)


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("manifest_version") != 3:
        raise ValueError("Expected a Manifest V3 extension")
    missing = [name for name in FILES if not (ROOT / name).is_file()]
    if missing:
        raise FileNotFoundError("Missing package files: " + ", ".join(missing))
    icon_paths = set(manifest.get("icons", {}).values())
    if not icon_paths.issubset(FILES):
        raise ValueError("Manifest references an icon missing from the package")

    release = ROOT / "release"
    release.mkdir(exist_ok=True)
    target = release / f"image-batch-download-{manifest['version']}.zip"
    with ZipFile(target, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name in FILES:
            archive.write(ROOT / name, arcname=name)

    with ZipFile(target) as archive:
        if archive.testzip() is not None:
            raise ValueError("ZIP integrity check failed")
        if archive.namelist()[0] != "manifest.json":
            raise ValueError("manifest.json is not at the ZIP root")
    print(target)


if __name__ == "__main__":
    main()
