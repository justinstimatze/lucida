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
from collections import deque
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
    """Sparse asymmetric chip-pad accents inside each tower footprint.
    Earlier cross-hatch grid version read as a Go-board (decision 2026-05-04
    "looks like a go board"); replaced with random-scattered darker
    rectangles of varying sizes — closer to PCB silkscreen markings,
    no repeating axis-aligned uniformity.
    """
    accent_color = shade(tower_color, 0.45)
    half_t = spec.tower_w / 2
    inset = 0.25
    for ix in range(spec.tower_count):
        for iz in range(spec.tower_count):
            cx, cz = spec.tower_world_pos(ix, iz)
            placed: list[tuple[float, float, float, float]] = []
            n_marks = rng.randint(3, 6)
            tries = 0
            while len(placed) < n_marks and tries < 40:
                tries += 1
                w = rng.choice([0.22, 0.32, 0.32, 0.55, 0.85])
                h = rng.choice([0.22, 0.32, 0.85])
                if rng.random() < 0.5:
                    w, h = h, w
                ax = rng.uniform(-half_t + inset + w / 2, half_t - inset - w / 2)
                az = rng.uniform(-half_t + inset + h / 2, half_t - inset - h / 2)
                # Reject if overlapping any prior mark
                clear = True
                for px, pz, pw, ph in placed:
                    if abs(px - ax) < (pw + w) / 2 + 0.08 and abs(pz - az) < (ph + h) / 2 + 0.08:
                        clear = False
                        break
                if not clear:
                    continue
                placed.append((ax, az, w, h))
                draw_rect_units(draw, spec, cx + ax, cz + az, w, h, accent_color)


def is_in_tower(spec: FloorSpec, x: float, z: float, margin: float = 0.0) -> bool:
    offset = (spec.tower_count - 1) * 0.5
    ix = round((x / spec.spacing) + offset)
    iz = round((z / spec.spacing) + offset)
    if not (0 <= ix < spec.tower_count and 0 <= iz < spec.tower_count):
        return False
    cx, cz = spec.tower_world_pos(ix, iz)
    h = spec.tower_w / 2 + margin
    return abs(x - cx) < h and abs(z - cz) < h


class FloorRouter:
    """Manhattan BFS path router for pin-to-pin floor traces. Adapted
    from the nano-banana 'Gibson Circuit Explorer' algorithm shared by
    the decision 2026-05-04 — chips become grid obstacles, pin-to-pin nets
    are routed cell-by-cell with strict 90-degree-only motion, and
    each routed path becomes an obstacle for subsequent routes so
    later traces don't overlap earlier ones.
    """

    def __init__(self, spec: FloorSpec, cell_u: float = 0.3):
        self.spec = spec
        self.cell_u = cell_u
        self.cols = int(spec.floor_size / cell_u) + 2
        self.rows = self.cols
        self.obstacles: set[tuple[int, int]] = set()

    def world_to_grid(self, x: float, z: float) -> tuple[int, int]:
        half = self.spec.floor_size / 2.0
        c = int((x + half) / self.cell_u)
        r = int((z + half) / self.cell_u)
        return c, r

    def grid_to_world(self, c: int, r: int) -> tuple[float, float]:
        half = self.spec.floor_size / 2.0
        return c * self.cell_u - half, r * self.cell_u - half

    def block_rect(self, x0: float, z0: float, x1: float, z1: float, pad_cells: int = 0) -> None:
        c0, r0 = self.world_to_grid(x0, z0)
        c1, r1 = self.world_to_grid(x1, z1)
        cmin, cmax = min(c0, c1) - pad_cells, max(c0, c1) + pad_cells
        rmin, rmax = min(r0, r1) - pad_cells, max(r0, r1) + pad_cells
        for c in range(cmin, cmax + 1):
            for r in range(rmin, rmax + 1):
                if 0 <= c < self.cols and 0 <= r < self.rows:
                    self.obstacles.add((c, r))

    def find_path(
        self, start: tuple[int, int], end: tuple[int, int]
    ) -> list[tuple[int, int]] | None:
        """BFS that PREFERS straight motion to encourage long ribbon
        runs (per nano-banana 'rigid stepped maze'). Implemented by
        exploring same-direction neighbour first; deque order makes
        BFS shortest-path-by-step, ties broken by exploration order.
        """
        if start == end:
            return [start]
        if end in self.obstacles:
            return None
        parents: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
        queue: deque[tuple[tuple[int, int], tuple[int, int]]] = deque([(start, (0, 0))])
        while queue:
            cur, last_dir = queue.popleft()
            if cur == end:
                path: list[tuple[int, int]] = []
                node: tuple[int, int] | None = cur
                while node is not None:
                    path.append(node)
                    node = parents[node]
                return list(reversed(path))
            # Straight-first ordering: same dir, then perpendiculars.
            same = [(last_dir,)] if last_dir != (0, 0) else []
            others = [(1, 0), (-1, 0), (0, 1), (0, -1)]
            ordered = []
            if last_dir != (0, 0):
                ordered.append(last_dir)
            for d in others:
                if d != last_dir:
                    ordered.append(d)
            for dx, dz in ordered:
                nxt = (cur[0] + dx, cur[1] + dz)
                if nxt in parents:
                    continue
                if not (0 <= nxt[0] < self.cols and 0 <= nxt[1] < self.rows):
                    continue
                if nxt in self.obstacles and nxt != end:
                    continue
                parents[nxt] = cur
                queue.append((nxt, (dx, dz)))
            _ = same  # suppress unused-warning style
        return None

    def block_path(self, path: list[tuple[int, int]], thickness: int = 1) -> None:
        """Block a routed path from subsequent searches. Thickness>1
        widens the obstacle perpendicular to motion so the next ribbon
        line won't run AT the same grid cell — keeps adjacent ribbon
        lines from collapsing onto each other.
        """
        for cell in path:
            for dc in range(-thickness // 2, thickness // 2 + 1):
                for dr in range(-thickness // 2, thickness // 2 + 1):
                    self.obstacles.add((cell[0] + dc, cell[1] + dr))


def tower_perimeter_pin_tips(spec: FloorSpec, ix: int, iz: int, pin_per_side: int = 5):
    """Return list of (x, z, side) tuples for the OUTWARD pin tips of
    tower (ix, iz). Side ∈ {'N', 'E', 'S', 'W'}. Pin tip = where the
    chip-pad terminator stub ends — that's where buses attach.
    Deterministic given (ix, iz, pin_per_side); must match the
    perimeter-pin loop in bake() for visual continuity.
    """
    cx, cz = spec.tower_world_pos(ix, iz)
    half_t = spec.tower_w / 2
    stub_len = 0.5
    step = (spec.tower_w - 0.6) / (pin_per_side + 1)
    tips: list[tuple[float, float, str]] = []
    for k in range(pin_per_side):
        off = -((pin_per_side - 1) * step) / 2 + k * step
        tips.append((cx + off, cz - half_t - stub_len, "N"))
        tips.append((cx + half_t + stub_len, cz + off, "E"))
        tips.append((cx + off, cz + half_t + stub_len, "S"))
        tips.append((cx - half_t - stub_len, cz + off, "W"))
    return tips


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

    # 1b. BFS-routed pin-to-pin nets: the structural piece nano-banana
    #     (decision 2026-05-04) keeps emphasizing — buses connect SPECIFIC
    #     chip pin terminals, not random points in space. Each net is
    #     a 3-line ribbon between consecutive pins on two random towers,
    #     routed cell-by-cell with strict 90-degree-only motion. The
    #     three lines run BFS-individually, but adjacent pin starts +
    #     straight-first BFS keep them roughly parallel through the
    #     corridor system.
    router = FloorRouter(spec, cell_u=0.30)
    # Block all tower bboxes (chips become obstacles)
    for ix in range(spec.tower_count):
        for iz in range(spec.tower_count):
            cx, cz = spec.tower_world_pos(ix, iz)
            ht = spec.tower_w / 2
            router.block_rect(cx - ht, cz - ht, cx + ht, cz + ht, pad_cells=1)
    # Cache pin tips per tower
    all_tips: dict[tuple[int, int], list[tuple[float, float, str]]] = {}
    for ix in range(spec.tower_count):
        for iz in range(spec.tower_count):
            all_tips[(ix, iz)] = tower_perimeter_pin_tips(spec, ix, iz, pin_per_side=5)
    # Generate K nets between random pairs of towers. Each net = one
    # ribbon of 3 parallel lines between adjacent pin tips on two chips.
    n_nets = spec.tower_count * spec.tower_count * 2  # ~200 for 10x10 grid
    for _ in range(n_nets):
        ix_a = rng.randint(0, spec.tower_count - 1)
        iz_a = rng.randint(0, spec.tower_count - 1)
        ix_b = rng.randint(0, spec.tower_count - 1)
        iz_b = rng.randint(0, spec.tower_count - 1)
        if (ix_a, iz_a) == (ix_b, iz_b):
            continue
        # Manhattan distance > 1 cell
        if abs(ix_a - ix_b) + abs(iz_a - iz_b) > 5:
            continue
        # Pick a side per chip facing roughly toward the other chip
        side_a = "S" if iz_b > iz_a else ("N" if iz_b < iz_a else ("E" if ix_b > ix_a else "W"))
        side_b = "N" if iz_b > iz_a else ("S" if iz_b < iz_a else ("W" if ix_b > ix_a else "E"))
        tips_a = [t for t in all_tips[(ix_a, iz_a)] if t[2] == side_a]
        tips_b = [t for t in all_tips[(ix_b, iz_b)] if t[2] == side_b]
        if len(tips_a) < 3 or len(tips_b) < 3:
            continue
        # True ribbon-offset routing: ONE BFS for the centerline (between
        # the middle pin of each chip's 3-pin window), then geometrically
        # offset that path perpendicular to travel direction for the two
        # adjacent ribbon lines. All three lines bend together at every
        # corner, maintaining parallel spacing — what nano-banana called
        # the "Ribbon Cables ... bend together" property the prior
        # 3-independent-BFS approach was missing.
        start_pin_a = rng.randint(0, len(tips_a) - 3)
        start_pin_b = rng.randint(0, len(tips_b) - 3)
        center_pin_a = tips_a[start_pin_a + 1]
        center_pin_b = tips_b[start_pin_b + 1]
        grid_a = router.world_to_grid(center_pin_a[0], center_pin_a[1])
        grid_b = router.world_to_grid(center_pin_b[0], center_pin_b[1])
        center_path = router.find_path(grid_a, grid_b)
        if center_path is None:
            continue
        router.block_path(center_path, thickness=3)
        # Reduce dense path to corner points (only direction changes).
        center_corners: list[tuple[int, int]] = [center_path[0]]
        prev_dir: tuple[int, int] | None = None
        for i in range(1, len(center_path)):
            cur_dir = (
                center_path[i][0] - center_path[i - 1][0],
                center_path[i][1] - center_path[i - 1][1],
            )
            if prev_dir is not None and cur_dir != prev_dir:
                center_corners.append(center_path[i - 1])
            prev_dir = cur_dir
        center_corners.append(center_path[-1])

        # Generate offset corner-point sequences for k = -1, 0, +1.
        # At each corner, offset point shifts by perp(d_in)+perp(d_out)
        # times k. perp((dx, dz)) = (dz, -dx). At endpoints, only the
        # one neighboring direction's perp applies.
        def _offset(corners: list[tuple[int, int]], k: float) -> list[tuple[float, float]]:
            if len(corners) < 2 or k == 0:
                return [(float(c), float(r)) for c, r in corners]
            out: list[tuple[float, float]] = []
            for i, p in enumerate(corners):
                shift_x = 0.0
                shift_z = 0.0
                if i > 0:
                    d = (corners[i][0] - corners[i - 1][0], corners[i][1] - corners[i - 1][1])
                    sgn = (
                        1 if d[0] > 0 else (-1 if d[0] < 0 else 0),
                        1 if d[1] > 0 else (-1 if d[1] < 0 else 0),
                    )
                    shift_x += sgn[1]
                    shift_z += -sgn[0]
                if i < len(corners) - 1:
                    d = (corners[i + 1][0] - corners[i][0], corners[i + 1][1] - corners[i][1])
                    sgn = (
                        1 if d[0] > 0 else (-1 if d[0] < 0 else 0),
                        1 if d[1] > 0 else (-1 if d[1] < 0 else 0),
                    )
                    shift_x += sgn[1]
                    shift_z += -sgn[0]
                # Endpoint: divide by 1 (only one neighbor); middle: divide by 2 (sum)
                divisor = 2.0 if 0 < i < len(corners) - 1 else 1.0
                shift_x = (shift_x / divisor) * k
                shift_z = (shift_z / divisor) * k
                out.append((p[0] + shift_x, p[1] + shift_z))
            return out

        ribbon_spacing = 0.6  # cells (~0.18u with 0.30u grid) — tight ribbon
        ribbons = [
            _offset(center_corners, -ribbon_spacing),
            [(float(c), float(r)) for c, r in center_corners],
            _offset(center_corners, +ribbon_spacing),
        ]
        # Render: 3 parallel strokes through the same corner sequence.
        bw = rng.choice([0.08, 0.10, 0.12])
        bcolor = primary if rng.random() > 0.15 else primary_mid
        for corners in ribbons:
            world_pts = [router.grid_to_world(c, r) for c, r in corners]
            for i in range(len(world_pts) - 1):
                _line(
                    world_pts[i][0],
                    world_pts[i][1],
                    world_pts[i + 1][0],
                    world_pts[i + 1][1],
                    bw,
                    bcolor,
                )
            # Endpoint pads
            for px, pz in (world_pts[0], world_pts[-1]):
                draw_rect_units(draw, spec, px, pz, pad_size * 0.6, pad_size * 0.6, primary)

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
        n_bundles = rng.randint(1, 2)
        for _ in range(n_bundles):
            bsize = rng.randint(3, 6)
            bspacing = rng.uniform(0.13, 0.18)
            bwidth = (bsize - 1) * bspacing
            if z_hi - z_lo < bwidth + 0.6:
                continue
            bz_center = rng.uniform(z_lo + bwidth / 2 + 0.1, z_hi - bwidth / 2 - 0.1)
            bx0 = -half + rng.uniform(3, spec.field_size * 0.45)
            bx1 = half - rng.uniform(3, spec.field_size * 0.45)
            if bx1 <= bx0 + 4:
                continue
            bw = rng.choice([0.08, 0.10, 0.10, 0.14])
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
            # Intra-bundle rungs: short perpendicular segments connecting
            # adjacent traces in the bundle, creating a ladder-like
            # organic structure (refs show bundles with rung crossbars,
            # not just parallel buses). 3-6 rungs per bundle at random
            # x positions inside the bundle's run.
            n_rungs = rng.randint(3, 6)
            for _r in range(n_rungs):
                rx = rng.uniform(bx0 + 0.5, bx1 - 0.5)
                # Pick 2 adjacent rows in the bundle
                k0 = rng.randint(0, max(0, bsize - 2))
                z_top = bz_center - bwidth / 2 + k0 * bspacing
                z_bot = bz_center - bwidth / 2 + (k0 + 1) * bspacing
                _line(rx, z_top, rx, z_bot, bw * 0.8, bcolor)
            h_bundle_meta.append((bz_center, bwidth, bx0, bx1, bw, bcolor, z_lo, z_hi))

    # 2b. Vertical lane bus traces (no spurs yet).
    v_bundle_meta: list[tuple[float, float, float, float, float, str, float, float]] = []
    for ix in range(spec.tower_count - 1):
        xa, _ = spec.tower_world_pos(ix, 0)
        xb, _ = spec.tower_world_pos(ix + 1, 0)
        x_mid = (xa + xb) / 2
        x_lo = x_mid - corridor / 2 + 0.85
        x_hi = x_mid + corridor / 2 - 0.85
        n_bundles = rng.randint(1, 2)
        for _ in range(n_bundles):
            bsize = rng.randint(3, 6)
            bspacing = rng.uniform(0.13, 0.18)
            bwidth = (bsize - 1) * bspacing
            if x_hi - x_lo < bwidth + 0.6:
                continue
            bx_center = rng.uniform(x_lo + bwidth / 2 + 0.1, x_hi - bwidth / 2 - 0.1)
            bz0 = -half + rng.uniform(3, spec.field_size * 0.45)
            bz1 = half - rng.uniform(3, spec.field_size * 0.45)
            if bz1 <= bz0 + 4:
                continue
            bw = rng.choice([0.08, 0.10, 0.10, 0.14])
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
                    # Pure 90-degree stepped L: bus → vertical leg →
                    # horizontal step → vertical leg → pad. No chamfer
                    # / diagonal middle segment (nano-banana 2026-05-04
                    # "Sharp, Stepped Turns ... no curves; it is a
                    # rigid, stepped maze").
                    run_perp = edge_perp - 0.6
                    pre = max(0.4, run_perp * rng.uniform(0.35, 0.65))
                    lat = rng.uniform(0.25, 0.55) * rng.choice([-1, 1])
                    ax, az_ = xs, outer_zt
                    bx, bz = xs, outer_zt + direction_sign * pre
                    cx_, cz_ = xs + lat, bz
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
                    # Pure 90-degree stepped L (see h-bundle spurs above).
                    run_perp = edge_perp - 0.6
                    pre = max(0.4, run_perp * rng.uniform(0.35, 0.65))
                    lat = rng.uniform(0.25, 0.55) * rng.choice([-1, 1])
                    ax, az_ = outer_xt, zs
                    bx, bz = outer_xt + direction_sign * pre, zs
                    cx_, cz_ = bx, zs + lat
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

    # (Wandering L-traces removed 2026-05-04: read as "scattered bits
    # of lines and pads overlapping each other or clustered together"
    # — fragments without a destination, not the routed pin-to-pin
    # nets the refs show. Replaced by the connector-block grids below
    # which look like ICs in interstitial space; full pin-routed buses
    # are a bigger follow-up.)

    # (Section 5b "diagonal corner traces" REMOVED 2026-05-04 — those
    # were diagonals at corridor intersections, which violates the
    # nano-banana "no curves; rigid, stepped maze" rule. The buses +
    # spurs + connector blocks below already populate intersections.)

    # 5c. Connector blocks: small interstitial "IC packages" placed in
    #     corridor intersections. Each is a 2x2 or 3x3 grid of pads
    #     with U-jumper traces between them — modelled on the nano-
    #     banana ref breakdown ("ConnectorBlocks ... 2x2 or 3x3 grid
    #     of square terminal pads with tiny, internal, U-shaped
    #     traces"). Drawn AFTER the bus mesh so collision rejection
    #     against existing traces works.
    placed_blocks: list[tuple[float, float, float]] = []
    n_blocks = max(8, (spec.tower_count - 1) ** 2 // 2)
    tries = 0
    placed = 0
    while placed < n_blocks and tries < n_blocks * 8:
        tries += 1
        # Pick a corridor intersection at random
        ix = rng.randint(0, spec.tower_count - 2)
        iz = rng.randint(0, spec.tower_count - 2)
        xa, _ = spec.tower_world_pos(ix, 0)
        xb, _ = spec.tower_world_pos(ix + 1, 0)
        _, za = spec.tower_world_pos(0, iz)
        _, zb = spec.tower_world_pos(0, iz + 1)
        cx, cz = (xa + xb) / 2, (za + zb) / 2
        # Jitter within the intersection clear zone
        jitter = (corridor / 2) - 1.2
        cx += rng.uniform(-jitter, jitter)
        cz += rng.uniform(-jitter, jitter)
        # Block dimensions: 2x2 or 3x3 pads
        n_pads = rng.choice([2, 2, 3])
        pad_pitch = 0.32
        block_w = (n_pads - 1) * pad_pitch + 0.40
        # Reject if too close to another block
        too_close = False
        for px, pz, pw in placed_blocks:
            if (
                abs(px - cx) < (pw + block_w) / 2 + 0.50
                and abs(pz - cz) < (pw + block_w) / 2 + 0.50
            ):
                too_close = True
                break
        if too_close:
            continue
        # Reject if any pad would land on an existing trace
        clear = True
        for i in range(n_pads):
            for j in range(n_pads):
                px = cx - (n_pads - 1) * pad_pitch / 2 + i * pad_pitch
                pz = cz - (n_pads - 1) * pad_pitch / 2 + j * pad_pitch
                if not _pad_clear(px, pz, 0.18, 0.18, clearance=0.04):
                    clear = False
                    break
            if not clear:
                break
        if not clear:
            continue
        # Draw the block: small pads + U-jumper between adjacent pads
        # in one row (per nano-banana "U-shaped jumper connectors").
        for i in range(n_pads):
            for j in range(n_pads):
                px = cx - (n_pads - 1) * pad_pitch / 2 + i * pad_pitch
                pz = cz - (n_pads - 1) * pad_pitch / 2 + j * pad_pitch
                draw_rect_units(draw, spec, px, pz, 0.18, 0.18, primary)
        # U-jumpers connecting one pair of adjacent pads in a random row
        if n_pads >= 2 and rng.random() < 0.7:
            row = rng.randint(0, n_pads - 1)
            i0 = rng.randint(0, n_pads - 2)
            x0 = cx - (n_pads - 1) * pad_pitch / 2 + i0 * pad_pitch
            x1 = x0 + pad_pitch
            zr = cz - (n_pads - 1) * pad_pitch / 2 + row * pad_pitch
            jump_z = zr + (pad_pitch * 0.55) * rng.choice([-1, 1])
            _line(x0, zr, x0, jump_z, 0.05, primary_mid)
            _line(x0, jump_z, x1, jump_z, 0.05, primary_mid)
            _line(x1, jump_z, x1, zr, 0.05, primary_mid)
        placed_blocks.append((cx, cz, block_w))
        placed += 1

    # 6. Tower footprints = bright "hole into a bright light" visible
    #    through translucent tower glass. Uses tower_color (cyan, matches
    #    the tower-edge tubes) — distinct from primary which colours the
    #    purple PCB traces per refs (decision 2026-05-03 "the floor lines/
    #    traces are pretty consistently purple ... reflections of the
    #    purple circuit lines in the glass of the tower faces").
    overpaint_tower_bboxes(draw, spec, fill=tower_color, margin=0.0)
    # (Tower-base detail removed 2026-05-04: cross-hatch read as a
    # Go-board, scattered chip pads also didn't land. Back to flat
    # cyan footprints; revisit if a non-grid texture idea surfaces.)

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
