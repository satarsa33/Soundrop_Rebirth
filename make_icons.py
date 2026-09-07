from PIL import Image, ImageDraw
import math

BG = (11, 13, 23, 255)
WHITE = (245, 245, 240, 255)
CORAL = (255, 107, 92, 255)
AZURE = (76, 154, 255, 255)
CHARTREUSE = (180, 226, 60, 255)
VIOLET = (181, 123, 255, 255)


def rounded_bg(size, radius_ratio=0.225):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=BG)
    return img, d


def draw_glow_line(d, x1, y1, x2, y2, color, width, glow_passes=3):
    for i in range(glow_passes, 0, -1):
        alpha = int(40 / i)
        w = width + i * 6
        d.line([x1, y1, x2, y2], fill=color[:3] + (alpha,), width=w)
    d.line([x1, y1, x2, y2], fill=color, width=width)


def make_icon(size, maskable=False):
    img, d = rounded_bg(size, radius_ratio=0.5 if maskable else 0.225)
    s = size

    # Two angled "instrument" lines, like the play field.
    line_w = max(3, int(s * 0.045))
    pad = s * (0.30 if maskable else 0.20)
    draw_glow_line(d, pad, s * 0.62, s - pad, s * 0.44, AZURE, line_w)
    draw_glow_line(d, s * 0.30, s * 0.80, s * 0.78, s * 0.68, CORAL, line_w)

    # A bright ball mid-bounce above the azure line.
    ball_r = s * 0.085
    bx, by = s * 0.60, s * 0.34
    for i in range(3, 0, -1):
        alpha = int(70 / i)
        d.ellipse(
            [bx - ball_r - i * 4, by - ball_r - i * 4, bx + ball_r + i * 4, by + ball_r + i * 4],
            fill=WHITE[:3] + (alpha,),
        )
    d.ellipse([bx - ball_r, by - ball_r, bx + ball_r, by + ball_r], fill=WHITE)

    return img


def main():
    import os

    os.makedirs("icons", exist_ok=True)
    make_icon(192).save("icons/icon-192.png")
    make_icon(512).save("icons/icon-512.png")
    make_icon(512, maskable=True).save("icons/icon-512-maskable.png")
    make_icon(180).save("icons/icon-180.png")
    print("icons written")


if __name__ == "__main__":
    main()
