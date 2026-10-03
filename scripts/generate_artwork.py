"""Generate the extension icons and Chrome Web Store promotional tile.

Requires Pillow. The artwork uses original geometric shapes and no service logos.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
STORE = ROOT / "store-assets"


def icon(size: int) -> Image.Image:
    scale = 8
    full = 128 * scale

    def box(coords):
        return tuple(round(value * scale) for value in coords)

    def points(coords):
        return [(round(x * scale), round(y * scale)) for x, y in coords]

    # Blue-to-violet vertical gradient inside a rounded square.
    gradient = Image.new("RGBA", (full, full))
    shade = ImageDraw.Draw(gradient)
    top, bottom = (79, 110, 247), (124, 77, 255)
    for y in range(full):
        t = y / full
        shade.line([(0, y), (full, y)],
                   fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,))
    mask = Image.new("L", (full, full), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box((8, 8, 120, 120)), radius=26 * scale, fill=255)
    art = Image.new("RGBA", (full, full), (0, 0, 0, 0))
    art.paste(gradient, (0, 0), mask)

    draw = ImageDraw.Draw(art)
    white = "#FFFFFF"
    draw.rounded_rectangle(box((40, 30, 88, 76)), radius=7 * scale, outline=white, width=5 * scale)
    draw.rounded_rectangle(box((26, 44, 76, 94)), radius=7 * scale,
                           fill=(98, 92, 250, 255), outline=white, width=5 * scale)
    draw.ellipse(box((36, 55, 45, 64)), fill=white)
    draw.line(points(((33, 84), (45, 72), (53, 80), (61, 72), (70, 82))),
              fill=white, width=5 * scale, joint="curve")
    draw.line(points(((97, 58), (97, 94))), fill=white, width=6 * scale)
    draw.line(points(((86, 84), (97, 95), (108, 84))),
              fill=white, width=6 * scale, joint="curve")

    # Toolbar sizes use the whole canvas so the glyph stays legible. Larger
    # sizes follow the Web Store guidance: 96x96 artwork centered in 128x128.
    if size <= 32:
        return art.crop(box((8, 8, 120, 120))).resize((size, size), Image.Resampling.LANCZOS)
    inner = round(full * 96 / 112)
    image = Image.new("RGBA", (full, full), (0, 0, 0, 0))
    offset = (full - inner) // 2
    resized = art.resize((inner, inner), Image.Resampling.LANCZOS)
    image.paste(resized, (offset, offset), resized)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def promotional_tile() -> Image.Image:
    scale = 3
    image = Image.new("RGB", (440 * scale, 280 * scale), "#F1F1EE")
    draw = ImageDraw.Draw(image)

    def box(coords):
        return tuple(round(value * scale) for value in coords)

    draw.rounded_rectangle(box((14, 14, 426, 266)), radius=24 * scale,
                           fill="#FFFFFF")
    draw.rounded_rectangle(box((24, 24, 416, 256)), radius=18 * scale,
                           fill="#E9E9E7")

    # Three selected image cards; this is a brand illustration, not a UI screenshot.
    cards = [
        ((205, 78, 267, 202), "#D2C0A5", "#A56C43"),
        ((256, 62, 318, 186), "#B5C1C0", "#627D7C"),
        ((307, 45, 382, 195), "#CEB598", "#866147"),
    ]
    for (left, top, right, bottom), base, accent in cards:
        draw.rounded_rectangle(box((left + 4, top + 6, right + 4, bottom + 6)),
                               radius=9 * scale, fill="#C8C8C5")
        draw.rounded_rectangle(box((left, top, right, bottom)), radius=9 * scale,
                               fill="#FFFFFF")
        draw.rounded_rectangle(box((left + 5, top + 5, right - 5, bottom - 5)),
                               radius=5 * scale, fill=base)
        draw.ellipse(box((left + 13, top + 16, left + 27, top + 30)), fill="#F5E4BD")
        draw.polygon(
            [(round(x * scale), round(y * scale)) for x, y in (
                (left + 5, bottom - 17), (left + 22, top + 55),
                (left + 37, top + 83), (right - 8, top + 38),
                (right - 5, bottom - 5), (left + 5, bottom - 5)
            )],
            fill=accent,
        )
        draw.ellipse(box((right - 16, bottom - 18, right - 3, bottom - 5)), fill="#FFFFFF")
        draw.line(
            [(round(x * scale), round(y * scale)) for x, y in (
                (right - 13, bottom - 12), (right - 10, bottom - 9),
                (right - 6, bottom - 14)
            )],
            fill="#202123", width=2 * scale,
        )

    large_icon = icon(154 * scale)
    image.paste(large_icon, (30 * scale, 62 * scale), large_icon)
    return image.resize((440, 280), Image.Resampling.LANCZOS)


def main() -> None:
    ICONS.mkdir(exist_ok=True)
    STORE.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        icon(size).save(ICONS / f"icon-{size}.png", optimize=True)
    promotional_tile().save(STORE / "promo-440x280.png", optimize=True)


if __name__ == "__main__":
    main()
