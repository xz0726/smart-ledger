#!/usr/bin/env python3
"""从「清新薄荷 Z 账本线」SVG 生成 Android 图标资源（legacy / adaptive / 闪屏 logo）。

用法:
    python3 scripts/gen_mint_icons.py --svg <path/to/清新薄荷-Z账本线.svg> --res-dir android/app/src/main/res

- 主方案: cairosvg 光栅化（本机未装则自动跳过）
- 兜底: 纯 Pillow + numpy 按 SVG 参数复刻（渐变圆角矩形 + 两条圆头 Z 笔画）
- 输出: mipmap-*/ic_launcher{.webp,_round.webp,_foreground.webp}、drawable-*/splashscreen_logo.png
"""
import argparse
import os
import sys

from PIL import Image, ImageDraw

# 清新薄荷 SVG 的关键参数（viewBox 0 0 1024 1024）
G_BG_A = (234, 251, 240)   # #EAFBF0
G_BG_B = (188, 235, 211)   # #BCEBD3
GREEN  = (14, 124, 102)    # #0E7C66
CORNER_R = 224             # 圆角矩形半径
# Z 笔画
Z_PTS   = [(336, 312), (688, 312), (336, 648), (688, 648)]
Z_W     = 72
B_PTS   = [(336, 736), (688, 736)]
B_W     = 56
B_ALPHA = 230              # opacity 0.9

DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
# 每种资源: (密度基准 dp, 是否圆形遮罩, 是否白底烘焙, 扩展名, 目录, 文件名)
MATRIX = [
    # legacy 方角（保留主图透明圆角）
    (('ic_launcher', 48,  False, False, 'webp', 'mipmap-{d}', 'ic_launcher.{ext}')),
    # round 圆形遮罩
    (('ic_launcher_round', 48, True,  False, 'webp', 'mipmap-{d}', 'ic_launcher_round.{ext}')),
    # adaptive 前景（全出血，Z 居中在安全区内）
    (('ic_launcher_foreground', 108, False, False, 'webp', 'mipmap-{d}', 'ic_launcher_foreground.{ext}')),
    # 闪屏 logo（白底烘焙，防透明区透黑）
    (('splashscreen_logo', 288, False, True,  'png',  'drawable-{d}', 'splashscreen_logo.{ext}')),
]
MATRIX = [tuple(t) for t in MATRIX]


def render_mint_cairosvg(svg_path, workdir, size=1024):
    try:
        import cairosvg
    except ImportError:
        return None
    out = os.path.join(workdir, 'master_mint_cairosvg.png')
    cairosvg.svg2png(url=svg_path, write_to=out, output_width=size, output_height=size)
    img = Image.open(out).convert('RGBA')
    if img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    return img


def render_mint_pil(size=1024):
    import numpy as np
    xs = np.arange(size, dtype=np.float64)
    t = (xs[None, :] + xs[:, None]) / (2.0 * size)   # 对角 TL→BR
    a = np.array(G_BG_A, dtype=np.float64)
    b = np.array(G_BG_B, dtype=np.float64)
    rgb = (a + (b - a) * t[..., None]).astype(np.uint8)
    img = Image.fromarray(
        np.dstack([rgb, np.full((size, size), 255, np.uint8)]), 'RGBA')

    # 圆角矩形 alpha（角外透明）
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=int(round(size * CORNER_R / 1024)), fill=255)
    img.putalpha(mask)

    def sc(pts):
        return [(round(x * size / 1024), round(y * size / 1024)) for x, y in pts]

    ov = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # Z 主笔画：折线 + 端点圆（round cap），joint='curve' 给出圆角转折（round join）
    zpts = sc(Z_PTS)
    w_z = max(1, round(size * Z_W / 1024))
    d.line(zpts, fill=GREEN + (255,), width=w_z, joint='curve')
    r_z = w_z // 2
    for p in (zpts[0], zpts[-1]):
        d.ellipse((p[0] - r_z, p[1] - r_z, p[0] + r_z, p[1] + r_z), fill=GREEN + (255,))

    # 底线：宽 56，round cap，opacity 0.9
    bpts = sc(B_PTS)
    w_b = max(1, round(size * B_W / 1024))
    d.line(bpts, fill=GREEN + (B_ALPHA,), width=w_b, joint='curve')
    r_b = w_b // 2
    for p in bpts:
        d.ellipse((p[0] - r_b, p[1] - r_b, p[0] + r_b, p[1] + r_b), fill=GREEN + (B_ALPHA,))

    return Image.alpha_composite(img, ov)


def bake_white(img):
    """白底烘焙：透明区填白，alpha 全 255（闪屏 windowBackground 位图防透黑）"""
    bg = Image.new('RGBA', img.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, img)


def circle_alpha(size):
    """内切圆 alpha 遮罩（2x 超采样降采样，抗锯齿圆边）"""
    m = Image.new('L', (size * 2, size * 2), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * 2 - 1, size * 2 - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def save_res(img, path, ext):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if ext == 'webp':
        try:
            img.save(path, 'WEBP', quality=92, method=6)
            return
        except Exception as e:
            print(f'  [warn] webp 保存失败({e})，降级为 png: {path}')
            path = path[:-5] + '.png'
    img.save(path, 'PNG')


def gen_all(master, master_splash, res_dir, force_png=False):
    written = []
    for (name, base_dp, round_mask, bake, ext, dir_tpl, file_tpl) in MATRIX:
        src = master_splash if bake else master
        for d, f in DENS.items():
            target = round(base_dp * f)
            im = src.resize((target, target), Image.LANCZOS)
            if round_mask:
                im = im.copy()
                im.putalpha(circle_alpha(target))
            out_ext = 'png' if (force_png and ext == 'webp') else ext
            out_dir = dir_tpl.format(d=d)
            out_name = file_tpl.format(d=d, ext=out_ext)
            out_path = os.path.join(res_dir, out_dir, out_name)
            save_res(im, out_path, out_ext)
            written.append(out_path)
    return written


def selfcheck(res_dir):
    """每个密度目录每种资源名恰一个文件（残留旧扩展会引发重复资源错误）"""
    import collections
    counts = collections.Counter()
    for root, _dirs, files in os.walk(res_dir):
        d = os.path.basename(root)
        if not (d.startswith('mipmap-') or d.startswith('drawable-')):
            continue
        for f in files:
            name = os.path.splitext(f)[0]
            if name in ('ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'splashscreen_logo'):
                counts[(d, name)] += 1
    dup = [k for k, v in counts.items() if v > 1]
    if dup:
        print('[!!] 重复资源（同目录同名不同扩展）:', dup)
        sys.exit(1)
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--svg', required=True)
    ap.add_argument('--res-dir', required=True)
    ap.add_argument('--workdir', default='scripts/build')
    ap.add_argument('--force-png', action='store_true', help='mipmap 也输出 png 而非 webp')
    args = ap.parse_args()

    os.makedirs(args.workdir, exist_ok=True)

    master = render_mint_cairosvg(args.svg, args.workdir, 1024)
    source = 'cairosvg'
    if master is None:
        master = render_mint_pil(1024)
        source = 'Pillow 兜底'
    print(f'主图渲染完成（{source}）: {master.size} {master.mode}')

    master_path = os.path.join(args.workdir, 'master_mint.png')
    master.save(master_path)
    master_splash = bake_white(master)
    master_splash.save(os.path.join(args.workdir, 'master_splash.png'))

    # 自检：四角应透明（圆角矩形外），中心应是薄荷渐变
    corner = master.getpixel((2, 2))[3]
    center = master.getpixel((512, 512))[:3]
    splash_corner = master_splash.getpixel((2, 2))
    print(f'校验: 主图四角 alpha={corner}（应为 0），中心色={center}，闪屏四角={splash_corner}（应为白）')
    if corner != 0:
        print('[warn] 主图四角非透明，请检查 SVG 圆角')
    if splash_corner[:3] != (255, 255, 255):
        print('[warn] 闪屏主图四角非白，请检查白底烘焙')

    written = gen_all(master, master_splash, args.res_dir, force_png=args.force_png)
    print(f'写回 {len(written)} 个资源文件:')
    for p in sorted(written):
        print('  ' + p)

    counts = selfcheck(args.res_dir)
    print(f'自检通过: 资源计数 {len(counts)} 个（(密度, 资源名) 均唯一）')


if __name__ == '__main__':
    main()
