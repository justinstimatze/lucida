#!/usr/bin/env python3
"""
Bake a single PCB-pattern PNG for the mixed3d/hackers floor.

Replaces the runtime A*+role-graph+lane-bus+pad codegen in index.html
with one offline asset. Iterate locally: tweak args, regen, view PNG,
no browser needed.

Defaults match index.html's mixed3d constants
(towerCount=10, towerW=5.0, spacing=12.0, fieldSize=120, floorSize=180).
World units map linearly to pixels: px_per_unit = resolution / floor_size.

Output coordinate convention: image (0,0) is top-left = world (-floorSize/2, -floorSize/2).
+X right, +Z down in the texture.

Run:
    uv run tools/gen_floor.py --out assets/floor_baked.png

"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


class FloorSpec:
    def __init__(
        self,
        tower_count: int,
        tower_w: float,
        spacing: float,
        floor_scale: float,
        resolution: int,
    ):
        self.tower_count = tower_count
        self.tower_w = tower_w
        self.spacing = spacing
        self.field_size = tower_count * spacing
        self.floor_size = self.field_size * floor_scale
        self.resolution = resolution
        self.px_per_unit = resolution / self.floor_size

    def world_to_px(self, x: float, z: float) -> tuple[float, float]:
        half = self.floor_size / 2.0
        u = (x + half) / self.floor_size
        v = (z + half) / self.floor_size
        return u * self.resolution, v * self.resolution

    def units_to_px(self, u: float) -> float:
        return u * self.px_per_unit

    def tower_world_pos(self, ix: int, iz: int) -> tuple[float, float]:
        offset = (self.tower_count - 1) * 0.5
        return (ix - offset) * self.spacing, (iz - offset) * self.spacing


def shade(hex_color: str, factor: float) -> str:
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    r = max(0, min(255, int(r * factor)))
    g = max(0, min(255, int(g * factor)))
    b = max(0, min(255, int(b * factor)))
    return f"#{r:02x}{g:02x}{b:02x}"


def draw_rect_units(
    draw: ImageDraw.ImageDraw,
    spec: FloorSpec,
    cx: float,
    cz: float,
    w: float,
    h: float,
    fill: str,
) -> None:
    px, py = spec.world_to_px(cx - w / 2, cz - h / 2)
    qx, qy = spec.world_to_px(cx + w / 2, cz + h / 2)
    draw.rectangle([px, py, qx, qy], fill=fill)


def draw_line_units(
    draw: ImageDraw.ImageDraw,
    spec: FloorSpec,
    x0: float,
    z0: float,
    x1: float,
    z1: float,
    width_u: float,
    fill: str,
) -> None:
    px0, py0 = spec.world_to_px(x0, z0)
    px1, py1 = spec.world_to_px(x1, z1)
    w_px = max(1, round(spec.units_to_px(width_u)))
    draw.line([px0, py0, px1, py1], fill=fill, width=w_px)


def draw_disk_units(
    draw: ImageDraw.ImageDraw,
    spec: FloorSpec,
    cx: float,
    cz: float,
    r_u: float,
    fill: str,
) -> None:
    px, py = spec.world_to_px(cx, cz)
    r = max(1.0, spec.units_to_px(r_u))
    draw.ellipse([px - r, py - r, px + r, py + r], fill=fill)


def overpaint_tower_bboxes(
    draw: ImageDraw.ImageDraw,
    spec: FloorSpec,
    fill: str,
    margin: float = 0.0,
) -> None:
    """Stamp solid bbox over each tower footprint — erases any traces
    that crossed it. Cheap obstacle-aware look without per-segment routing.
    """
    half_t = spec.tower_w / 2 + margin
    for ix in range(spec.tower_count):
        for iz in range(spec.tower_count):
            cx, cz = spec.tower_world_pos(ix, iz)
            draw_rect_units(draw, spec, cx, cz, half_t * 2, half_t * 2, fill)


def add_tower_base_detail(
    draw: ImageDraw.ImageDraw,
    spec: FloorSpec,
    rng: random.Random,
    tower_color: str,
) -> None:
    """Lay down a fine grid + scattered chip detail inside each tower
    footprint (after overpaint_tower_bboxes). Replaces the flat-cyan
    tower base with a circuit-board / mesh look per Hackers refs
    (user 2026-05-03 "tower glass closeup is a good example").
    """
    grid_color = shade(tower_color, 0.55)
    accent_color = shade(tower_color, 0.40)
    half_t = spec.tower_w / 2
    # Inset so grid doesn't touch the very edge of the bright fill
    inset = 0.18
    grid_step = 0.30
    for ix in range(spec.tower_count):
        for iz in range(spec.tower_count):
            cx, cz = spec.tower_world_pos(ix, iz)
            # Fine cross-hatch grid
            n = int((spec.tower_w - 2 * inset) / grid_step)
            for k in range(n + 1):
                t = -half_t + inset + k * grid_step
                # Horizontal grid line
                draw_line_units(
                    draw,
                    spec,
                    cx - half_t + inset,
                    cz + t,
                    cx + half_t - inset,
                    cz + t,
                    0.022,
                    grid_color,
                )
                # Vertical grid line
                draw_line_units(
                    draw,
                    spec,
                    cx + t,
                    cz - half_t + inset,
                    cx + t,
                    cz + half_t - inset,
                    0.022,
                    grid_color,
                )
            # Sparse chip-pad accents: 4-7 small squares scattered
            # at random grid intersections inside the bbox.
            for _ in range(rng.randint(4, 7)):
                gi = rng.randint(1, n - 1)
                gj = rng.randint(1, n - 1)
                ax = -half_t + inset + gi * grid_step
                az = -half_t + inset + gj * grid_step
                draw_rect_units(
                    draw,
                    spec,
                    cx + ax,
                    cz + az,
                    grid_step * 0.55,
                    grid_step * 0.55,
                    accent_color,
                )


def is_in_tower(spec: FloorSpec, x: float, z: float, margin: float = 0.0) -> bool:
    offset = (spec.tower_count - 1) * 0.5
    ix = round((x / spec.spacing) + offset)
    iz = round((z / spec.spacing) + offset)
    if not (0 <= ix < spec.tower_count and 0 <= iz < spec.tower_count):
        return False
    cx, cz = spec.tower_world_pos(ix, iz)
    h = spec.tower_w / 2 + margin
    return abs(x - cx) < h and abs(z - cz) < h


def bake(
    spec: FloorSpec,
    bg_color: str,
    primary: str,
    accent: str,
    tower_color: str,
    seed: int,
) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGBA", (spec.resolution, spec.resolution), bg_color)
    draw = ImageDraw.Draw(img)

    primary_mid = shade(primary, 0.65)
    half = spec.floor_size / 2.0

    corridor = spec.spacing - spec.tower_w
    pad_size = 0.32  # chip-style square contact pad terminator

    # Tracked line segments for pre-placement pad collision checking.
    # Pads must not sit on top of unrelated traces. A line whose endpoint
    # falls inside the candidate pad bbox is treated as an intended
    # terminator (its pad is the pad we're placing), not a collision.
    line_segments: list[tuple[float, float, float, float, float]] = []

    def _line(x0: float, z0: float, x1: float, z1: float, w: float, color: str) -> None:
        draw_line_units(draw, spec, x0, z0, x1, z1, w, color)
        line_segments.append((x0, z0, x1, z1, w))

    def _seg_hits_rect(
        x0: float,
        z0: float,
        x1: float,
        z1: float,
        lw: float,
        xmin: float,
        zmin: float,
        xmax: float,
        zmax: float,
    ) -> bool:
        # Liang-Barsky clip vs rect inflated by line half-width.
        h = lw / 2
        rxmin, rxmax = xmin - h, xmax + h
        rzmin, rzmax = zmin - h, zmax + h
        dx, dz = x1 - x0, z1 - z0
        t_enter, t_exit = 0.0, 1.0
        if dx == 0:
            if not (rxmin <= x0 <= rxmax):
                return False
        else:
            t1 = (rxmin - x0) / dx
            t2 = (rxmax - x0) / dx
            if t1 > t2:
                t1, t2 = t2, t1
            t_enter = max(t_enter, t1)
            t_exit = min(t_exit, t2)
        if dz == 0:
            if not (rzmin <= z0 <= rzmax):
                return False
        else:
            t1 = (rzmin - z0) / dz
            t2 = (rzmax - z0) / dz
            if t1 > t2:
                t1, t2 = t2, t1
            t_enter = max(t_enter, t1)
            t_exit = min(t_exit, t2)
        return t_enter <= t_exit

    def _pad_clear(cx: float, cz: float, pw: float, ph: float, clearance: float = 0.15) -> bool:
        xmin = cx - pw / 2 - clearance
        xmax = cx + pw / 2 + clearance
        zmin = cz - ph / 2 - clearance
        zmax = cz + ph / 2 + clearance
        ep_xmin = cx - pw / 2 - 0.001
        ep_xmax = cx + pw / 2 + 0.001
        ep_zmin = cz - ph / 2 - 0.001
        ep_zmax = cz + ph / 2 + 0.001
        for x0, z0, x1, z1, lw in line_segments:
            ep0_in = ep_xmin <= x0 <= ep_xmax and ep_zmin <= z0 <= ep_zmax
            ep1_in = ep_xmin <= x1 <= ep_xmax and ep_zmin <= z1 <= ep_zmax
            if ep0_in or ep1_in:
                continue
            if _seg_hits_rect(x0, z0, x1, z1, lw, xmin, zmin, xmax, zmax):
                return False
        return True

    def _try_pad(
        cx: float, cz: float, pw: float, ph: float, color: str, clearance: float = 0.15
    ) -> bool:
        if _pad_clear(cx, cz, pw, ph, clearance):
            draw_rect_units(draw, spec, cx, cz, pw, ph, color)
            return True
        return False

    # 2a. Horizontal lane bus traces (no spurs yet — see 2c for spurs).
    #     Inset must clear the chip-pin-pad zone of adjacent towers
    #     (pin stub 0.5 + pad half 0.075 + small margin = ~0.85).
    h_bundle_meta: list[tuple[float, float, float, float, float, str, float, float]] = []
    for iz in range(spec.tower_count - 1):
        _, za = spec.tower_world_pos(0, iz)
        _, zb = spec.tower_world_pos(0, iz + 1)
        z_mid = (za + zb) / 2
        z_lo = z_mid - corridor / 2 + 0.85
        z_hi = z_mid + corridor / 2 - 0.85
        n_bundles = rng.randint(2, 3)
        for _ in range(n_bundles):
            bsize = rng.randint(3, 6)
            bspacing = rng.uniform(0.18, 0.28)
            bwidth = (bsize - 1) * bspacing
            if z_hi - z_lo < bwidth + 0.6:
                continue
            bz_center = rng.uniform(z_lo + bwidth / 2 + 0.1, z_hi - bwidth / 2 - 0.1)
            bx0 = -half + rng.uniform(3, spec.field_size * 0.45)
            bx1 = half - rng.uniform(3, spec.field_size * 0.45)
            if bx1 <= bx0 + 4:
                continue
            bw = rng.choice([0.04, 0.05, 0.05, 0.07])
            bcolor = primary if rng.random() > 0.15 else primary_mid
            for k in range(bsize):
                zt = bz_center - bwidth / 2 + k * bspacing
                s0 = rng.uniform(0, 1.4)
                s1 = rng.uniform(0, 1.4)
                x0, x1 = bx0 + s0, bx1 - s1
                if x1 <= x0 + 2:
                    continue
                _line(x0, zt, x1, zt, bw, bcolor)
                # tiny intra-bundle terminator pads — adjacent traces in the
                # same bundle sit ~0.18u away so a clearance check would
                # always reject; they look fine inside their bundle.
                draw_rect_units(draw, spec, x0, zt, pad_size * 0.7, pad_size * 0.7, primary)
                draw_rect_units(draw, spec, x1, zt, pad_size * 0.7, pad_size * 0.7, primary)
            h_bundle_meta.append((bz_center, bwidth, bx0, bx1, bw, bcolor, z_lo, z_hi))

    # 2b. Vertical lane bus traces (no spurs yet).
    v_bundle_meta: list[tuple[float, float, float, float, float, str, float, float]] = []
    for ix in range(spec.tower_count - 1):
        xa, _ = spec.tower_world_pos(ix, 0)
        xb, _ = spec.tower_world_pos(ix + 1, 0)
        x_mid = (xa + xb) / 2
        x_lo = x_mid - corridor / 2 + 0.85
        x_hi = x_mid + corridor / 2 - 0.85
        n_bundles = rng.randint(2, 3)
        for _ in range(n_bundles):
            bsize = rng.randint(3, 6)
            bspacing = rng.uniform(0.18, 0.28)
            bwidth = (bsize - 1) * bspacing
            if x_hi - x_lo < bwidth + 0.6:
                continue
            bx_center = rng.uniform(x_lo + bwidth / 2 + 0.1, x_hi - bwidth / 2 - 0.1)
            bz0 = -half + rng.uniform(3, spec.field_size * 0.45)
            bz1 = half - rng.uniform(3, spec.field_size * 0.45)
            if bz1 <= bz0 + 4:
                continue
            bw = rng.choice([0.04, 0.05, 0.05, 0.07])
            bcolor = primary if rng.random() > 0.15 else primary_mid
            for k in range(bsize):
                xt = bx_center - bwidth / 2 + k * bspacing
                s0 = rng.uniform(0, 1.4)
                s1 = rng.uniform(0, 1.4)
                z0, z1 = bz0 + s0, bz1 - s1
                if z1 <= z0 + 2:
                    continue
                _line(xt, z0, xt, z1, bw, bcolor)
                draw_rect_units(draw, spec, xt, z0, pad_size * 0.7, pad_size * 0.7, primary)
                draw_rect_units(draw, spec, xt, z1, pad_size * 0.7, pad_size * 0.7, primary)
            v_bundle_meta.append((bx_center, bwidth, bz0, bz1, bw, bcolor, x_lo, x_hi))

    # 2c. Horizontal-bundle spurs (run AFTER all bundle traces — both
    #     h and v — so spur endpoint pads see perpendicular bundles).
    for bz_center, bwidth, bx0, bx1, bw, bcolor, z_lo, z_hi in h_bundle_meta:
        for direction_sign in (-1, 1):
            outer_zt = bz_center + direction_sign * bwidth / 2
            edge_perp = (z_hi - outer_zt) if direction_sign > 0 else (outer_zt - z_lo)
            if edge_perp < 1.4:
                continue
            spur_pads_x: list[float] = []
            for _ in range(rng.randint(14, 22)):
                chosen = None
                for _r in range(20):
                    xs = rng.uniform(bx0 + 1.0, bx1 - 1.0)
                    if not all(abs(xs - p) > 0.65 for p in spur_pads_x):
                        continue
                    run_perp = edge_perp - 0.6
                    chamfer = min(0.5, run_perp * 0.25)
                    pre = max(0.3, (run_perp - chamfer) * rng.uniform(0.3, 0.55))
                    lat = chamfer * rng.choice([-1, 1])
                    ax, az_ = xs, outer_zt
                    bx, bz = xs, outer_zt + direction_sign * pre
                    cx_, cz_ = xs + lat, outer_zt + direction_sign * (pre + chamfer)
                    dx_, dz_ = cx_, outer_zt + direction_sign * run_perp
                    if _pad_clear(dx_, dz_, pad_size, pad_size):
                        chosen = (xs, ax, az_, bx, bz, cx_, cz_, dx_, dz_)
                        break
                if chosen is None:
                    continue
                xs, ax, az_, bx, bz, cx_, cz_, dx_, dz_ = chosen
                _line(ax, az_, bx, bz, bw, bcolor)
                _line(bx, bz, cx_, cz_, bw, bcolor)
                _line(cx_, cz_, dx_, dz_, bw, bcolor)
                draw_rect_units(draw, spec, dx_, dz_, pad_size, pad_size, primary)
                spur_pads_x.append(xs)

    # 2d. Vertical-bundle spurs.
    for bx_center, bwidth, bz0, bz1, bw, bcolor, x_lo, x_hi in v_bundle_meta:
        for direction_sign in (-1, 1):
            outer_xt = bx_center + direction_sign * bwidth / 2
            edge_perp = (x_hi - outer_xt) if direction_sign > 0 else (outer_xt - x_lo)
            if edge_perp < 1.4:
                continue
            spur_pads_z: list[float] = []
            for _ in range(rng.randint(14, 22)):
                chosen = None
                for _r in range(20):
                    zs = rng.uniform(bz0 + 1.0, bz1 - 1.0)
                    if not all(abs(zs - p) > 0.65 for p in spur_pads_z):
                        continue
                    run_perp = edge_perp - 0.6
                    chamfer = min(0.5, run_perp * 0.25)
                    pre = max(0.3, (run_perp - chamfer) * rng.uniform(0.3, 0.55))
                    lat = chamfer * rng.choice([-1, 1])
                    ax, az_ = outer_xt, zs
                    bx, bz = outer_xt + direction_sign * pre, zs
                    cx_, cz_ = outer_xt + direction_sign * (pre + chamfer), zs + lat
                    dx_, dz_ = outer_xt + direction_sign * run_perp, cz_
                    if _pad_clear(dx_, dz_, pad_size, pad_size):
                        chosen = (zs, ax, az_, bx, bz, cx_, cz_, dx_, dz_)
                        break
                if chosen is None:
                    continue
                zs, ax, az_, bx, bz, cx_, cz_, dx_, dz_ = chosen
                _line(ax, az_, bx, bz, bw, bcolor)
                _line(bx, bz, cx_, cz_, bw, bcolor)
                _line(cx_, cz_, dx_, dz_, bw, bcolor)
                draw_rect_units(draw, spec, dx_, dz_, pad_size, pad_size, primary)
                spur_pads_z.append(zs)

    # 4. Outer border (no towers): denser ortho fill. Both endpoint pads
    #    must clear the existing trace mesh before we commit the line.
    border_jogs = 800
    for _ in range(border_jogs):
        x = rng.uniform(-half, half)
        z = rng.uniform(-half, half)
        in_field = (
            -spec.field_size / 2 - 1 <= x <= spec.field_size / 2 + 1
            and -spec.field_size / 2 - 1 <= z <= spec.field_size / 2 + 1
        )
        if in_field:
            continue
        seg_len = rng.uniform(2, 8)
        if rng.random() < 0.5:
            x1, z1 = x + seg_len, z
        else:
            x1, z1 = x, z + seg_len
        if not _pad_clear(x, z, pad_size, pad_size):
            continue
        if not _pad_clear(x1, z1, pad_size, pad_size):
            continue
        w = rng.choice([0.05, 0.07])
        _line(x, z, x1, z1, w, primary_mid)
        draw_rect_units(draw, spec, x, z, pad_size, pad_size, primary)
        draw_rect_units(draw, spec, x1, z1, pad_size, pad_size, primary)

    # 5. Sparse accent badges — small filled rects in corridor space.
    #    Skip any badge whose bbox overlaps an existing trace.
    n_badges = 60
    for _ in range(n_badges):
        x = rng.uniform(-spec.field_size / 2 + 1, spec.field_size / 2 - 1)
        z = rng.uniform(-spec.field_size / 2 + 1, spec.field_size / 2 - 1)
        if is_in_tower(spec, x, z, margin=0.3):
            continue
        bw = rng.uniform(0.4, 1.0)
        bd = rng.uniform(0.15, 0.35)
        if rng.random() < 0.5:
            bw, bd = bd, bw
        if not _pad_clear(x, z, bw, bd):
            continue
        draw_rect_units(draw, spec, x, z, bw, bd, primary)

    # 5b. Diagonal corner traces at corridor intersections — refs
    #     (tower_glass_closeup.png, tower_bases_low_angle.png) show
    #     diagonal/curved cuts where bus bundles meet. Fakes that look
    #     by drawing 2-segment diagonals across each cross-corridor
    #     intersection, in primary purple.
    for ix in range(spec.tower_count - 1):
        for iz in range(spec.tower_count - 1):
            xa, _ = spec.tower_world_pos(ix, 0)
            xb, _ = spec.tower_world_pos(ix + 1, 0)
            _, za = spec.tower_world_pos(0, iz)
            _, zb = spec.tower_world_pos(0, iz + 1)
            cx = (xa + xb) / 2
            cz = (za + zb) / 2
            half_int = corridor / 2 - 1.0
            for _ in range(rng.randint(2, 4)):
                # Random diagonal across one of 4 corner quadrants
                quad = rng.choice([(-1, -1), (-1, 1), (1, -1), (1, 1)])
                xo = quad[0] * rng.uniform(0.3, half_int)
                zo = quad[1] * rng.uniform(0.3, half_int)
                # Endpoint on the perpendicular axis
                end_along = rng.choice(["x", "z"])
                if end_along == "x":
                    ex = xo + quad[0] * rng.uniform(0.5, 1.2)
                    ez = zo
                else:
                    ex = xo
                    ez = zo + quad[1] * rng.uniform(0.5, 1.2)
                bw = rng.choice([0.05, 0.06, 0.08])
                _line(cx + xo, cz + zo, cx + ex, cz + ez, bw, primary)
                draw_rect_units(
                    draw, spec, cx + xo, cz + zo, pad_size * 0.6, pad_size * 0.6, primary
                )

    # 5c. Sprinkled "via" markers — small purple squares scattered
    #     across the floor (avoiding tower bboxes). Per refs the floor
    #     reads as a busy circuit board with many small connection
    #     points, not just the structured bus + spurs.
    via_count = int(spec.field_size * 1.2)
    for _ in range(via_count):
        vx = rng.uniform(-half + 1, half - 1)
        vz = rng.uniform(-half + 1, half - 1)
        if is_in_tower(spec, vx, vz, margin=0.2):
            continue
        size = rng.choice([0.10, 0.12, 0.14, 0.18])
        draw_rect_units(draw, spec, vx, vz, size, size, primary)

    # 6. Tower footprints = bright "hole into a bright light" visible
    #    through translucent tower glass. Uses tower_color (cyan, matches
    #    the tower-edge tubes) — distinct from primary which colours the
    #    purple PCB traces per refs (user 2026-05-03 "the floor lines/
    #    traces are pretty consistently purple ... reflections of the
    #    purple circuit lines in the glass of the tower faces").
    overpaint_tower_bboxes(draw, spec, fill=tower_color, margin=0.0)
    # 6b. Fine cross-hatch + scattered chip pads inside each tower
    #     footprint — replaces the flat-cyan look (user 2026-05-03
    #     "the flat cyan is starting to stand out compare to the other
    #     refinements ... tower glass closeup is a good example").
    add_tower_base_detail(draw, spec, rng, tower_color)

    # 7. Per-tower perimeter chip pads + stubs (drawn AFTER overpaint
    #    so they sit on the dark tower border).
    for ix in range(spec.tower_count):
        for iz in range(spec.tower_count):
            cx, cz = spec.tower_world_pos(ix, iz)
            half_t = spec.tower_w / 2
            pin_per_side = rng.randint(4, 6)
            pad_w = 0.30
            pad_d = 0.15
            for side, (sx, sz, dx, dz) in enumerate(
                [
                    (cx, cz - half_t, 1, 0),  # north edge
                    (cx + half_t, cz, 0, 1),  # east edge
                    (cx, cz + half_t, 1, 0),  # south edge
                    (cx - half_t, cz, 0, 1),  # west edge
                ]
            ):
                step = (spec.tower_w - 0.6) / (pin_per_side + 1)
                for k in range(pin_per_side):
                    off = -((pin_per_side - 1) * step) / 2 + k * step
                    px = sx + dx * off
                    pz = sz + dz * off
                    stub_len = 0.5
                    if side == 0:
                        ex, ez = px, pz - stub_len
                    elif side == 1:
                        ex, ez = px + stub_len, pz
                    elif side == 2:
                        ex, ez = px, pz + stub_len
                    else:
                        ex, ez = px - stub_len, pz
                    draw_line_units(draw, spec, px, pz, ex, ez, 0.08, tower_color)
                    pw, pd = (pad_w, pad_d) if side in (0, 2) else (pad_d, pad_w)
                    draw_rect_units(draw, spec, ex, ez, pw, pd, tower_color)

    return img


def add_glow_around_color(
    img: Image.Image,
    target_hex: str,
    match_tolerance: int,
    blur_px: int,
    intensity: float,
) -> Image.Image:
    """Composite an additive Gaussian-blur glow halo around pixels that
    approximately match target_hex.

    Used for the purple PCB traces — the static-bake floor architecture
    can't run a runtime bloom pass, so this fakes the neon-glow look
    by painting a blurred copy of the target-color pixels back onto the
    image with additive blend (ImageChops.add clamps at 255).
    """
    target = (
        int(target_hex[1:3], 16),
        int(target_hex[3:5], 16),
        int(target_hex[5:7], 16),
    )
    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    # Mask = pixels within match_tolerance of the target color on each
    # channel. Multiplied together so all 3 conditions must hold.
    r_mask = r.point(lambda v: 255 if abs(v - target[0]) <= match_tolerance else 0)
    g_mask = g.point(lambda v: 255 if abs(v - target[1]) <= match_tolerance else 0)
    b_mask = b.point(lambda v: 255 if abs(v - target[2]) <= match_tolerance else 0)
    mask = ImageChops.multiply(ImageChops.multiply(r_mask, g_mask), b_mask)

    # Paint target color wherever mask is set, black elsewhere.
    glow_color = Image.new(
        "RGB",
        img.size,
        (
            int(target[0] * intensity),
            int(target[1] * intensity),
            int(target[2] * intensity),
        ),
    )
    glow = Image.composite(glow_color, Image.new("RGB", img.size, (0, 0, 0)), mask)
    glow = glow.filter(ImageFilter.GaussianBlur(blur_px))

    # Additive composite onto the original (clamps at 255 → bright halo
    # around traces, no effect on dark floor away from purple).
    if img.mode == "RGBA":
        added = ImageChops.add(img.convert("RGB"), glow)
        out = Image.merge(
            "RGBA",
            [*added.split(), img.getchannel("A")],
        )
        return out
    return ImageChops.add(img, glow)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tower-count", type=int, default=10)
    p.add_argument("--tower-w", type=float, default=5.0)
    p.add_argument("--spacing", type=float, default=12.0)
    p.add_argument(
        "--floor-scale",
        type=float,
        default=1.5,
        help="floor_size / field_size ratio (matches index.html *1.5)",
    )
    p.add_argument(
        "--resolution", type=int, default=4096, help="output PNG square resolution in px"
    )
    p.add_argument("--bg", default="#02080f")
    # Trace lines (PCB bus work, dogleg connectors, accent badges) —
    # purple per Hackers movie refs. Tower footprints + chip pads still
    # use --tower-color (cyan, matches the tower-edge tubes).
    p.add_argument("--primary", default="#9966ff")
    p.add_argument("--tower-color", default="#00ddff")
    p.add_argument("--accent", default="#ff3a8c")
    p.add_argument("--seed", type=int, default=12345)
    p.add_argument("--out", type=Path, default=Path("assets/floor_baked.png"))
    args = p.parse_args()

    spec = FloorSpec(
        tower_count=args.tower_count,
        tower_w=args.tower_w,
        spacing=args.spacing,
        floor_scale=args.floor_scale,
        resolution=args.resolution,
    )
    print(
        f"baking floor: field={spec.field_size}u, floor={spec.floor_size}u, "
        f"px/unit={spec.px_per_unit:.2f}, out={args.out}"
    )
    img = bake(spec, args.bg, args.primary, args.accent, args.tower_color, args.seed)
    img = add_glow_around_color(
        img,
        target_hex=args.primary,
        match_tolerance=60,
        blur_px=int(spec.px_per_unit * 0.5),
        intensity=0.7,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    img.save(args.out, optimize=True)
    print(f"wrote {args.out} ({args.out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
