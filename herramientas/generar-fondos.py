# Texturas ya difuminadas para los fondos Galaxia y Aurora: el desenfoque se hornea una vez (aquí) en vez de aplicarlo en cada cuadro con filter: blur().
import numpy as np, sys, os
from PIL import Image, ImageFilter
out = sys.argv[1] if len(sys.argv) > 1 else 'fondos'; os.makedirs(out, exist_ok=True)

def interp(stops, t):
    """Interpolación de color en espacio premultiplicado (como hace CSS). stops: [(pos, (r,g,b,a))]; t: arreglo 0..1"""
    pos = np.array([p for p, _ in stops]); cols = np.array([c for _, c in stops], float)
    cols[:, :3] /= 255                                          # colores 0..1
    pre = cols.copy(); pre[:, :3] *= pre[:, 3:4]
    ch = [np.interp(t, pos, pre[:, k]) for k in range(4)]
    a = ch[3]; rgb = [np.where(a > 1e-6, ch[k] / np.maximum(a, 1e-6), 0) for k in range(3)]
    return np.stack(rgb + [a], -1)

def smooth(img_rgba, sigma):
    # desenfoque en espacio premultiplicado para que no aparezcan bordes oscuros
    a = img_rgba[..., 3:4]; pre = np.concatenate([img_rgba[..., :3] * a, a], -1)
    chans = []
    for k in range(4):
        im = Image.fromarray((np.clip(pre[..., k], 0, 1) * 65535).astype(np.uint16)).convert('I;16') if False else Image.fromarray(np.clip(pre[..., k] * 255, 0, 255).astype(np.uint8))
        chans.append(np.asarray(im.filter(ImageFilter.GaussianBlur(sigma)), float) / 255)
    pre = np.stack(chans, -1); a = pre[..., 3:4]
    rgb = np.where(a > 1e-4, pre[..., :3] / np.maximum(a, 1e-4), 0)
    return np.concatenate([rgb, a], -1)

def save(arr, name, q=82):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255 + .5).astype(np.uint8), 'RGBA'); im.save(os.path.join(out, name), 'WEBP', quality=q, method=6)
    print(name, os.path.getsize(os.path.join(out, name)), 'bytes')

# ---- Galaxia: dos espirales (conic-gradient + máscara radial) ----
N = 512; yy, xx = np.mgrid[0:N, 0:N]; cx = cy = (N - 1) / 2
dx, dy = xx - cx, yy - cy
theta = (np.degrees(np.arctan2(dx, -dy)) % 360) / 360          # 0 = arriba, sentido del reloj (como CSS)
rho = np.hypot(dx, dy) / (N / 2 * 2 ** .5)                        # 1 = esquina más lejana (radius de `circle` en CSS)
def spiral(stops, start_deg, m0, m1, sigma, name):
    t = (theta - start_deg / 360) % 1
    col = interp(stops, t)
    mask = np.clip((m1 - rho) / (m1 - m0), 0, 1)                # radial-gradient(#000 m0, transparent m1)
    col[..., 3] *= mask
    col[rho > .72] = 0                                           # el círculo (border-radius 50%) termina en el borde del cuadrado
    save(smooth(col, sigma), name)
spiral([(0, (150,90,255,0)), (.07, (170,110,255,.5)), (.21, (70,130,255,0)), (.38, (255,110,200,.46)), (.54, (70,130,255,0)), (.69, (170,110,255,.5)), (.84, (255,170,110,.32)), (1, (150,90,255,0))], 0, .04, .62, 7, 'galaxia-1.webp')
spiral([(0, (90,160,255,0)), (.10, (90,160,255,.3)), (.28, (90,160,255,0)), (.52, (255,140,230,.28)), (.70, (90,160,255,0)), (.88, (130,100,255,.26)), (1, (90,160,255,0))], 90, .08, .56, 9, 'galaxia-2.webp')

# ---- Aurora: tres cortinas (degradado vertical × rayas verticales × desvanecido), desenfocadas ----
W, Hh = 320, 680
y = np.linspace(0, 1, Hh)[:, None] * np.ones((1, W)); x = np.arange(W)[None, :] * np.ones((Hh, 1))
px = np.interp(x % 90, [0, 20, 44, 64, 90], [1, .3, 1, .55, 1])   # repeating-linear-gradient(90deg, #000 0, .3 20px, #000 44px, .55 64px, #000 90px)
fade = np.clip((1 - y) / .45, 0, 1)                                 # linear-gradient(180deg, #000 55%, transparent)
def curtain(stops, name):
    # En CSS el desenfoque se aplica antes de la máscara: suaviza solo los bordes izquierdo y derecho, y las rayas quedan nítidas.
    col = interp(stops, y)
    edge = np.clip(np.minimum(x, W - 1 - x) / 16, 0, 1); col[..., 3] *= edge * edge * (3 - 2 * edge)
    col[..., 3] *= px * fade
    save(col, name)
curtain([(0, (70,255,190,0)), (.30, (70,255,190,.7)), (.62, (60,200,160,.45)), (1, (60,130,255,0))], 'aurora-1.webp')
curtain([(0, (150,110,255,0)), (.34, (150,110,255,.62)), (.66, (90,160,255,.4)), (1, (60,130,255,0))], 'aurora-2.webp')
curtain([(0, (255,110,200,0)), (.36, (255,110,200,.5)), (.68, (180,100,255,.32)), (1, (60,130,255,0))], 'aurora-3.webp')
