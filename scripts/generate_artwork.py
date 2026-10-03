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
    image = Image.new("RGBA", (128 * scale, 128 * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(coords):
        return tuple(round(value * scale) for value in coords)

    def points(coords):
        return [(round(x * scale), round(y * scale)) for x, y in coords]

    draw.rounded_rectangle(box((16, 16, 112, 112)), radius=23 * scale, fill="#202123")
    draw.rounded_rectangle(
        box((42, 35, 87, 79)), radius=6 * scale,
        outline="#FFFFFF", width=4 * scale,
    )
    draw.rounded_rectangle(
        box((29, 47, 76, 93)), radius=6 * scale,
        fill="#202123", outline="#FFFFFF", width=4 * scale,
    )
    draw.ellipse(box((39, 57, 47, 65)), fill="#FFFFFF")
    draw.line(points(((35, 82), (46, 71), (53, 78), (61, 70), (70, 80))),
              fill="#FFFFFF", width=4 * scale, joint="curve")
    draw.line(points(((94, 61), (94, 91))), fill="#FFFFFF", width=5 * scale)
    draw.line(points(((84, 82), (94, 92), (104, 82))),
              fill="#FFFFFF", width=5 * scale, joint="curve")
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
