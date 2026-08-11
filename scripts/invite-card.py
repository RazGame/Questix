"""
Картинка-приглашение для письма коллегам: музыкальная игра на Questix.

Рисуется растром через Pillow, а не из SVG: конвертера SVG→PNG на машине нет,
а письму всё равно нужен PNG. Всё крупное рисуется на утроенном холсте и
уменьшается в конце — так круг и лучи выходят гладкими без сглаживания линий,
которого в Pillow нет.

Логотип берётся готовым файлом, а не набирается шрифтом: начертание в нём
своё, системным гротеском его не повторить.

Запуск: python scripts/invite-card.py [путь_вывода.png]
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / 'assets' / 'logo' / 'questix-logo-only-transparent.png'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets' / 'logo' / 'questix-music-invite.png'

W, H = 1600, 900
S = 3  # суперсэмплинг

BG = (8, 6, 13)
VIOLET = (167, 92, 246)
PINK = (232, 121, 249)
AMBER = (251, 191, 36)

BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
REG = 'C:/Windows/Fonts/segoeui.ttf'


def font(path, size):
    return ImageFont.truetype(path, size)


def radial_glow(size, center, radius, color, strength=1.0):
    """Мягкое пятно света. Рисуем маленьким и растягиваем — дёшево и мягко."""
    w, h = size
    small = 64
    layer = Image.new('L', (small, small), 0)
    d = ImageDraw.Draw(layer)
    cx, cy = small / 2, small / 2
    steps = 28
    for i in range(steps, 0, -1):
        r = small / 2 * i / steps
        a = int(255 * strength * (1 - i / steps) ** 2)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=a)
    layer = layer.resize((radius * 2, radius * 2), Image.LANCZOS)
    mask = Image.new('L', (w, h), 0)
    mask.paste(layer, (center[0] - radius, center[1] - radius))
    tint = Image.new('RGB', (w, h), color)
    return tint, mask


def text_center(draw, xy, text, fnt, fill, spacing=0):
    """Текст по центру. spacing — разрядка, у Pillow её нет из коробки."""
    x, y = xy
    if not spacing:
        draw.text((x, y), text, font=fnt, fill=fill, anchor='mm')
        return
    widths = [draw.textlength(ch, font=fnt) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    cur = x - total / 2
    for ch, w in zip(text, widths):
        draw.text((cur, y), ch, font=fnt, fill=fill, anchor='lm')
        cur += w + spacing


def visualizer(size, center, radius, seed=7):
    """Кольцо с лучами — то же, что зал видит на проекторе между песнями."""
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = center

    rnd = random.Random(seed)
    bars = 108
    # Огибающая: две волны разной частоты дают неровный, но не рваный контур —
    # так выглядит спектр живого трека, а чистый рандом выглядит шумом.
    for i in range(bars):
        a = 2 * math.pi * i / bars - math.pi / 2
        wave = (
            0.55 + 0.45 * math.sin(a * 3 + 0.7) * math.sin(a * 7 + 2.1)
        )
        length = int((22 + 118 * abs(wave)) * (0.75 + 0.5 * rnd.random()))
        r0 = radius + 16
        r1 = r0 + length
        t = i / bars
        color = tuple(int(VIOLET[k] + (PINK[k] - VIOLET[k]) * abs(math.sin(math.pi * t))) for k in range(3))
        d.line(
            [cx + math.cos(a) * r0, cy + math.sin(a) * r0,
             cx + math.cos(a) * r1, cy + math.sin(a) * r1],
            fill=color + (235,), width=9,
        )

    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=VIOLET + (255,), width=10)
    d.ellipse([cx - radius + 22, cy - radius + 22, cx + radius - 22, cy + radius - 22],
              fill=(16, 11, 26, 230))
    return img


def emoji(ch, size, alpha=255):
    """Цветной эмодзи. Segoe UI Emoji — растровый шрифт с единственным
    размером 109, поэтому рисуем в нём и уменьшаем."""
    base = 109
    im = Image.new('RGBA', (base * 2, base * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((base, base), ch, font=ImageFont.truetype('C:/Windows/Fonts/seguiemj.ttf', base),
                            anchor='mm', embedded_color=True)
    im = im.crop(im.getbbox()).resize((size, size), Image.LANCZOS)
    if alpha < 255:
        a = im.getchannel('A').point(lambda v: v * alpha // 255)
        im.putalpha(a)
    return im


def pill(draw, center, text, fnt, fg, border):
    w = draw.textlength(text, font=fnt)
    pad_x, pad_y = 34, 20
    x, y = center
    box = [x - w / 2 - pad_x, y - pad_y - fnt.size / 2, x + w / 2 + pad_x, y + pad_y + fnt.size / 2]
    draw.rounded_rectangle(box, radius=(box[3] - box[1]) / 2, outline=border, width=3, fill=(255, 255, 255, 10))
    draw.text((x, y), text, font=fnt, fill=fg, anchor='mm')


def main():
    size = (W * S, H * S)
    img = Image.new('RGB', size, BG)

    # свечения по углам — как на экране проектора
    for center, radius, color, strength in [
        ((int(W * 0.22) * S, int(H * 0.12) * S), 520 * S, (86, 40, 160), 0.85),
        ((int(W * 0.80) * S, int(H * 0.85) * S), 560 * S, (150, 40, 130), 0.7),
        ((W // 2 * S, 430 * S), 420 * S, (90, 45, 170), 0.9),
    ]:
        tint, mask = radial_glow(size, center, radius, color, strength)
        img = Image.composite(Image.blend(img, tint, 0.55), img, mask)

    cx, cy, R = W // 2 * S, 430 * S, 132 * S

    viz = visualizer(size, (cx, cy), R)
    glow = viz.filter(ImageFilter.GaussianBlur(26 * S // 3))
    img = Image.alpha_composite(img.convert('RGBA'), glow)
    img = Image.alpha_composite(img, viz).convert('RGB')

    draw = ImageDraw.Draw(img, 'RGBA')

    # «?» внутри кольца — ровно то, что висит на экране, пока песня играет
    draw.text((cx, cy + 6 * S), '?', font=font(BOLD, 150 * S), fill=(255, 255, 255, 235), anchor='mm')

    # логотип
    logo = Image.open(LOGO).convert('RGBA')
    lw = 470 * S
    logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    img.paste(logo, (W * S // 2 - lw // 2, 74 * S), logo)

    text_center(draw, (cx, 196 * S), 'МУЗЫКАЛЬНАЯ ВИКТОРИНА', font(BOLD, 21 * S), (196, 160, 255, 255), spacing=9 * S)

    text_center(draw, (cx, 660 * S), 'Шазам запрещён', font(BOLD, 74 * S), (255, 255, 255, 255))
    text_center(draw, (cx, 730 * S), 'Угадываем хиты с первых секунд.', font(REG, 31 * S), (214, 205, 230, 255))
    text_center(draw, (cx, 774 * S), 'Кто первым нажал — тот и отвечает.', font(REG, 31 * S), (214, 205, 230, 255))

    f = font(BOLD, 23 * S)
    for x, text, color in [
        (cx - 340 * S, '21 раунд', (196, 160, 255, 255)),
        (cx, '210 песен', (240, 170, 240, 255)),
        (cx + 340 * S, 'телефон вместо кнопки', AMBER + (255,)),
    ]:
        pill(draw, (x, 828 * S), text, f, color, color[:3] + (110,))

    # Реакции гостей: на проекторе они летят вверх с телефонов, и без них
    # картинка выглядит как афиша концерта, а не как живая игра. Мельче и
    # выше — крупные читались как наклейки поверх, а не как часть сцены.
    for ch, (x, y), sz, a in [
        ('❤️', (368, 612), 54, 255),
        ('\U0001F525', (300, 470), 46, 230),
        ('\U0001F389', (386, 330), 38, 195),
        ('\U0001F44F', (1236, 596), 52, 255),
        ('\U0001F3A4', (1300, 452), 44, 235),  # микрофон, а не нота: нота в Segoe чёрная и тонет в фоне
        ('\U0001F525', (1218, 322), 36, 190),
    ]:
        e = emoji(ch, sz * S, a)
        pos = (x * S - e.width // 2, y * S - e.height // 2)
        # тёплый ореол: без него эмодзи висит на фоне сам по себе
        halo = e.filter(ImageFilter.GaussianBlur(9 * S // 2))
        img.paste(Image.new('RGB', halo.size, (255, 210, 160)), pos,
                  halo.getchannel('A').point(lambda v: v // 3))
        img.paste(e, pos, e)

    img = img.resize((W, H), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, 'PNG')
    print(f'{OUT}  {img.width}x{img.height}')


if __name__ == '__main__':
    main()
