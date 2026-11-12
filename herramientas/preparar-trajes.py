#!/usr/bin/env python3
"""Prepara la imagen de una skin de una sola imagen (carpeta trajes/): recorta el espacio transparente, la deja a 560 px de alto y la guarda en WebP.

Uso:
  python3 herramientas/preparar-trajes.py original.webp trajes/nombre.webp
  python3 herramientas/preparar-trajes.py galactico.webp trajes/galactico.webp --furia trajes/galactico-furia.webp

--furia crea además la versión «enojada» pintando de rojo/naranja los azules, violetas y magentas (la galaxia del Galáctico pasa a lava).
Después de agregar una skin hay que escribirla en tienda.js (stat, stat2, asp = alto/ancho de la imagen, av = recorte de la cara para el avatar).
Requiere Pillow y numpy.
"""
import sys
import numpy as np
from PIL import Image

ALTO = 560


def recortar(im):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 8)
    p = 4
    return im.crop((max(0, xs.min() - p), max(0, ys.min() - p), min(im.width, xs.max() + p + 1), min(im.height, ys.max() + p + 1)))


def guardar(im, destino):
    w = round(im.width * ALTO / im.height)
    im.resize((w, ALTO), Image.LANCZOS).save(destino, 'WEBP', quality=88, method=6)
    print(destino, w, 'x', ALTO, '· asp =', round(ALTO / w, 3))


def hsv2rgb(h, s, v):
    h = h / 60.0
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    return np.stack([np.choose(i, [v, q, p, p, t, v]), np.choose(i, [t, v, v, q, p, p]), np.choose(i, [p, p, t, v, v, q])], 2)


def furia(im):
    arr = np.array(im).astype(np.float32) / 255.0
    rgb, al = arr[:, :, :3], arr[:, :, 3]
    mx, mn = rgb.max(2), rgb.min(2)
    d = mx - mn + 1e-6
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
    s = np.where(mx > 1e-6, d / (mx + 1e-6), 0)
    en_rango = np.clip(np.minimum((h - 185) / 15.0, (355 - h) / 15.0), 0, 1)             # solo azules, violetas y magentas
    mask = (en_rango * np.clip((s - 0.22) / 0.25, 0, 1) * np.clip((mx - 0.12) / 0.2, 0, 1))[:, :, None]
    t = np.clip((h - 200) / (335 - 200), 0, 1)
    nuevo = hsv2rgb((358 + t * 52) % 360, np.clip(s * 1.15 + 0.15, 0, 1), np.clip(mx * 1.12 + 0.05, 0, 1))   # azul → carmesí, magenta → ámbar
    res = rgb * (1 - mask) + nuevo * mask
    return Image.fromarray((np.clip(np.dstack([res, al]), 0, 1) * 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    img = recortar(Image.open(sys.argv[1]).convert('RGBA'))
    guardar(img, sys.argv[2])
    if '--furia' in sys.argv:
        guardar(furia(img), sys.argv[sys.argv.index('--furia') + 1])
