"""
Картинка-приглашение для письма коллегам: музыкальная игра на Questix.

Рисуется растром через Pillow, а не из SVG: конвертера SVG→PNG на машине нет,
а письму всё равно нужен PNG. Всё крупное рисуется на утроенном холсте и
уменьшается в конце — так круг и лучи выходят гладкими без сглаживания линий,
которого в Pillow нет.

Логотип берётся готовым файлом, а не набирается шрифтом: начертание в нём
своё, системным гротеском его не повторить.

В центре — визуализатор с проектора: кольцо, лучи по кругу и «?» внутри.
Ровно это зал видит, пока играет фрагмент, поэтому картинка узнаётся теми,
кто уже играл. По бокам — реакции из панели на телефоне.

Запуск: python scripts/invite-card.py [путь_вывода.png]
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / 'assets' / 'logo' / 'questix-logo-only-transparent.png'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets' / 'logo' / 'questix-music-invite.png'

W, H = 1600, 900
S = 3  # суперсэмплинг

BG = (7, 5, 14)
CARD = (13, 9, 26)
INDIGO = (109, 74, 255)   # начало градиента лучей
VIOLET = (167, 92, 246)
PINK = (232, 121, 249)

BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
EMOJI_FONT = 'C:/Windows/Fonts/seguiemj.ttf'


def font(size):
    return ImageFont.truetype(BOLD, size)


def lerp(a, b, t):
    return tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3))


def radial_glow(size, center, radius, color, strength=1.0):
    """Мягкое пятно света: рисуем маленьким и растягиваем — дёшево и мягко."""
    small = 64
    layer = Image.new('L', (small, small), 0)
    d = ImageDraw.Draw(layer)
    steps = 30
    for i in range(steps, 0, -1):
        r = small / 2 * i / steps
        c = small / 2
        d.ellipse([c - r, c - r, c + r, c + r], fill=int(255 * strength * (1 - i / steps) ** 2))
    layer = layer.resize((radius * 2, radius * 2), Image.LANCZOS)
    mask = Image.new('L', size, 0)
    mask.paste(layer, (center[0] - radius, center[1] - radius))
    return Image.new('RGB', size, color), mask


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


def visualizer(size, center, radius, seed=11):
    """Кольцо с лучами — то же, что зал видит на проекторе."""
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = center
    rnd = random.Random(seed)

    bars = 168
    for i in range(bars):
        a = 2 * math.pi * i / bars - math.pi / 2
        # Ровное кольцо плюс мелкая рябь. Крупная низкочастотная волна давала
        # пять-шесть выступов, и венец читался как звезда, а не как спектр.
        wave = (
            0.80
            + 0.09 * math.sin(a * 5 + 0.6)
            + 0.11 * math.sin(a * 17 + 2.2)
        )
        length = wave * radius * 0.86 * (0.94 + 0.12 * rnd.random())
        r0 = radius + 30 * S  # зазор: вплотную к кольцу лучи выглядят грязно
        color = lerp(INDIGO, PINK, abs(math.sin(math.pi * i / bars)))
        d.line(
            [cx + math.cos(a) * r0, cy + math.sin(a) * r0,
             cx + math.cos(a) * (r0 + length), cy + math.sin(a) * (r0 + length)],
            fill=color + (245,), width=6 * S,
        )

    # Кольцо: широкое цветное под тонким белым — так получается неон, а не
    # просто окружность. Свечение добавляется размытой копией слоя ниже.
    for w, col, a in ((16 * S, VIOLET, 255), (6 * S, (255, 244, 255), 255)):
        d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=col + (a,), width=w)
    d.ellipse([cx - radius + 12 * S, cy - radius + 12 * S, cx + radius - 12 * S, cy + radius - 12 * S],
              fill=(12, 8, 22, 235))
    return img


def gradient_text(size, xy, text, fnt, top_color, bottom_color):
    """Текст с вертикальным градиентом: заливаем градиент по маске букв."""
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=fnt, fill=255, anchor='mm')
    box = mask.getbbox()
    grad = Image.new('RGB', size, top_color)
    if box:
        h = box[3] - box[1]
        strip = Image.new('RGB', (1, max(1, h)))
        for y in range(max(1, h)):
            strip.putpixel((0, y), lerp(top_color, bottom_color, y / max(1, h - 1)))
        grad.paste(strip.resize((size[0], max(1, h)), Image.BILINEAR), (0, box[1]))
    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def emoji(ch, size, alpha=255):
    """Цветной эмодзи. Segoe UI Emoji — растровый шрифт с единственным
    размером 109, поэтому рисуем в нём и уменьшаем."""
    base = 109
    im = Image.new('RGBA', (base * 2, base * 2), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((base, base), ch, font=ImageFont.truetype(EMOJI_FONT, base),
                            anchor='mm', embedded_color=True)
    im = im.crop(im.getbbox()).resize((size, size), Image.LANCZOS)
    if alpha < 255:
        im.putalpha(im.getchannel('A').point(lambda v: v * alpha // 255))
    # поля под ореол: иначе размытие обрывается о край и читается квадратом
    pad = size // 2
    out = Image.new('RGBA', (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
    out.paste(im, (pad, pad), im)
    return out


def neon_glyph(ch, size, top=(196, 150, 255), bottom=PINK):
    """Эмодзи, перекрашенный в палитру.

    Нота и микрофон в Segoe UI Emoji почти чёрные и на тёмном фоне тонут.
    Берём от глифа только форму и заливаем градиентом — иконка остаётся нашей,
    но светится, как всё остальное на экране.
    """
    src = emoji(ch, size)
    mask = src.getchannel('A')
    grad = Image.new('RGB', src.size, top)
    strip = Image.new('RGB', (1, src.size[1]))
    for y in range(src.size[1]):
        strip.putpixel((0, y), lerp(top, bottom, y / max(1, src.size[1] - 1)))
    grad.paste(strip.resize(src.size, Image.BILINEAR), (0, 0))
    out = Image.new('RGBA', src.size, (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def starfield(size, count, seed=3):
    """Редкая пыль на фоне — иначе большие тёмные поля выглядят плоско."""
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rnd = random.Random(seed)
    for _ in range(count):
        x, y = rnd.randrange(size[0]), rnd.randrange(size[1])
        r = rnd.choice((1, 1, 2)) * S
        a = rnd.randint(30, 130)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(226, 214, 255, a))
    return layer


def main():
    size = (W * S, H * S)
    img = Image.new('RGB', size, BG)

    # карточка со скруглением и тонкой обводкой
    pad = 14 * S
    card = Image.new('RGB', size, CARD)
    card_mask = Image.new('L', size, 0)
    ImageDraw.Draw(card_mask).rounded_rectangle([pad, pad, W * S - pad, H * S - pad],
                                                radius=34 * S, fill=255)
    img = Image.composite(card, img, card_mask)

    # свечения: фиолетовое вокруг центра и два холодных пятна по углам
    for center, radius, color, strength in [
        ((W // 2 * S, 522 * S), 400 * S, (104, 52, 200), 1.0),
        ((int(W * 0.16) * S, int(H * 0.20) * S), 430 * S, (70, 38, 150), 0.55),
        ((int(W * 0.86) * S, int(H * 0.80) * S), 460 * S, (128, 40, 150), 0.5),
    ]:
        tint, mask = radial_glow(size, center, radius, color, strength)
        mask = ImageChops.multiply(mask, card_mask)
        img = Image.composite(Image.blend(img, tint, 0.6), img, mask)

    img = Image.alpha_composite(img.convert('RGBA'), starfield(size, 190))

    cx, cy, R = W // 2 * S, 522 * S, 128 * S

    viz = visualizer(size, (cx, cy), R)
    # неон = сам слой плюс его размытая копия, добавленная по свету
    for blur in (26 * S, 12 * S, 4 * S):
        img = Image.alpha_composite(img, viz.filter(ImageFilter.GaussianBlur(blur)))
    img = Image.alpha_composite(img, viz)

    # «?» внутри кольца — как на экране, пока песня играет
    q = gradient_text(size, (cx, cy + 8 * S), '?', font(190 * S), (214, 176, 255), PINK)
    img = Image.alpha_composite(img, q.filter(ImageFilter.GaussianBlur(11 * S)))
    img = Image.alpha_composite(img, q)
    img = img.convert('RGB')

    # логотип
    logo = Image.open(LOGO).convert('RGBA')
    lw = 620 * S
    logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
    glow = logo.filter(ImageFilter.GaussianBlur(9 * S))
    img.paste(Image.new('RGB', glow.size, (150, 90, 230)), (W * S // 2 - lw // 2, 96 * S),
              glow.getchannel('A').point(lambda v: v // 4))
    img.paste(logo, (W * S // 2 - lw // 2, 96 * S), logo)

    draw = ImageDraw.Draw(img, 'RGBA')
    text_center(draw, (cx, 246 * S), 'МУЗЫКАЛЬНАЯ ВИКТОРИНА', font(25 * S),
                (214, 186, 255, 255), spacing=11 * S)

    # Реакции гостей — те, что стоят в панели на телефоне. Ореол фиолетовый,
    # чтобы эмодзи не выпадали из палитры и не читались как наклейки поверх.
    # Нота в Segoe почти чёрная, поэтому она идёт неоном, а не как есть.
    for ch, (x, y), sz, neon in [
        ('\U0001F3B5', (352, 316), 82, True),
        ('❤️', (258, 492), 88, False),
        ('\U0001F525', (352, 688), 86, False),
        ('\U0001F44F', (1248, 336), 90, False),
        ('\U0001F3B5', (1346, 512), 66, True),
        ('\U0001F389', (1248, 704), 90, False),
    ]:
        e = neon_glyph(ch, sz * S) if neon else emoji(ch, sz * S)
        pos = (x * S - e.width // 2, y * S - e.height // 2)
        halo = e.filter(ImageFilter.GaussianBlur(11 * S))
        img.paste(Image.new('RGB', halo.size, (176, 112, 248)), pos,
                  halo.getchannel('A').point(lambda v: v * 2 // 5))
        img.paste(e, pos, e)

    # обводка карточки поверх всего, чтобы свечения её не размывали
    ImageDraw.Draw(img, 'RGBA').rounded_rectangle(
        [pad, pad, W * S - pad, H * S - pad], radius=34 * S,
        outline=(150, 100, 235, 130), width=2 * S)

    img = img.resize((W, H), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, 'PNG')
    print(f'{OUT}  {img.width}x{img.height}')


if __name__ == '__main__':
    main()
