#!/usr/bin/env python3
"""git — a 60-second motion-graphics showreel, told through a robotics project.

Everything is procedural: frames are drawn with PIL, post-processed with
NumPy/SciPy (bloom, chromatic aberration, grain), the soundtrack is synthesised
sample-by-sample with NumPy, and FFmpeg muxes the result.

    python video/showreel.py                  # full 1080p render -> video/git_showreel.mp4
    python video/showreel.py --stills 3,7,21  # dump PNG stills at those seconds
    python video/showreel.py --preview        # quick 540p render
"""
import argparse
import hashlib
import math
import os
import subprocess
import sys
import time
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage, signal
from scipy.io import wavfile

# ─────────────────────────────────────────────────────────── constants ──
W, H, FPS, DUR = 1920, 1080, 30, 60.0
NFRAMES = int(DUR * FPS)
S = 2                       # supersampling factor for anti-aliased drawing
BPM = 120
BEAT = 60 / BPM
HERE = os.path.dirname(os.path.abspath(__file__))

BG = (10, 14, 23)
PANEL = (15, 20, 33)
ORANGE = (240, 80, 51)
CYAN = (61, 220, 255)
LIME = (163, 255, 107)
MAGENTA = (255, 79, 216)
WHITE = (232, 238, 247)
DIM = (112, 124, 148)
RED = (255, 64, 84)
YELLOW = (255, 204, 64)

FONTS = {
    'sans': '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    'bold': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    'mono': '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    'monob': '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
}

# Scene boundaries (every cut lands on a beat).
CUTS = [4, 10, 16, 26, 32, 40, 45, 53]

# Typed terminal commands: name -> (start, text, chars/sec). Drives both the
# typewriter visuals and the key-click audio.
TY = {
    'init': (0.45, 'git init rover-nav', 15),
    'add': (10.5, 'git add pid.py lidar.cpp', 32),
    'cm': (12.4, 'git commit -m "feat: obstacle avoidance"', 44),
    'sw1': (16.5, 'git switch -c feature/slam', 36),
    'sw2': (18.0, 'git switch -c exp/rl-gait main', 40),
    'del': (22.6, 'git branch -D exp/rl-gait', 36),
    'merge': (26.8, 'git merge feature/slam', 32),
    'resolve': (29.7, 'git commit -am "Merge feature/slam"', 44),
    'bs': (33.7, 'git bisect start HEAD v0.9', 44),
    'reset': (40.3, 'git reset --hard HEAD~3', 40),
    'reflog': (42.1, 'git reflog', 28),
    'restore': (43.2, 'git reset --hard HEAD@{1}', 46),
    'push': (45.2, 'git push origin main', 36),
    'tag': (48.1, 'git tag v1.0 && git push --tags', 50),
}

# Scene 1: four commits build the rover.
C1_T = [5.0, 6.5, 8.0, 9.0]
C1_MSG = ['feat: chassis + motor driver', 'feat: 2D lidar driver',
          'feat: IMU sensor fusion', 'tune: PID gains']
for _i, (_t, _m) in enumerate(zip(C1_T, C1_MSG)):
    _cmd = f'git commit -m "{_m}"'
    TY[f'c{_i}'] = (_t - 0.95, _cmd, len(_cmd) / 0.8)

# Scene 5: bisect.
BIS_TESTS = [35.0, 36.0, 37.0, 38.0]
BIS_STEPS = [(7, 'good'), (11, 'bad'), (9, 'good'), (10, 'good')]
BIS_RANGES = [(0, 15), (7, 15), (7, 11), (9, 11), (10, 11)]
BIS_OUT = ['Bisecting: 7 revisions left to test after this (roughly 3 steps)',
           'Bisecting: 3 revisions left to test after this (roughly 2 steps)',
           'Bisecting: 1 revision left to test after this (roughly 1 step)',
           'Bisecting: 0 revisions left to test after this (roughly 0 steps)',
           'e7b2d41 is the first bad commit']
for _i, (_t, (_idx, _v)) in enumerate(zip(BIS_TESTS, BIS_STEPS)):
    TY[f'b{_i}'] = (_t + 0.75, f'git bisect {_v}', 60)

# Scene 7: rovers light up in sequence.
FLEET_T = [49.8 + 0.06 * k for k in range(12)]

# Visual/audio impact moments: (time, strength).
IMPACTS = [(3.0, 1.0), (4.0, 0.8), (5.0, .45), (6.5, .45), (8.0, .45), (9.0, .45),
           (14.0, .6), (27.8, 1.0), (30.9, .8), (33.0, 1.0), (38.8, .7),
           (44.6, .6), (48.8, .6), (56.0, 1.3)]
GLITCHES = [(27.8, 0.45), (33.0, 0.3), (41.0, 0.25)]


# ───────────────────────────────────────────────────────────── helpers ──
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else float(t >= a)


def e_out(x):
    return 1 - (1 - x) ** 3


def e_in(x):
    return x ** 3


def e_expo(x):
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def e_io(x):
    return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


def e_back(x):
    c1 = 1.70158
    return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2


def lerp(a, b, x):
    return a + (b - a) * x


def mix(c1, c2, x):
    return tuple(int(lerp(a, b, x)) for a, b in zip(c1, c2))


def rgba(c, a=1.0):
    return (c[0], c[1], c[2], int(255 * clamp(a)))


def sha(s):
    return hashlib.sha1(s.encode()).hexdigest()[:7]


def typed(t, name):
    start, text, cps = TY[name]
    n = int(clamp((t - start) * cps, 0, len(text)))
    return text[:n]


def typing_done(t, name):
    start, text, cps = TY[name]
    return t >= start + len(text) / cps


def bezier(p0, p1, p2, p3, u):
    v = 1 - u
    return (v**3 * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u**3 * p3[0],
            v**3 * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u**3 * p3[1])


@lru_cache(maxsize=None)
def font(name, size):
    return ImageFont.truetype(FONTS[name], int(round(size * S)))


# ─────────────────────────────────────────────────────── drawing layer ──
def _vis(*cols):
    """PIL draws alpha-0 RGBA ink as opaque, so skip fully transparent calls."""
    return any(c is not None and (len(c) < 4 or c[3] > 0) for c in cols)


class Cv:
    """Thin wrapper: all coordinates are in 1080p space, drawn at S× scale."""

    def __init__(self, img):
        self.img = img
        self.d = ImageDraw.Draw(img, 'RGBA')

    def circle(self, x, y, r, fill=None, outline=None, width=2):
        if r <= 0.2 or not _vis(fill, outline):
            return
        self.d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S],
                       fill=fill, outline=outline, width=max(1, int(width * S)))

    def line(self, pts, fill, width=2):
        if not _vis(fill):
            return
        self.d.line([(x * S, y * S) for x, y in pts], fill=fill,
                    width=max(1, int(width * S)), joint='curve')

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=2, r=0):
        if x1 - x0 < 1 or y1 - y0 < 1 or not _vis(fill, outline):
            return
        box = [x0 * S, y0 * S, x1 * S, y1 * S]
        if r > 0:
            rr = min(r, (x1 - x0) / 2, (y1 - y0) / 2) * S
            self.d.rounded_rectangle(box, radius=rr, fill=fill, outline=outline,
                                     width=max(1, int(width * S)))
        else:
            self.d.rectangle(box, fill=fill, outline=outline, width=max(1, int(width * S)))

    def poly(self, pts, fill=None, outline=None, width=2):
        if not _vis(fill, outline):
            return
        self.d.polygon([(x * S, y * S) for x, y in pts], fill=fill, outline=outline,
                       width=max(1, int(width * S)))

    def pie(self, x, y, r, a0, a1, fill):
        if not _vis(fill):
            return
        self.d.pieslice([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], a0, a1, fill=fill)

    def arc(self, x, y, r, a0, a1, fill, width=2):
        self.d.arc([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], a0, a1,
                   fill=fill, width=max(1, int(width * S)))

    def tlen(self, txt, size, f='sans', track=0):
        return self.d.textlength(txt, font=font(f, size)) / S + track * max(0, len(txt) - 1)

    def text(self, x, y, txt, size, fill, f='sans', anchor='la', track=0):
        if not txt or not _vis(fill):
            return
        if track == 0:
            self._text(x * S, y * S, txt, font(f, size), fill, anchor)
            return
        total = self.tlen(txt, size, f, track)
        if anchor[0] == 'm':
            x -= total / 2
        elif anchor[0] == 'r':
            x -= total
        a = 'l' + anchor[1]
        for ch in txt:
            self._text(x * S, y * S, ch, font(f, size), fill, a)
            x += self.tlen(ch, size, f) + track

    def _text(self, x, y, txt, fnt, fill, anchor):
        if not txt.strip():
            return
        # PIL ignores ink alpha for text on an RGB canvas, so translucent text
        # is rendered into a mask and pasted with the alpha folded in.
        if len(fill) < 4 or fill[3] >= 255:
            self.d.text((x, y), txt, font=fnt, fill=fill[:3], anchor=anchor)
            return
        x0, y0, x1, y1 = self.d.textbbox((x, y), txt, font=fnt, anchor=anchor)
        x0, y0 = int(math.floor(x0)), int(math.floor(y0))
        w, h = int(math.ceil(x1)) - x0 + 1, int(math.ceil(y1)) - y0 + 1
        if w <= 0 or h <= 0:
            return
        mask = Image.new('L', (w, h), 0)
        ImageDraw.Draw(mask).text((x - x0, y - y0), txt, font=fnt, fill=fill[3], anchor=anchor)
        self.img.paste(fill[:3], (x0, y0, x0 + w, y0 + h), mask)


def node(c, x, y, r, col, a=1.0, core=True):
    if a <= 0:
        return
    c.circle(x, y, r * 2.0, fill=rgba(col, .10 * a))
    c.circle(x, y, r, fill=rgba(col, a))
    if core:
        c.circle(x, y, r * .45, fill=rgba(BG, a))


def ripple(c, x, y, t, t0, col, rmax=70, dur=.55, width=3):
    p = prog(t, t0, t0 + dur)
    if 0 < p < 1:
        c.circle(x, y, lerp(8, rmax, e_out(p)), outline=rgba(col, (1 - p) * .9), width=width)


def pill(c, x, y, txt, col, a=1.0, size=20, anchor='l', solid=False):
    if a <= 0:
        return 0
    w = c.tlen(txt, size, 'monob') + 26
    h = size + 16
    x0 = x if anchor == 'l' else x - w / 2 if anchor == 'm' else x - w
    c.rect(x0, y - h / 2, x0 + w, y + h / 2, fill=rgba(col, (.9 if solid else .16) * a),
           outline=rgba(col, a), width=2, r=h / 2)
    c.text(x0 + w / 2, y + 1, txt, size, rgba(BG if solid else col, a), 'monob', 'mm')
    return w


def terminal(c, x, y, w, lines, a=1.0, h=None, size=24, title='rover-nav — zsh'):
    """lines: list of (text, color) or (text, color, is_prompt)."""
    if a <= 0:
        return
    lh = size * 1.5
    h = h or 58 + max(1, len(lines)) * lh
    c.rect(x, y, x + w, y + h, fill=rgba(PANEL, .94 * a), outline=rgba((48, 60, 86), a), width=2, r=14)
    for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        c.circle(x + 22 + i * 20, y + 20, 6, fill=rgba(col, .85 * a))
    c.text(x + w / 2, y + 20, title, 15, rgba(DIM, .8 * a), 'mono', 'mm')
    for i, ln in enumerate(lines):
        txt, col = ln[0], ln[1]
        prompt = len(ln) > 2 and ln[2]
        ty = y + 46 + i * lh
        if prompt:
            c.text(x + 24, ty, '$', size, rgba(ORANGE, a), 'monob')
            c.text(x + 24 + c.tlen('$ ', size, 'mono'), ty, txt, size, rgba(col, a), 'mono')
        else:
            c.text(x + 24, ty, txt, size, rgba(col, a), 'mono')


def cmd_line(t, name, cursor=True):
    """Typed command with a block cursor while typing (and blinking after)."""
    s = typed(t, name)
    if cursor:
        if not typing_done(t, name) or (t * 2.5) % 1 < .55:
            s += '█'
    return s


def headline(c, t, t0, t1, num, tag, title, col=ORANGE):
    ai = e_out(prog(t, t0 + .05, t0 + .55))
    a = ai * (1 - prog(t, t1 - .25, t1))
    if a <= 0:
        return
    dx = (1 - ai) * -50
    c.text(100 + dx, 92, num, 22, rgba(col, a), 'monob')
    c.text(146 + dx, 92, tag, 22, rgba(WHITE, a * .75), 'monob', track=7)
    c.rect(100, 128, 100 + 70 * ai, 132, fill=rgba(col, a))
    c.text(100 + dx * 1.6, 146, title, 54, rgba(WHITE, a), 'bold')


def rot(lx, ly, x, y, ang, sc):
    ca, sa = math.cos(ang), math.sin(ang)
    return x + sc * (lx * ca - ly * sa), y + sc * (lx * sa + ly * ca)


def rrect_pts(cx, cy, hx, hy, x, y, ang, sc):
    return [rot(cx + px, cy + py, x, y, ang, sc) for px, py in
            [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]]


def rover(c, x, y, ang, sc, col, a=1.0, parts=(1, 1, 1, 1), t=0.0, sweep_r=0,
          width=3, spin=0.0):
    """Top-down rover. parts = reveal amounts (chassis, wheels, lidar, imu)."""
    pc, pw, pl, pi = parts
    if a <= 0:
        return
    # lidar sweep cone
    if sweep_r and pl > 0:
        lx, ly = rot(14, 0, x, y, ang, sc)
        sa = math.degrees(ang) + (t * 260) % 360
        for k in range(6):
            c.pie(lx, ly, sweep_r * pl, sa - 8 * (k + 1), sa - 8 * k, rgba(col, .16 * a * pl * (1 - k / 6)))
    if pw > 0:
        s = e_back(pw)
        for wx in (-34, 34):
            for wy in (-40, 40):
                c.poly(rrect_pts(wx, wy, 17 * s, 8 * s, x, y, ang, sc), fill=rgba(BG, a * pw),
                       outline=rgba(col, a * pw), width=width)
                # tread marks that slide when spinning
                for k in range(3):
                    off = ((k / 3 + spin) % 1) * 34 - 17
                    p0 = rot(wx + off * s, wy - 7 * s, x, y, ang, sc)
                    p1 = rot(wx + off * s, wy + 7 * s, x, y, ang, sc)
                    c.line([p0, p1], rgba(col, .5 * a * pw), max(1, width * .5))
    if pc > 0:
        s = e_back(pc)
        c.poly(rrect_pts(0, 0, 52 * s, 30 * s, x, y, ang, sc), fill=rgba(mix(BG, col, .14), a * pc),
               outline=rgba(col, a * pc), width=width)
        c.poly([rot(52 * s, -10 * s, x, y, ang, sc), rot(64 * s, 0, x, y, ang, sc),
                rot(52 * s, 10 * s, x, y, ang, sc)], fill=rgba(col, a * pc))
    if pl > 0:
        s = e_back(pl)
        lx, ly = rot(14, 0, x, y, ang, sc)
        c.circle(lx, ly, 14 * s * sc, fill=rgba(BG, a * pl), outline=rgba(col, a * pl), width=width)
        c.circle(lx, ly, 5 * s * sc, fill=rgba(col, a * pl))
    if pi > 0:
        s = e_back(pi)
        c.poly(rrect_pts(-28, 0, 9 * s, 9 * s, x, y, ang, sc), fill=rgba(YELLOW, .25 * a * pi),
               outline=rgba(YELLOW, a * pi), width=max(1, width * .7))


def logo_pts(cx, cy, R):
    return [(cx, cy - R), (cx + R, cy), (cx, cy + R), (cx - R, cy)]


def draw_logo(c, cx, cy, R, a=1.0, col=ORANGE):
    if a <= 0 or R <= 1:
        return
    c.poly(logo_pts(cx, cy, R), fill=rgba(col, a))
    u = R / 100
    ink = rgba(BG, a)
    A, B, Cc = (cx - 18 * u, cy - 36 * u), (cx - 18 * u, cy + 36 * u), (cx + 26 * u, cy - 4 * u)
    c.line([A, B], ink, 10 * u)
    pts = [bezier((cx - 18 * u, cy - 20 * u), (cx - 18 * u, cy - 4 * u),
                  (cx + 4 * u, cy - 4 * u), Cc, k / 12) for k in range(13)]
    c.line(pts, ink, 10 * u)
    for p in (A, B, Cc):
        c.circle(p[0], p[1], 12 * u, fill=ink)


# Deterministic particle sets --------------------------------------------------
_rng = np.random.default_rng(7)


def diamond_points(n, cx, cy, R, rng):
    u = rng.uniform(-1, 1, n)
    v = rng.uniform(-1, 1, n)
    # map square -> diamond (rotate 45° and scale)
    return np.stack([cx + (u - v) * R / 2, cy + (u + v) * R / 2], 1)


INTRO_N = 520
_ang = _rng.uniform(0, 2 * math.pi, INTRO_N)
_rad = _rng.uniform(650, 1250, INTRO_N)
INTRO_START = np.stack([760 + np.cos(_ang) * _rad, 520 + np.sin(_ang) * _rad * .7], 1)
INTRO_TGT = diamond_points(INTRO_N, 700, 520, 150, _rng)
INTRO_DELAY = _rng.uniform(0, .45, INTRO_N)
INTRO_COL = _rng.integers(0, 4, INTRO_N)

DISSOLVE_V = _rng.normal(0, 1, (3, 36, 2)) * np.array([120, 90]) + np.array([90, -60])

# Scene 3 SLAM occupancy map.
SLAM_COLS, SLAM_ROWS, SLAM_CELL = 17, 4, 26
SLAM_OBS = _rng.random((SLAM_ROWS, SLAM_COLS)) < .26

# Outro commit graph (world coordinates).
OUTRO_NODES = []   # (x, y, col)
OUTRO_EDGES = []   # ((x0,y0),(x1,y1),col)
_lanes = [(380, ORANGE), (480, CYAN), (580, MAGENTA), (680, LIME)]
for _k in range(27):
    OUTRO_NODES.append((_k * 100, 380, ORANGE))
    if _k:
        OUTRO_EDGES.append(((_k * 100 - 100, 380), (_k * 100, 380), ORANGE))
for _li, _x0, _x1 in [(1, 100, 700), (2, 300, 1100), (3, 600, 900), (1, 1000, 1700),
                      (3, 1200, 2100), (2, 1500, 2300), (1, 1900, 2500)]:
    _y, _col = _lanes[_li]
    OUTRO_EDGES.append(((_x0 - 100, 380), (_x0, _y), _col))
    for _x in range(_x0, _x1 + 1, 100):
        OUTRO_NODES.append((_x, _y, _col))
        if _x > _x0:
            OUTRO_EDGES.append(((_x - 100, _y), (_x, _y), _col))
    OUTRO_EDGES.append(((_x1, _y), (_x1 + 100, 380), _col))
OUTRO_TGT = diamond_points(len(OUTRO_NODES), 960, 390, 150, _rng)
OUTRO_DELAY = _rng.uniform(0, .3, len(OUTRO_NODES))


# ──────────────────────────────────────────────────────────── scenes ──
def scene_intro(c, t):
    a_term = 1 - prog(t, 2.2, 2.6)
    full = '$ git init rover-nav'
    x0 = 960 - c.tlen(full, 52, 'mono') / 2
    if a_term > 0:
        c.text(x0, 470, '$', 52, rgba(ORANGE, a_term), 'monob')
        s = typed(t, 'init')
        if not typing_done(t, 'init') or (t * 2.5) % 1 < .55:
            s += '█'
        c.text(x0 + c.tlen('$ ', 52, 'mono'), 470, s, 52, rgba(WHITE, a_term), 'mono')
        ao = prog(t, 1.8, 1.95) * a_term
        c.text(x0, 555, 'Initialized empty Git repository in ~/rover-nav/.git/', 24,
               rgba(DIM, ao), 'mono')
    # particles converge into the logo
    if t > 2.1:
        cols = [ORANGE, CYAN, MAGENTA, WHITE]
        fade = 1 - prog(t, 3.0, 3.3)
        for i in range(INTRO_N):
            k = e_expo(prog(t, 2.1 + INTRO_DELAY[i], 2.95 + INTRO_DELAY[i] * .1))
            if k <= 0:
                continue
            x = lerp(INTRO_START[i, 0], INTRO_TGT[i, 0], k)
            y = lerp(INTRO_START[i, 1], INTRO_TGT[i, 1], k)
            col = mix(cols[INTRO_COL[i]], ORANGE, k)
            c.circle(x, y, 2.6 + (1 - k) * 2, fill=rgba(col, min(1, k * 3) * fade))
    if t > 2.95:
        s = e_back(prog(t, 2.95, 3.25))
        pulse = 1 + .04 * math.exp(-max(0, t - 3.0) * 6)
        draw_logo(c, 700, 520, 150 * s * pulse, clamp((t - 2.95) * 8))
        at = prog(t, 3.0, 3.2)
        dx = (1 - e_expo(at)) * 120
        c.text(900 + dx, 520, 'git', 230, rgba(WHITE, at), 'bold', 'lm')
        ag = prog(t, 3.35, 3.7)
        c.text(912, 668, 'A 60-SECOND SHOWREEL  ·  STARRING A ROBOT', 22, rgba(DIM, ag), 'monob', 'lm', track=4)


def scene_commit(c, t):
    headline(c, t, 4, 10, '01', 'COMMIT', 'Every change. Snapshotted. Forever.')
    # blueprint backdrop
    cx, cy = 520, 640
    ab = e_out(prog(t, 4.0, 4.6)) * (1 - prog(t, 9.75, 10))
    for r, a in [(300, .10), (230, .14), (150, .10)]:
        c.circle(cx, cy, r * (0.8 + .2 * ab), outline=rgba(CYAN, a * ab), width=1.5)
    c.line([(cx - 330, cy), (cx + 330, cy)], rgba(CYAN, .09 * ab), 1)
    c.line([(cx, cy - 330), (cx, cy + 330)], rgba(CYAN, .09 * ab), 1)
    for k in range(24):
        a0 = k * 15
        p0 = (cx + math.cos(math.radians(a0)) * 300, cy + math.sin(math.radians(a0)) * 300)
        p1 = (cx + math.cos(math.radians(a0)) * 312, cy + math.sin(math.radians(a0)) * 312)
        c.line([p0, p1], rgba(CYAN, .3 * ab), 2)
    parts = [prog(t, T, T + .45) for T in C1_T]
    moving = e_io(prog(t, 9.0, 10.5))
    ry = cy - moving * 40
    spin = moving * 2
    rover(c, cx, ry, -math.pi / 2, 2.5, CYAN, ab or 1, (parts[0], parts[0], parts[1], parts[2]), t,
          sweep_r=260 if parts[1] > 0 else 0, width=3, spin=spin)
    # callout labels per part
    labels = [('motor driver', (cx + 150, cy + 100)), ('lidar', (cx + 150, cy - 40)),
              ('imu', (cx - 220, cy + 70))]
    for i, (lab, (lx, ly)) in enumerate(labels):
        la = prog(t, C1_T[i] + .15, C1_T[i] + .4) * (1 - prog(t, 9.75, 10))
        c.text(lx, ly, lab.upper(), 16, rgba(CYAN, la * .8), 'monob', track=3)
    if parts[3] > 0:
        pa = e_out(parts[3]) * (1 - prog(t, 9.75, 10))
        c.line([(cx + 60, cy - 170), (cx + 60, cy - 240)], rgba(LIME, pa), 3)
        c.poly([(cx + 50, cy - 238), (cx + 70, cy - 238), (cx + 60, cy - 256)], fill=rgba(LIME, pa))
        c.text(cx + 80, cy - 230, 'Kp 0.8  Ki 0.1  Kd 0.05', 18, rgba(LIME, pa), 'mono')
    for i, T in enumerate(C1_T[:3]):
        ripple(c, cx, cy, t, T, CYAN, 220, .6)

    # commit log (newest on top)
    lx = 1080
    for k, T in enumerate(C1_T):
        if t < T:
            continue
        idx = sum(e_out(prog(t, C1_T[j], C1_T[j] + .35)) for j in range(k + 1, 4))
        y = 330 + idx * 100
        ap = e_out(prog(t, T, T + .3)) * (1 - prog(t, 9.75, 10))
        dx = (1 - ap) * 50
        if k > 0 and t >= T:
            idx_prev = sum(e_out(prog(t, C1_T[j], C1_T[j] + .35)) for j in range(k, 4))
            c.line([(lx + 20, y + 16), (lx + 20, 330 + idx_prev * 100 - 16)], rgba(DIM, .6 * ap), 3)
        node(c, lx + 20, y, 13, ORANGE, ap)
        ripple(c, lx + 20, y, t, T, ORANGE, 60)
        h = sha(C1_MSG[k])
        nh = int(clamp((t - T) / .25) * 7)
        c.text(lx + 56 + dx, y, h[:nh], 28, rgba(ORANGE, ap), 'monob', 'lm')
        c.text(lx + 200 + dx, y, C1_MSG[k], 28, rgba(WHITE, ap), 'sans', 'lm')
        if k == max(i for i, TT in enumerate(C1_T) if t >= TT):
            pill(c, lx + 56 + dx, y + 40, 'HEAD → main', ORANGE, ap, 15)
    # terminal
    cur = max([i for i, TT in enumerate(C1_T) if t >= TY[f'c{i}'][0]], default=-1)
    ta = e_out(prog(t, 4.0, 4.4)) * (1 - prog(t, 9.75, 10))
    lines = []
    if cur >= 0:
        lines.append((cmd_line(t, f'c{cur}'), WHITE, True))
        if t >= C1_T[cur]:
            lines.append((f'[main {sha(C1_MSG[cur])}] {C1_MSG[cur]}', DIM))
    terminal(c, 1080, 800, 740, lines, ta, h=58 + 2 * 36, size=22)


def card(c, x, y, name, col, a=1.0, badge='M', bcol=YELLOW, sc=1.0):
    if a <= 0 or sc <= 0.02:
        return
    w, h = 300 * sc, 60 * sc
    c.rect(x - w / 2, y - h / 2, x + w / 2, y + h / 2, fill=rgba(PANEL, .96 * a),
           outline=rgba(col, a), width=2, r=10 * sc)
    c.rect(x - w / 2 + 16 * sc, y - 16 * sc, x - w / 2 + 40 * sc, y + 16 * sc,
           outline=rgba(col, .8 * a), width=2, r=3 * sc)
    c.text(x - w / 2 + 56 * sc, y, name, 24 * sc, rgba(WHITE, a), 'mono', 'lm')
    c.text(x + w / 2 - 22 * sc, y, badge, 24 * sc, rgba(bcol, a), 'monob', 'mm')


def scene_trees(c, t):
    headline(c, t, 10, 16, '02', 'THE THREE TREES', 'Stage exactly what you mean.')
    out = 1 - prog(t, 15.75, 16)
    cols = [(380, 'WORKING DIR', YELLOW), (960, 'STAGING AREA', LIME), (1540, 'REPOSITORY', ORANGE)]
    for i, (x, lab, col) in enumerate(cols):
        a = e_out(prog(t, 10.0 + i * .1, 10.5 + i * .1)) * out
        dy = (1 - a) * 40
        glow = 0
        if i == 1:
            glow = math.exp(-max(0, t - 12.3) * 4) if t > 11.6 else 0
        if i == 2:
            glow = math.exp(-max(0, t - 14.0) * 4) if t > 13.9 else 0
        c.rect(x - 230, 290 + dy, x + 230, 790 + dy, fill=rgba(mix(BG, col, .05), a),
               outline=rgba(mix((48, 60, 86), col, glow), a), width=2 + 2 * glow, r=18)
        c.text(x, 322 + dy, lab, 20, rgba(col, a), 'monob', 'mm', track=5)
    # arrows between columns
    for x in (670, 1250):
        aa = prog(t, 10.3, 10.7) * out
        c.line([(x - 22, 540), (x + 16, 540)], rgba(DIM, aa), 3)
        c.poly([(x + 14, 530), (x + 30, 540), (x + 14, 550)], fill=rgba(DIM, aa))
    # repo chain (previous commits)
    for k in range(4):
        a = prog(t, 10.2 + k * .08, 10.5 + k * .08) * out
        y = 720 - k * 80
        if k:
            c.line([(1540, y + 80 - 14), (1540, y + 14)], rgba(DIM, .6 * a), 3)
        node(c, 1540, y, 12, ORANGE, a * .7)
        c.text(1570, y, sha(C1_MSG[k]), 18, rgba(DIM, a), 'mono', 'lm')
    # new commit node
    if t >= 14.0:
        a = out
        c.line([(1540, 480 - 14), (1540, 400 + 14)], rgba(DIM, .6 * a), 3)
        s = e_back(prog(t, 14.0, 14.35))
        node(c, 1540, 400, 15 * s, ORANGE, a)
        ripple(c, 1540, 400, t, 14.0, ORANGE, 110)
        la = prog(t, 14.1, 14.4) * a
        c.text(1572, 390, sha('feat: obstacle avoidance'), 20, rgba(ORANGE, la), 'monob', 'lm')
        c.text(1572, 416, 'feat: obstacle avoidance', 16, rgba(WHITE, la), 'sans', 'lm')
    # cards
    files = ['pid.py', 'lidar.cpp', 'rover.urdf']
    for i, f in enumerate(files):
        a0 = e_out(prog(t, 10.4 + i * .1, 10.8 + i * .1)) * out
        x, y = 380, 400 + i * 90
        badge, bcol, sc, a = 'M', YELLOW, 1.0, a0
        if i < 2:
            p1 = e_io(prog(t, 11.45 + i * .12, 12.15 + i * .12))
            x = lerp(380, 960, p1)
            y = lerp(400 + i * 90, 400 + i * 90, p1) - math.sin(math.pi * p1) * 90
            if p1 >= 1:
                bcol = LIME
            p2 = e_io(prog(t, 13.5 + i * .1, 14.0 + i * .1))
            if p2 > 0:
                x = lerp(960, 1540, p2)
                y = lerp(400 + i * 90, 400, p2) - math.sin(math.pi * p2) * 80
                sc = lerp(1, .15, p2)
                a = a0 * (1 - prog(p2, .8, 1))
        card(c, x, y, f, WHITE if i < 2 else DIM, a, badge, bcol, sc)
    ha = prog(t, 14.4, 14.8) * out
    c.text(380, 650, 'still in progress —', 19, rgba(DIM, ha), 'sans', 'mm')
    c.text(380, 678, 'not part of this commit', 19, rgba(DIM, ha), 'sans', 'mm')
    # terminal
    lines = []
    if t >= TY['add'][0]:
        lines.append((cmd_line(t, 'add', t < TY['cm'][0]), WHITE, True))
    if t >= TY['cm'][0]:
        lines.append((cmd_line(t, 'cm'), WHITE, True))
    if t >= 14.0:
        lines = lines[1:] + [('[main 3f1a9c2] 2 files changed, 48 insertions(+)', DIM)]
    terminal(c, 460, 840, 1000, lines, e_out(prog(t, 10.2, 10.6)) * out, h=58 + 2 * 36, size=22)


LANE_Y = {'main': 360, 'slam': 520, 'rl': 680}
LANE_COL = {'main': ORANGE, 'slam': CYAN, 'rl': MAGENTA}
LANE_NAME = {'main': 'main', 'slam': 'feature/slam', 'rl': 'exp/rl-gait'}
LANE_COMMITS = {'main': [19.5], 'slam': [17.5, 18.5, 20.0, 21.5], 'rl': [19.0, 20.5, 21.3]}
LANE_FORK = {'slam': 17.3, 'rl': 18.8}


def lane_x(tc):
    return 580 + (tc - 17.0) * 130


def scene_branch(c, t):
    headline(c, t, 16, 26, '03', 'BRANCH', 'Experiment fearlessly. Main stays safe.')
    out = 1 - prog(t, 25.75, 26)
    dead = prog(t, 23.4, 24.4)
    # base main history
    for k in range(5):
        a = e_out(prog(t, 16.0 + k * .07, 16.4 + k * .07)) * out
        x = 140 + k * 110 - (1 - a) * 60
        if k:
            c.line([(x - 110 + 14, 360), (x - 14, 360)], rgba(ORANGE, .7 * a), 3)
        node(c, x, 360, 12, ORANGE, a)
    tips = {'main': (580, 16.0)}
    for lane in ('main', 'slam', 'rl'):
        y, col = LANE_Y[lane], LANE_COL[lane]
        la = out * (1 - dead if lane == 'rl' else 1)
        prev = (580, 360)
        if lane != 'main':
            tf = LANE_FORK[lane]
            if t < tf:
                continue
            p = e_io(prog(t, tf, tf + .3))
            first = (lane_x(LANE_COMMITS[lane][0]), y)
            pts = [bezier((580, 360), (620, 360), (600, y), first, u * p) for u in np.linspace(0, 1, 16)]
            c.line(pts, rgba(col, .7 * la), 3)
        for k, tc in enumerate(LANE_COMMITS[lane]):
            if t < tc - .25:
                break
            x = lane_x(tc)
            if k > 0 or lane == 'main':
                g = e_out(prog(t, tc - .25, tc))
                c.line([(prev[0] + 14, y), (lerp(prev[0] + 14, x - 14, g), y)], rgba(col, .7 * la), 3)
            if t >= tc:
                s = e_back(prog(t, tc, tc + .3))
                if lane == 'rl' and dead > 0:
                    # dissolve into drifting particles
                    for j in range(10):
                        ang = j * 2.4 + k
                        d = dead * 70
                        c.circle(x + math.cos(ang) * d, y + math.sin(ang) * d - dead * 30, 3,
                                 fill=rgba(col, 1 - dead))
                node(c, x, y, 12 * s, col, la)
                ripple(c, x, y, t, tc, col, 55)
                tips[lane] = (x, tc)
            prev = (x, y)
    # branch pills + HEAD
    head_lane = max(tips, key=lambda k: tips[k][1])
    if t > 22.6:
        head_lane = 'main'
    for lane, (x, tc) in tips.items():
        la = out * (1 - dead if lane == 'rl' else 1) * prog(t, 16.3, 16.6)
        w = pill(c, x + 30, LANE_Y[lane], LANE_NAME[lane], LANE_COL[lane], la, 18)
        if lane == head_lane:
            pill(c, x + 30 + w + 10, LANE_Y[lane], 'HEAD', WHITE, la, 16, solid=True)
    if dead > 0:
        c.text(140, 780, 'Dead end? Delete it. main never noticed.', 28, rgba(WHITE, prog(t, 24.0, 24.4) * out), 'sans')

    # live sim tiles
    x0, x1 = 1380, 1820
    for lane, t_on in (('main', 16.2), ('slam', 17.5), ('rl', 19.0)):
        if t < t_on:
            continue
        y, col = LANE_Y[lane], LANE_COL[lane]
        ta = e_out(prog(t, t_on, t_on + .35)) * out * (1 - dead if lane == 'rl' else 1)
        y0, y1 = y - 70, y + 70
        c.rect(x0, y0, x1, y1, fill=rgba(mix(BG, col, .05), .95 * ta), outline=rgba(col, .6 * ta), width=2, r=10)
        c.text(x0 + 12, y0 + 16, LANE_NAME[lane], 14, rgba(col, ta), 'monob', 'lm')
        if (t * 2) % 1 < .6:
            c.circle(x1 - 50, y0 + 16, 4, fill=rgba(RED, ta))
        c.text(x1 - 40, y0 + 16, 'SIM', 13, rgba(DIM, ta), 'monob', 'lm')
        if lane == 'main':
            w = (t - 16.2) * 1.8
            rx, ry = (x0 + x1) / 2 + math.cos(w) * 160, y + 10 + math.sin(w) * 32
            ang = math.atan2(math.cos(w) * 32, -math.sin(w) * 160)
            rover(c, rx, ry, ang, .32, col, ta, t=t, width=1.5, spin=t)
        elif lane == 'slam':
            gx0, gy0 = x0 + 10, y0 + 32
            rxp = gx0 + 20 + (SLAM_COLS * SLAM_CELL - 40) * (.5 - .5 * math.cos((t - 17.5) * .8))
            ryp = gy0 + SLAM_ROWS * SLAM_CELL / 2
            for i in range(SLAM_ROWS):
                for j in range(SLAM_COLS):
                    ccx = gx0 + j * SLAM_CELL + SLAM_CELL / 2
                    # revealed once the rover's lidar has swept past it
                    tr = slam_reveal(i, j)
                    if t < tr:
                        continue
                    ra = prog(t, tr, tr + .3) * ta
                    cy_ = gy0 + i * SLAM_CELL
                    if SLAM_OBS[i, j]:
                        c.rect(ccx - 11, cy_ + 2, ccx + 11, cy_ + 24, fill=rgba(col, .75 * ra), r=3)
                    else:
                        c.rect(ccx - 11, cy_ + 2, ccx + 11, cy_ + 24, outline=rgba(col, .18 * ra), width=1, r=3)
            rover(c, rxp, ryp, 0 if math.sin((t - 17.5) * .8) >= 0 else math.pi, .3, WHITE, ta,
                  t=t, sweep_r=85, width=1.5, spin=t)
        else:
            trail = []
            for k in range(26):
                tk = t - k * .03
                trail.append(rl_pos(tk, x0, x1, y))
            c.line(trail, rgba(col, .5 * ta), 2)
            px, py = trail[0]
            qx, qy = trail[1]
            rover(c, px, py, math.atan2(py - qy, px - qx), .3, col, ta, t=t, width=1.5, spin=t)
            rew = min(.94, .12 + (t - 19) * .22)
            c.text(x1 - 12, y1 - 16, f'reward {rew:.2f}', 14, rgba(col, ta), 'mono', 'rm')
    if dead > 0 and t > 23.4:
        da = (1 - prog(t, 25.0, 25.5)) * out
        c.text((x0 + x1) / 2, 680, '✗ deleted', 26, rgba(RED, da * prog(t, 23.4, 23.7)), 'monob', 'mm')

    lines = []
    for name in ('sw1', 'sw2', 'del'):
        if t >= TY[name][0]:
            lines.append((cmd_line(t, name, name == 'del' or t < TY['del'][0] and name == 'sw2'
                                   or (name == 'sw1' and t < TY['sw2'][0])), WHITE, True))
    terminal(c, 140, 850, 940, lines[-2:], e_out(prog(t, 16.3, 16.7)) * out, h=58 + 2 * 36, size=22)


@lru_cache(maxsize=None)
def _slam_reveals():
    gx0 = 1390
    out = np.full((SLAM_ROWS, SLAM_COLS), 1e9)
    for tt in np.arange(17.5, 26, .04):
        rx = gx0 + 20 + (SLAM_COLS * SLAM_CELL - 40) * (.5 - .5 * math.cos((tt - 17.5) * .8))
        for j in range(SLAM_COLS):
            if abs(gx0 + j * SLAM_CELL + SLAM_CELL / 2 - rx) < 80:
                out[:, j] = np.minimum(out[:, j], tt + np.arange(SLAM_ROWS) * .05)
    return out


def slam_reveal(i, j):
    return _slam_reveals()[i, j]


def rl_pos(tk, x0, x1, y):
    ph = ((tk - 19.0) / 1.6) % 1
    amp = 38 * math.exp(-max(0, tk - 19.0) / 1.6) + 3
    x = x0 + 30 + (x1 - x0 - 60) * ph
    return x, y + 8 + amp * math.sin(ph * 23 + tk * 3) * math.sin(ph * 5.3)


def code_card(c, cx, cy, w, h, title, lines, col, a=1.0, size=34):
    if a <= 0:
        return
    c.rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, fill=rgba(PANEL, .97 * a),
           outline=rgba(col, a), width=3, r=16)
    c.rect(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2 + 44, fill=rgba(col, .14 * a), r=16)
    c.text(cx - w / 2 + 22, cy - h / 2 + 22, title, 19, rgba(col, a), 'monob', 'lm')
    for (txt, lc, la, ly) in lines:
        c.text(cx - w / 2 + 34, ly, txt, size, rgba(lc, a * la), 'mono', 'lm')


def scene_merge(c, t):
    headline(c, t, 26, 32, '04', 'MERGE', 'Conflicts? Resolved in seconds.')
    out = 1 - prog(t, 31.75, 32)
    cy = 480
    collide = e_in(prog(t, 27.5, 27.8))
    if t < 27.8:
        pin = e_out(prog(t, 26.0, 26.6))
        lx = lerp(-320, 520, pin) + collide * 440
        rx = lerp(2240, 1400, pin) - collide * 440
        code_card(c, lx, cy, 520, 200, 'feature/slam · pid.py', [('Kp = 1.2', CYAN, 1, cy + 22)], CYAN)
        code_card(c, rx, cy, 520, 200, 'main · pid.py', [('Kp = 0.8', ORANGE, 1, cy + 22)], ORANGE)
    else:
        r = e_io(prog(t, 29.0, 29.6))
        s = e_back(prog(t, 27.8, 28.1))
        h = lerp(380, 190, r) * s
        w = 780 * s
        shake = math.sin(t * 70) * 6 * math.exp(-(t - 27.8) * 5)
        col = mix(RED, LIME, r)
        fo = 1 - prog(t, 29.0, 29.3)       # old lines fade before the new one arrives
        fi = prog(t, 29.35, 29.65)
        base = [('<<<<<<< HEAD', RED, fo), ('Kp = 0.8', ORANGE, fo),
                ('=======', RED, fo), ('Kp = 1.2', CYAN, fo),
                ('>>>>>>> feature/slam', RED, fo)]
        lines = []
        for i, (txt, lc, la) in enumerate(base):
            ly0 = cy - 100 + i * 52 + 22
            lines.append((txt, lc, la, lerp(ly0, cy + 22, r)))
        lines.append(('Kp = 1.0   # tuned on hardware', LIME, fi, cy + 22))
        title = 'pid.py — CONFLICT' if r < .5 else 'pid.py — resolved ✓'
        code_card(c, 960 + shake, cy, w, h, title, lines, col, 1 if s > 0 else 0, 32)
        if t < 29.0:
            ca = prog(t, 27.9, 28.1) * (1 - prog(t, 28.8, 29.0))
            c.text(960, cy - 230, 'CONFLICT (content): Merge conflict in pid.py', 22,
                   rgba(RED, ca), 'monob', 'mm')
        for k in range(14):
            p = prog(t, 27.8, 28.4)
            if 0 < p < 1:
                ang = k * 2 * math.pi / 14
                d = e_out(p) * 260
                c.circle(960 + math.cos(ang) * d, cy + math.sin(ang) * d * .6, 5 * (1 - p),
                         fill=rgba(mix(ORANGE, CYAN, k % 2), 1 - p))
    # merge graph
    if t > 30.3:
        g = e_io(prog(t, 30.3, 30.9))
        gy, gy2 = 800, 900
        c.line([(560, gy), (lerp(560, 1346, g), gy)], rgba(ORANGE, .8 * out), 4)
        pts = [bezier((560, gy2), (1100, gy2), (1200, gy2), (1360, gy), u * g) for u in np.linspace(0, 1, 20)]
        c.line(pts, rgba(CYAN, .8 * out), 4)
        for k in range(4):
            node(c, 640 + k * 180, gy, 10, ORANGE, out * prog(g, k * .2, k * .2 + .1))
            node(c, 640 + k * 150, gy2, 10, CYAN, out * prog(g, k * .2, k * .2 + .1))
        if t >= 30.9:
            s = e_back(prog(t, 30.9, 31.2))
            node(c, 1360, gy, 20 * s, LIME, out)
            ripple(c, 1360, gy, t, 30.9, LIME, 160, .7, 4)
            c.text(1400, gy, 'Merge feature/slam', 26, rgba(WHITE, prog(t, 31.0, 31.3) * out), 'bold', 'lm')
        c.text(520, gy, 'main', 18, rgba(ORANGE, out * g), 'monob', 'rm')
        c.text(520, gy2, 'feature/slam', 18, rgba(CYAN, out * g), 'monob', 'rm')
    lines = []
    if t >= TY['merge'][0]:
        lines.append((cmd_line(t, 'merge', t < TY['resolve'][0]), WHITE, True))
    if t >= TY['resolve'][0]:
        lines.append((cmd_line(t, 'resolve'), WHITE, True))
    terminal(c, 1180, 80, 640, lines[-1:], e_out(prog(t, 26.5, 26.8)) * out, h=58 + 36, size=21)


BIS_X = [180 + i * 104 for i in range(16)]
BIS_Y = 820
BIS_SHA = [sha(f'bisect-{i}') if i != 11 else 'e7b2d41' for i in range(16)]


def bisect_path(p, bad):
    x = lerp(260, 1640, p)
    if not bad:
        return x, 520, 0.0, False
    k = 2.08e-4
    x = min(x, 1020)
    y = 520 - k * (x - 260) ** 2
    ang = math.atan(-2 * k * (x - 260))
    return x, y, ang, x >= 1020


def scene_bisect(c, t):
    headline(c, t, 32, 40, '05', 'BISECT', 'Find the bug in log₂(n) steps.')
    out = 1 - prog(t, 39.75, 40)
    # sim arena
    sa = e_out(prog(t, 32.0, 32.3)) * out
    c.rect(140, 250, 1780, 610, fill=rgba(mix(BG, CYAN, .03), sa), outline=rgba((48, 60, 86), sa), width=2, r=16)
    for gx in range(200, 1780, 80):
        c.line([(gx, 262), (gx, 598)], rgba(CYAN, .05 * sa), 1)
    c.rect(1060, 300, 1140, 450, fill=rgba((40, 46, 62), sa), outline=rgba(DIM, sa), width=2, r=4)
    for k in range(6):
        c.line([(1060, 310 + k * 24), (1140, 290 + k * 24)], rgba(DIM, .4 * sa), 2)
    c.circle(260, 520, 34, outline=rgba(DIM, .5 * sa), width=2)
    for k in range(4):
        for j in range(3):
            if (k + j) % 2 == 0:
                c.rect(1660 + j * 14, 480 + k * 14, 1674 + j * 14, 494 + k * 14, fill=rgba(WHITE, .8 * sa))
    c.line([(1660, 480), (1660, 560)], rgba(WHITE, .8 * sa), 3)
    c.text(160, 272, 'SIM · obstacle course', 15, rgba(DIM, sa), 'monob', 'lm', track=2)
    # which run is active
    runs = [(32.2, 1.45, True, None)] + [(ts, .7, BIS_STEPS[i][1] == 'bad', i) for i, ts in enumerate(BIS_TESTS)]
    active = None
    for r in runs:
        if t >= r[0]:
            active = r
    if active:
        t0, d, bad, _ = active
        p = prog(t, t0, t0 + d)
        col = RED if bad else LIME
        trail = [bisect_path(u * p, bad)[:2] for u in np.linspace(0, 1, 30)]
        c.line(trail, rgba(col, .6 * sa), 4)
        x, y, ang, hit = bisect_path(p, bad)
        rover(c, x, y, ang, .7, col, sa, t=t, sweep_r=0 if hit else 110, width=2, spin=t * 3)
        if hit:
            th = t0 + d * (1020 - 260) / 1380
            fa = 1 - prog(t, th, th + .8)
            c.circle(1060, y, 30 + (t - th) * 120, outline=rgba(RED, fa * sa), width=4)
            c.text(1060, y - 70, '✗ CRASH', 30, rgba(RED, sa * prog(t, th, th + .1)), 'monob', 'mm')
        elif p >= 1:
            c.text(1640, 440, '✓', 44, rgba(LIME, sa), 'bold', 'mm')
    if 33.0 < t < 34.6:
        c.text(960, 575, 'REGRESSION: rover drives into the wall', 22,
               rgba(RED, sa * prog(t, 33.0, 33.2) * (1 - prog(t, 34.3, 34.6))), 'monob', 'mm')
    # commit row
    ra = e_out(prog(t, 33.6, 34.0)) * out
    step = sum(1 for ts in BIS_TESTS if t >= ts + .75)
    lo, hi = BIS_RANGES[step]
    if step > 0:
        plo, phi = BIS_RANGES[step - 1]
        g = e_out(prog(t, BIS_TESTS[step - 1] + .75, BIS_TESTS[step - 1] + 1.1))
        blo, bhi = lerp(BIS_X[plo], BIS_X[lo], g), lerp(BIS_X[phi], BIS_X[hi], g)
    else:
        blo, bhi = BIS_X[lo], BIS_X[hi]
    started = t >= 34.4
    c.line([(BIS_X[0], BIS_Y), (BIS_X[-1], BIS_Y)], rgba(DIM, .5 * ra), 3)
    for i, x in enumerate(BIS_X):
        col, a = WHITE, .9
        if started:
            if i == 0:
                col = LIME
            if i == 15:
                col = RED
            for (idx, v), ts in zip(BIS_STEPS, BIS_TESTS):
                if t >= ts + .75 and i == idx:
                    col = LIME if v == 'good' else RED
            if not (lo <= i <= hi) and i not in (0, 15) and not any(
                    i == idx and t >= ts + .75 for (idx, v), ts in zip(BIS_STEPS, BIS_TESTS)):
                a = .25
        node(c, x, BIS_Y, 11, col, a * ra)
        c.text(x, BIS_Y + 34, BIS_SHA[i], 14, rgba(DIM, a * ra), 'mono', 'mm')
    for i, ts in enumerate(BIS_TESTS):
        if ts <= t < ts + .75:
            x = BIS_X[BIS_STEPS[i][0]]
            pr = 18 + 5 * math.sin(t * 20)
            c.circle(x, BIS_Y, pr, outline=rgba(WHITE, ra), width=3)
            c.text(x, BIS_Y - 42, 'testing…', 16, rgba(WHITE, ra), 'monob', 'mm')
        ripple(c, BIS_X[BIS_STEPS[i][0]], BIS_Y, t, ts + .75,
               LIME if BIS_STEPS[i][1] == 'good' else RED, 60)
    if started:
        ba = prog(t, 34.4, 34.7) * ra
        by = BIS_Y - 70
        c.line([(blo, by + 14), (blo, by), (bhi, by), (bhi, by + 14)], rgba(CYAN, ba), 3)
        c.text((blo + bhi) / 2, by - 18, f'{hi - lo + 1} suspects', 16, rgba(CYAN, ba), 'monob', 'mm')
        c.text(1780, BIS_Y + 80, f'step {step}/4', 22, rgba(WHITE, ba), 'monob', 'rm')
    if t >= 38.8:
        s = e_back(prog(t, 38.8, 39.1))
        x = BIS_X[11]
        c.circle(x, BIS_Y, 26 * s, outline=rgba(RED, out), width=4)
        ripple(c, x, BIS_Y, t, 38.8, RED, 140, .7, 4)
        fa = prog(t, 38.85, 39.1) * out
        c.rect(x - 250, 650, x + 250, 712, fill=rgba(mix(BG, RED, .15), fa), outline=rgba(RED, fa), width=2, r=10)
        c.text(x, 681, 'e7b2d41  imu: flip z-axis', 24, rgba(WHITE, fa), 'monob', 'mm')
        c.text(140, BIS_Y + 80, '16 commits → 4 steps', 22, rgba(LIME, fa), 'monob', 'lm')
    # terminal
    lines = []
    if t >= TY['bs'][0]:
        cur = 'bs'
        oi = 0
        for i in range(4):
            if t >= TY[f'b{i}'][0]:
                cur, oi = f'b{i}', i + 1
        lines.append((cmd_line(t, cur), WHITE, True))
        if typing_done(t, cur):
            lines.append((BIS_OUT[oi], RED if oi == 4 else DIM))
    terminal(c, 1100, 70, 720, lines, e_out(prog(t, 33.5, 33.8)) * out, h=58 + 2 * 32, size=17)


REF_X = [360 + 240 * i for i in range(6)]
REF_Y = 430
REF_MSG = ['feat: costmap', 'fix: odom drift', 'feat: path planner',
           'feat: costmap inflation', 'test: sim harness', 'feat: slam loop closure']
REF_LINES = [('f3a9d10 HEAD@{0}: reset: moving to HEAD~3', DIM),
             (f'{sha(REF_MSG[5])} HEAD@{{1}}: commit: {REF_MSG[5]}', WHITE),
             (f'{sha(REF_MSG[4])} HEAD@{{2}}: commit: {REF_MSG[4]}', DIM),
             (f'{sha(REF_MSG[3])} HEAD@{{3}}: commit: {REF_MSG[3]}', DIM)]


def scene_reflog(c, t):
    headline(c, t, 40, 45, '06', 'REFLOG', 'Nothing is ever lost.')
    out = 1 - prog(t, 44.75, 45)
    ga = e_out(prog(t, 40.0, 40.35)) * out
    gone = e_io(prog(t, 41.0, 41.8))
    back = e_io(prog(t, 43.85, 44.55))
    d = gone * (1 - back)      # 0 = intact, 1 = dissolved
    for i, x in enumerate(REF_X):
        lost = i >= 3
        a = ga * ((1 - d) if lost else 1)
        if i:
            c.line([(REF_X[i - 1] + 14, REF_Y), (x - 14, REF_Y)], rgba(ORANGE, .7 * a), 3)
        node(c, x, REF_Y, 13, ORANGE if not lost else mix(ORANGE, MAGENTA, d), a)
        c.text(x, REF_Y + 38, sha(REF_MSG[i]), 17, rgba(DIM, a), 'mono', 'mm')
        c.text(x, REF_Y + 62, REF_MSG[i], 16, rgba(DIM, a * .8), 'sans', 'mm')
        if lost and 0 < d < 1:
            for j in range(36):
                vx, vy = DISSOLVE_V[i - 3, j]
                px, py = x + vx * d, REF_Y + vy * d
                c.circle(px, py, 3 * (1 - d * .5), fill=rgba(mix(ORANGE, MAGENTA, d), (1 - d) * ga + .15 * ga))
    hidx = lerp(5, 2, e_io(prog(t, 41.0, 41.4)))
    hidx = lerp(hidx, 5, e_io(prog(t, 43.9, 44.3)))
    hx = lerp(REF_X[0], REF_X[1], hidx)
    pill(c, hx, REF_Y - 56, 'HEAD → main', ORANGE, ga, 16, 'm', solid=True)
    oa = prog(t, 41.7, 41.9) * (1 - prog(t, 43.6, 43.8)) * ga
    c.text(REF_X[4], REF_Y, '3 commits… gone?', 32, rgba(RED, oa), 'bold', 'mm')
    if t > 44.4:
        c.text(960, 540, 'commits restored ✓', 26, rgba(LIME, prog(t, 44.4, 44.6) * out), 'monob', 'mm')
    # rewind scanlines
    if 43.8 < t < 44.6:
        rng = np.random.default_rng(int(t * 30))
        for _ in range(9):
            yy = rng.uniform(250, 1000)
            c.rect(0, yy, W, yy + rng.uniform(1, 4), fill=rgba(WHITE, rng.uniform(.05, .2)))
        c.text(1780, 110, '◀◀', 40, rgba(WHITE, .9), 'bold', 'rm')
    lines = []
    if t >= TY['reset'][0]:
        lines.append((cmd_line(t, 'reset', t < TY['reflog'][0]), WHITE, True))
    if t >= TY['reflog'][0]:
        lines.append((cmd_line(t, 'reflog', t < 42.5), WHITE, True))
        for k, (txt, col) in enumerate(REF_LINES):
            if t >= 42.5 + k * .08:
                lines.append((txt, col))
    if t >= TY['restore'][0]:
        lines.append((cmd_line(t, 'restore'), WHITE, True))
    lines = lines[-6:]
    x, y = 360, 600
    terminal(c, x, y, 1200, lines, e_out(prog(t, 40.1, 40.4)) * out, h=58 + 6 * 34, size=22)
    for k, ln in enumerate(lines):
        if ln[0].startswith(sha(REF_MSG[5])) and t > 42.95:
            ha = prog(t, 42.95, 43.1) * out
            c.rect(x + 12, y + 46 + k * 33 - 5, x + 1188, y + 46 + k * 33 + 29,
                   outline=rgba(LIME, ha), width=2, r=6)


FLEET_POS = [(1250 + j * 170, 340 + i * 210) for i in range(3) for j in range(4)]


def scene_fleet(c, t):
    headline(c, t, 45, 53, '07', 'PUSH · TAG · DEPLOY', 'One tag. Every robot.')
    out = 1 - prog(t, 52.75, 53)
    a = e_out(prog(t, 45.0, 45.4)) * out
    # laptop
    lx, ly = 290, 560
    c.rect(lx - 150, ly - 95, lx + 150, ly + 85, fill=rgba(PANEL, a), outline=rgba(DIM, a), width=3, r=12)
    c.rect(lx - 185, ly + 85, lx + 185, ly + 100, fill=rgba(DIM, .6 * a), r=6)
    for k in range(4):
        x = lx - 105 + k * 70
        if k:
            c.line([(x - 56, ly - 5), (x - 14, ly - 5)], rgba(ORANGE, .7 * a), 3)
        node(c, x, ly - 5, 11, ORANGE, a)
    c.text(lx, ly + 135, 'local', 20, rgba(DIM, a), 'monob', 'mm', track=3)
    # origin
    ox, oy = 820, 560
    c.circle(ox, oy, 125, fill=rgba(mix(BG, CYAN, .06), a), outline=rgba(CYAN, .35 * a), width=2)
    for k in range(12):
        a0 = k * 30 + t * 40
        c.arc(ox, oy, 140, a0, a0 + 14, rgba(CYAN, .8 * a), 4)
    c.text(ox, oy - 12, 'origin', 36, rgba(WHITE, a), 'bold', 'mm')
    c.text(ox, oy + 26, 'remote', 17, rgba(DIM, a), 'monob', 'mm', track=3)
    # push packets
    for k in range(6):
        p = prog(t, 45.8 + k * .09, 46.35 + k * .09)
        if 0 < p < 1:
            c.circle(lerp(450, 690, e_io(p)), ly - 5, 7, fill=rgba(ORANGE, a))
    ripple(c, ox, oy, t, 46.4, ORANGE, 190)
    # collaborators
    collab = [((560, 300), 'AK', MAGENTA, 46.9), ((1080, 300), 'MR', LIME, 47.3), ((820, 880), 'JS', YELLOW, 47.7)]
    for (cx, cy), ini, col, tc in collab:
        ca = e_back(prog(t, tc - .5, tc - .2)) * out
        if ca <= 0:
            continue
        c.circle(cx, cy, 34 * ca, fill=rgba(mix(BG, col, .2), out), outline=rgba(col, out), width=3)
        c.text(cx, cy, ini, 22, rgba(col, out), 'monob', 'mm')
        for j in range(3):
            p = prog(t, tc + j * .1, tc + .45 + j * .1)
            if 0 < p < 1:
                q = e_io(p)
                c.circle(lerp(cx, ox, q), lerp(cy, oy, q), 6, fill=rgba(col, out))
        ripple(c, ox, oy, t, tc + .5, col, 170)
    c.text(ox, oy + 190, 'teammates push too', 17, rgba(DIM, prog(t, 47.0, 47.3) * out * (1 - prog(t, 48.6, 48.8))), 'sans', 'mm')
    # tag
    if t >= 48.8:
        s = e_back(prog(t, 48.8, 49.1))
        pill(c, ox, oy + 72, 'v1.0', ORANGE, out * clamp(s), int(24 * max(.3, s)), 'm', solid=True)
        sh = prog(t, 49.0, 49.4)
        if 0 < sh < 1:
            sx = lerp(ox - 60, ox + 60, sh)
            c.poly([(sx - 8, oy + 52), (sx + 4, oy + 52), (sx - 4, oy + 92), (sx - 16, oy + 92)], fill=rgba(WHITE, .7))
    # fleet
    lit_n = 0
    for k, (rx, ry) in enumerate(FLEET_POS):
        fa = e_out(prog(t, 45.3 + k * .03, 45.7 + k * .03)) * out
        ta = FLEET_T[k]
        g = e_io(prog(t, ta - .45, ta))
        if t > ta - .5 and t < 51.4:
            pts = [(lerp(ox + 140, rx - 50, u * g), lerp(oy, ry, u * g)) for u in (0, 1)]
            c.line(pts, rgba(LIME, .35 * out * (1 - prog(t, 51.0, 51.4))), 2)
            if g < 1:
                c.circle(pts[1][0], pts[1][1], 5, fill=rgba(LIME, out))
        lit = t >= ta
        lit_n += lit
        col = LIME if lit else (80, 90, 110)
        drive = e_io(prog(t, 51.2 + (k % 4) * .05, 52.6))
        rover(c, rx, ry - drive * 55, -math.pi / 2, .62, col, fa, t=t + k,
              sweep_r=90 if lit else 0, width=2, spin=drive * 3)
        ripple(c, rx, ry, t, ta, LIME, 70)
        c.text(rx, ry + 70, 'v1.0 ✓' if lit else 'v0.9', 16, rgba(col, fa), 'monob', 'mm')
    if t >= FLEET_T[0]:
        c.text(1780, 1000 - 30, f'{lit_n}/12 robots on v1.0', 24, rgba(LIME, out), 'monob', 'rm')
    lines = []
    if t >= TY['push'][0]:
        lines.append((cmd_line(t, 'push', t < TY['tag'][0]), WHITE, True))
    if t >= TY['tag'][0]:
        lines = [(cmd_line(t, 'tag'), WHITE, True)]
    terminal(c, 1180, 80, 640, lines, e_out(prog(t, 45.0, 45.3)) * out, h=58 + 36, size=21)


def scene_outro(c, t):
    z = lerp(2.3, .64, e_io(prog(t, 53.0, 55.0)))
    camx = lerp(250, 1300, e_io(prog(t, 53.0, 55.0)))
    camy = 530
    morph = prog(t, 55.0, 56.0)

    def scr(wx, wy):
        return 960 + (wx - camx) * z, 540 + (wy - camy) * z

    ea = (1 - prog(t, 55.0, 55.35)) * prog(t, 53.0, 53.3)
    if ea > 0:
        for (p0, p1, col) in OUTRO_EDGES:
            a, b = scr(*p0), scr(*p1)
            if max(a[0], b[0]) < -50 or min(a[0], b[0]) > W + 50:
                continue
            c.line([a, b], rgba(col, .6 * ea), max(1.5, 3 * z))
    if t < 56.05:
        for i, (wx, wy, col) in enumerate(OUTRO_NODES):
            k = e_io(prog(morph, OUTRO_DELAY[i], OUTRO_DELAY[i] + .7))
            sx, sy = scr(wx, wy)
            x = lerp(sx, OUTRO_TGT[i, 0], k)
            y = lerp(sy, OUTRO_TGT[i, 1], k)
            if x < -50 or x > W + 50:
                continue
            node(c, x, y, lerp(max(6, 11 * z), 5, k), mix(col, ORANGE, k), prog(t, 53.0, 53.3), core=k < .5)
    if t >= 56.0:
        s = e_back(prog(t, 56.0, 56.3))
        draw_logo(c, 960, 390, 150 * s, 1)
        ripple(c, 960, 390, t, 56.0, ORANGE, 420, 1.0, 5)
        a1 = prog(t, 56.35, 56.7)
        c.text(960, 640 + (1 - e_out(a1)) * 20, 'every change · every robot · every time.', 50,
               rgba(WHITE, a1), 'bold', 'mm')
        a2 = prog(t, 56.9, 57.3)
        c.text(960, 715, 'COMMIT  ·  BRANCH  ·  MERGE  ·  BISECT  ·  REFLOG  ·  SHIP', 21,
               rgba(DIM, a2), 'monob', 'mm', track=3)
        a3 = prog(t, 57.4, 57.8)
        c.text(960, 800, 'learn it hands-on →  denimpatel.github.io/GitLearn', 28,
               rgba(ORANGE, a3), 'monob', 'mm')
        a4 = prog(t, 58.0, 58.4)
        c.text(960, 1000, 'rendered 100% procedurally — Python · NumPy · SciPy · PIL · FFmpeg', 16,
               rgba(DIM, a4 * .8), 'mono', 'mm')


SCENES = [(0, 4, scene_intro), (4, 10, scene_commit), (10, 16, scene_trees),
          (16, 26, scene_branch), (26, 32, scene_merge), (32, 40, scene_bisect),
          (40, 45, scene_reflog), (45, 53, scene_fleet), (53, 60.1, scene_outro)]


def hud(c, t):
    a = prog(t, 4.0, 4.4) * (1 - prog(t, 53.0, 53.4))
    if a <= 0:
        return
    branch = 'main'
    if 17.3 <= t < 22.6:
        branch = 'feature/slam' if t < 18.8 or 19.5 <= t < 20.5 or t >= 21.5 else 'exp/rl-gait'
        if 19.5 <= t < 20.0:
            branch = 'main'
    if 34.4 <= t < 40:
        branch = '(no branch, bisect)'
    c.text(100, 44, '◆', 18, rgba(ORANGE, a), 'sans', 'lm')
    c.text(126, 44, 'rover-nav', 18, rgba(WHITE, .8 * a), 'monob', 'lm')
    c.text(236, 44, f'on {branch}', 18, rgba(DIM, a), 'mono', 'lm')
    c.text(1820, 44, 'GIT  /  SHOWREEL', 16, rgba(DIM, .8 * a), 'monob', 'rm', track=3)
    if (t * 1.2) % 1 < .6:
        c.circle(1600, 44, 5, fill=rgba(RED, a))
    idx = sum(1 for x in CUTS if t >= x)
    c.text(100, 1030, f'{idx:02d} / 08', 16, rgba(DIM, a), 'monob', 'lm')
    sec, fr = int(t), int((t % 1) * FPS)
    c.text(1820, 1030, f'00:{sec:02d}:{fr:02d}', 16, rgba(DIM, a), 'monob', 'rm')
    c.rect(0, H - 4, W * t / DUR, H, fill=rgba(ORANGE, .9 * a))


# ─────────────────────────────────────────────────────── post-process ──
_BG = None
_VIG = None
_GRAIN = None


def init_worker():
    global _BG, _VIG, _GRAIN
    bw, bh = (W + 60) * S, H * S
    yy, xx = np.mgrid[0:bh, 0:bw].astype(np.float32)
    base = np.ones((bh, bw, 3), np.float32) * np.array(BG, np.float32)
    # soft coloured glows
    for (gx, gy, col, rad, k) in [(.25, .3, ORANGE, .55, 10), (.8, .75, CYAN, .6, 9)]:
        d = np.hypot(xx / bw - gx, (yy / bh - gy) * .6) / rad
        base += np.exp(-d * d * 3)[..., None] * np.array(col, np.float32) * k / 255 * 1.8
    step = 60 * S
    grid = ((xx % step) < S) | ((yy % step) < S)
    base[grid] += 6
    dots = ((xx % step) < 2 * S) & ((yy % step) < 2 * S)
    base[dots] += 14
    _BG = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    y2, x2 = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.hypot((x2 - W / 2) / (W / 2), (y2 - H / 2) / (H / 2))
    _VIG = (1 - .38 * np.clip(r - .35, 0, None) ** 1.6)[..., None].astype(np.float32)
    g = np.random.default_rng(3)
    _GRAIN = [g.normal(0, 1, (H, W, 1)).astype(np.float32) * .018 for _ in range(6)]


def post(img, t, fi):
    im = img.reduce(S)
    a = np.asarray(im).astype(np.float32) / 255
    # bloom
    small = np.asarray(im.reduce(4)).astype(np.float32) / 255
    bright = np.clip(small - .42, 0, None)
    bl = ndimage.gaussian_filter(bright, (3, 3, 0)) * .9 + ndimage.gaussian_filter(bright, (12, 12, 0)) * 1.6
    blimg = Image.fromarray(np.clip(bl * 255, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    a = a + np.asarray(blimg).astype(np.float32) / 255 * 1.05

    # cut flashes / glitches
    k_cut = 0.0
    for x in CUTS:
        if 0 <= t - x < .35:
            k_cut = max(k_cut, 1 - (t - x) / .35)
    k_gl = 0.0
    for (gt, gd) in GLITCHES:
        if 0 <= t - gt < gd:
            k_gl = max(k_gl, 1 - (t - gt) / gd)
    k_imp = 0.0
    for (it, s) in IMPACTS:
        if 0 <= t - it < .45:
            k_imp = max(k_imp, s * math.exp(-(t - it) * 9))
    a += .22 * k_cut ** 2
    a += .12 * k_imp
    ca = int(round(14 * k_cut + 18 * k_gl + 5 * k_imp))
    if ca:
        a[:, :, 0] = np.roll(a[:, :, 0], ca, axis=1)
        a[:, :, 2] = np.roll(a[:, :, 2], -ca, axis=1)
    if k_gl > 0 or k_cut > .6:
        rng = np.random.default_rng(fi)
        for _ in range(int(6 * max(k_gl, k_cut))):
            y0 = int(rng.uniform(0, H - 40))
            hh = int(rng.uniform(6, 50))
            a[y0:y0 + hh] = np.roll(a[y0:y0 + hh], int(rng.uniform(-60, 60) * max(k_gl, k_cut)), axis=1)
    shake = 14 * k_imp
    if shake > .5:
        rng = np.random.default_rng(fi + 99)
        dx, dy = rng.uniform(-shake, shake, 2).astype(int)
        a = np.roll(a, (dy, dx), axis=(0, 1))
    a *= _VIG
    a += _GRAIN[fi % len(_GRAIN)]
    fade = prog(t, 0, .25) * (1 - prog(t, 59.1, 60.0))
    a *= fade
    out = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    zoom = 1 + .05 * k_cut + .025 * k_imp
    if t >= 4 and t < 53:
        zoom += .006 * math.exp(-((t - 4) % BEAT) / .09)
    if zoom > 1.001:
        cw, ch = W / zoom, H / zoom
        out = out.resize((W, H), Image.BILINEAR, box=((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2))
    return out


def render_frame(fi):
    if _BG is None:
        init_worker()
    t = fi / FPS
    off = int(((t * 18) % 60) * S)
    img = _BG.crop((off, 0, off + W * S, H * S))
    c = Cv(img)
    for (a, b, fn) in SCENES:
        if a <= t < b:
            fn(c, t)
    hud(c, t)
    return post(img, t, fi)


# ────────────────────────────────────────────────────────────── audio ──
SR = 44100


def render_audio(path):
    n = int(DUR * SR)
    tt = np.arange(n) / SR
    music = np.zeros((n, 2))
    drums = np.zeros((n, 2))
    sfx = np.zeros((n, 2))
    rng = np.random.default_rng(11)

    def add(bus, sig, t0, gain=1.0, pan=0.0):
        i = int(t0 * SR)
        if i >= n or i + len(sig) <= 0:
            return
        if i < 0:
            sig, i = sig[-i:], 0
        sig = sig[:n - i]
        th = (pan + 1) * math.pi / 4
        bus[i:i + len(sig), 0] += sig * gain * math.cos(th) * 1.414
        bus[i:i + len(sig), 1] += sig * gain * math.sin(th) * 1.414

    def ts(d):
        return np.arange(int(d * SR)) / SR

    def mtof(m):
        return 440 * 2 ** ((m - 69) / 12)

    def saw(f, t):
        return 2 * ((f * t) % 1) - 1

    def lp(x, fc, order=2):
        return signal.sosfilt(signal.butter(order, fc, 'low', fs=SR, output='sos'), x)

    def hp(x, fc, order=2):
        return signal.sosfilt(signal.butter(order, fc, 'high', fs=SR, output='sos'), x)

    def bp(x, lo, hi):
        return signal.sosfilt(signal.butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)

    CH = [(45, [57, 60, 64]), (41, [53, 57, 60]), (48, [55, 60, 64]), (43, [55, 59, 62])]

    # pad (two filtered versions, cross-faded for automation)
    pad = np.zeros((n, 2))
    for b in range(31):
        root, notes = CH[b % 4]
        t0 = b * 2.0
        t = ts(2.4)
        env = np.minimum(1, t / .25) * np.minimum(1, np.maximum(0, (2.4 - t) / .4))
        for ch in (0, 1):
            s = np.zeros_like(t)
            for m in notes + [root + 12]:
                for det in (-.12, .08) if ch == 0 else (-.06, .13):
                    s += saw(mtof(m + det), t + rng.uniform(0, 1))
            i = int(t0 * SR)
            seg = (s * env)[:max(0, n - i)]
            pad[i:i + len(seg), ch] += seg
    pad /= np.abs(pad).max()
    pad_dark = np.stack([lp(pad[:, k], 450) for k in (0, 1)], 1)
    pad_bright = np.stack([lp(pad[:, k], 2600) for k in (0, 1)], 1)
    bright = np.interp(tt, [0, 2, 3.9, 4, 40, 40.3, 43.8, 45, 53, 55.9, 56, 60],
                       [0, .1, .6, 1, 1, 0, 0, 1, 1, 1, 1, .6])
    padmix = pad_dark * (1 - bright[:, None]) + pad_bright * bright[:, None]
    pad_gain = np.interp(tt, [0, 1, 4, 53, 55.9, 56, 60], [.0, .35, .45, .45, .7, .8, .5])
    music += padmix * pad_gain[:, None] * .55

    # bass: 8th notes
    bass = np.zeros(n)
    for k in range(int(4 / .25), int(53 / .25)):
        t0 = k * .25
        if 40 <= t0 < 43.8 and k % 2:
            continue
        root = CH[int(t0 / 2) % 4][0] - 12
        m = root + (12 if k % 4 == 3 else 0)
        t = ts(.24)
        s = saw(mtof(m), t) * .6 + np.sin(2 * np.pi * mtof(m) * t)
        s *= np.exp(-t * 7) * np.minimum(1, t / .004)
        i = int(t0 * SR)
        bass[i:i + len(s)] += s[:n - i]
    bass = lp(bass, 380, 4)
    music += np.stack([bass, bass], 1) * .42

    # arp 16ths
    for k in range(int(4 / .125), int(53 / .125)):
        t0 = k * .125
        if not (16 <= t0 < 26 or 32 <= t0 < 40 or 45 <= t0 < 53 or 10 <= t0 < 16 and k % 2 == 0):
            continue
        root, notes = CH[int(t0 / 2) % 4]
        seq = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[1] + 24]
        m = seq[k % 4] + (12 if (k // 8) % 2 and k % 4 == 3 else 0)
        t = ts(.2)
        f = mtof(m)
        s = (np.sign(np.sin(2 * np.pi * f * t)) * .3 + np.sin(2 * np.pi * f * t)) * np.exp(-t * 22)
        add(music, lp(s, 3800), t0, .16, .45 if k % 2 else -.45)

    # drums
    kick_times = []
    for k in range(int(4 / BEAT), int(53 / BEAT)):
        t0 = k * BEAT
        if 40.0 <= t0 < 43.8 and k % 2:
            continue
        if 32.0 <= t0 < 33.0:
            continue
        kick_times.append(t0)
        t = ts(.45)
        f = 45 + 120 * np.exp(-t * 30)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
        s[:200] += rng.normal(0, .3, 200) * np.linspace(1, 0, 200)
        add(drums, s, t0, .95)
        # clap on 2 & 4
        if k % 2 == 1 and t0 >= 10:
            tc = ts(.25)
            cl = bp(rng.normal(0, 1, len(tc)), 900, 3500) * np.exp(-tc * 18)
            add(drums, cl, t0, .45, .1)
        # off-beat hats
        th = ts(.06)
        hat = hp(rng.normal(0, 1, len(th)), 7000) * np.exp(-th * 70)
        add(drums, hat, t0 + BEAT / 2, .22, .3)
        if 16 <= t0 < 26 or 45 <= t0 < 53:
            add(drums, hat, t0 + BEAT / 4, .1, -.3)
            add(drums, hat, t0 + 3 * BEAT / 4, .1, -.3)

    # sidechain duck
    duck = np.ones(n)
    for kt in kick_times:
        i = int(kt * SR)
        seg = ts(.4)
        g = 1 - .6 * np.exp(-seg / .09)
        duck[i:i + len(seg)] = np.minimum(duck[i:i + len(seg)], g[:n - i])
    music *= duck[:, None]

    # ── sfx
    for name, (start, text, cps) in TY.items():
        for j in range(len(text)):
            tc = ts(.018)
            s = bp(rng.normal(0, 1, len(tc)), 2500, 7000) * np.exp(-tc * 260)
            s += np.sin(2 * np.pi * rng.uniform(1600, 2400) * tc) * np.exp(-tc * 400) * .5
            add(sfx, s, start + j / cps, .22 * rng.uniform(.6, 1), rng.uniform(-.3, .3))

    def whoosh(t0, d=.6, g=.5):
        t = ts(d)
        env = np.sin(np.pi * t / d) ** 2
        s = bp(rng.normal(0, 1, len(t)), 500, 5000) * env
        i = int((t0 - d * .7) * SR)
        for ch, pan in ((0, np.linspace(1, .3, len(t))), (1, np.linspace(.3, 1, len(t)))):
            seg = (s * pan * g)[:n - i]
            sfx[i:i + len(seg), ch] += seg

    for x in CUTS:
        whoosh(x)

    def impact(t0, s=1.0):
        t = ts(1.2)
        f = 32 + 40 * np.exp(-t * 6)
        boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2)
        noise = lp(rng.normal(0, 1, len(t)), 1800) * np.exp(-t * 14)
        add(sfx, boom + noise * .6, t0, .75 * s)

    for it, s in IMPACTS:
        impact(it, s)

    # riser into the title slam
    t = ts(1.3)
    ris = hp(rng.normal(0, 1, len(t)), 2000) * (t / 1.3) ** 2 * .6
    ris += np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / 1.3) ** 2) / SR) * (t / 1.3) ** 2 * .3
    add(sfx, ris, 1.7, .6)
    # riser for outro
    t = ts(3.0)
    ris = hp(rng.normal(0, 1, len(t)), 1500) * (t / 3) ** 2 * .6
    ris += np.sin(2 * np.pi * np.cumsum(150 + 1200 * (t / 3) ** 3) / SR) * (t / 3) ** 2 * .3
    add(sfx, ris, 53.0, .55)

    def blip(t0, f0, f1, d=.12, g=.3, sq=False, pan=0.0):
        t = ts(d)
        f = np.linspace(f0, f1, len(t))
        ph = 2 * np.pi * np.cumsum(f) / SR
        s = np.sign(np.sin(ph)) * .4 if sq else np.sin(ph)
        add(sfx, s * np.exp(-t * 18) * np.minimum(1, t / .003), t0, g, pan)

    def glitch(t0, d=.35):
        t = ts(d)
        seg = int(.02 * SR)
        f = np.repeat(rng.uniform(80, 1400, len(t) // seg + 1), seg)[:len(t)]
        s = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
        s = np.round(s * rng.uniform(.3, 1, len(t)) * 4) / 4
        add(sfx, s * np.exp(-t * 6), t0, .22)

    for gt, _ in GLITCHES:
        glitch(gt)
    # commit pops
    for T in C1_T + [14.0]:
        blip(T, 1320, 1760, .15, .25)
    for tc in [c for v in LANE_COMMITS.values() for c in v]:
        blip(tc, 990, 1320, .12, .18, pan=.4)
    # bisect: tests + verdicts
    for i, tst in enumerate(BIS_TESTS):
        blip(tst, 880, 880, .08, .2)
        if BIS_STEPS[i][1] == 'good':
            blip(tst + .75, 880, 880, .1, .25)
            blip(tst + .85, 1320, 1320, .14, .25)
        else:
            blip(tst + .75, 440, 220, .25, .3, sq=True)
    blip(38.8, 220, 110, .5, .35, sq=True)
    # reflog dissolve and restore (the restore is the dissolve played backwards)
    t = ts(.9)
    shim = np.zeros(len(t))
    for _ in range(14):
        f0 = rng.uniform(1800, 5000)
        shim += np.sin(2 * np.pi * np.cumsum(f0 * np.exp(-t * 1.8)) / SR) * np.exp(-t * rng.uniform(2, 5))
    shim /= 14
    add(sfx, shim, 41.0, .5)
    add(sfx, shim[::-1], 43.75, .5)
    t = ts(.8)
    rw = saw(np.linspace(900, 120, len(t)) * (1 + .3 * np.sin(2 * np.pi * 30 * t)), t)
    add(sfx, lp(rw, 2500) * np.sin(np.pi * t / .8), 43.8, .12)
    # push packets / collaborator packets / fleet pings
    for k in range(6):
        blip(45.8 + k * .09, 1500, 1800, .05, .12)
    for tc in (46.9, 47.3, 47.7):
        for j in range(3):
            blip(tc + j * .1, 1200, 1500, .05, .1, pan=-.3)
    t = ts(1.5)
    chime = (np.sin(2 * np.pi * 1760 * t) + .6 * np.sin(2 * np.pi * 2637 * t)) * np.exp(-t * 3)
    add(sfx, chime, 48.8, .25)
    penta = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]
    for k, ta in enumerate(FLEET_T):
        f = mtof(penta[k])
        blip(ta, f, f, .18, .16, pan=(k % 4 - 1.5) / 2)
    # final chord stab
    t = ts(4.0)
    stab = np.zeros(len(t))
    for m in (33, 45, 52, 57, 60, 64, 69):
        for det in (-.1, .1):
            stab += saw(mtof(m + det), t)
    stab = lp(stab / 14, 3000) * np.exp(-t * 1.1) * np.minimum(1, t / .01)
    add(music, stab, 56.0, .9)

    # simple reverb on music + sfx
    ir_t = ts(1.8)
    ir = rng.normal(0, 1, len(ir_t)) * np.exp(-ir_t * 3.2)
    ir = lp(ir, 5000)
    ir /= np.sqrt((ir ** 2).sum())
    send = music * .5 + sfx * .5
    rev = np.stack([signal.fftconvolve(send[:, k], np.roll(ir, k * 37))[:n] for k in (0, 1)], 1)

    mix_ = music * .8 + drums * .85 + sfx * .75 + rev * .35
    mix_ /= np.abs(mix_).max()
    mix_ = np.tanh(mix_ * 1.6) / np.tanh(1.6)
    fade = np.interp(tt, [0, .05, 58.8, 60], [0, 1, 1, 0])
    mix_ *= fade[:, None]
    mix_ *= .89 / np.abs(mix_).max()
    wavfile.write(path, SR, (mix_ * 32767).astype(np.int16))


# ─────────────────────────────────────────────────────────────── main ──
def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--stills', help='comma-separated seconds to dump as PNG')
    ap.add_argument('--preview', action='store_true', help='fast 960x540 render')
    ap.add_argument('--out', default=os.path.join(HERE, 'git_showreel.mp4'))
    ap.add_argument('--workers', type=int, default=os.cpu_count())
    args = ap.parse_args()

    if args.stills:
        os.makedirs(os.path.join(HERE, 'stills'), exist_ok=True)
        init_worker()
        for s in args.stills.split(','):
            fi = int(round(float(s) * FPS))
            p = os.path.join(HERE, 'stills', f'still_{float(s):05.2f}.png')
            render_frame(fi).save(p)
            print('wrote', p)
        return

    wav = os.path.splitext(args.out)[0] + '.wav'
    t0 = time.time()
    render_audio(wav)
    print(f'audio done in {time.time() - t0:.1f}s')
    vf = ['-vf', 'scale=960:540'] if args.preview else []
    cmd = [ffmpeg_exe(), '-y', '-loglevel', 'error',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-i', wav, '-map', '0:v', '-map', '1:a', *vf,
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '7M', '-bufsize', '14M', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frames = range(NFRAMES)
    with Pool(args.workers, initializer=init_worker) as pool:
        for i, im in enumerate(pool.imap(render_frame, frames, chunksize=4)):
            proc.stdin.write(im.tobytes())
            if i % 150 == 0:
                print(f'frame {i}/{NFRAMES}  {time.time() - t0:.0f}s', flush=True)
    proc.stdin.close()
    proc.wait()
    os.remove(wav)
    print(f'done -> {args.out} in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
