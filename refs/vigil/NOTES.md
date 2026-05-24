# Vigil theme references — Iron Man (2008) "Hot Rod Red" scene

Source: https://www.youtube.com/watch?v=b8Nnft5SwHE (1:32, 1920x960, h264)
Extracted: 2026-05-23 via claude-video-vision plugin (video_analyze + video_watch) + ffmpeg seek-to-frame

## Frames

| File | Timestamp | What it captures |
|---|---|---|
| `00_00_01_wireframe_mask_blueprint.png` | 0:01 | Clean cyan wireframe Iron Man mask on dark grid. Measurement dots at intersections. Top-corner status chip. |
| `00_00_08_workshop_dashboard_wide.png` | 0:08 | Full workshop wide shot — multi-monitor cell-dashboard parallel to lucida. Tower-stack panels. |
| `00_00_16_dual_monitor_body_schematic.png` | 0:16 | Dual-monitor: schematic + spec table. Body model with numeric readouts ("464", "041", "411"). |
| `00_00_32_dashboard_with_jarvis_text.png` | 0:32 | Jarvis dialog rendered as inline cyan text on dashboard panels. Concentric circle + crosshair widgets. |
| `00_00_40_skull_scan_corners.png` | 0:40 | Skull/face scan icon in top-corner chrome — recurring vigil motif for cell-fresh/active state. |
| `00_01_14_single_panel_hud.png` | 1:14 | Close-up of single dashboard panel — clean text legibility reference. |
| `00_01_22_render_complete_mrk3_red.png` | 1:22 | "RENDER IS COMPLETE / MRK3_V02" banner — red-orange complete-state on dark; full red Iron Man render with gold trim. |
| `00_01_30_workshop_body_schematic_finale.png` | 1:30 | Final workshop wide — cyan body schematic with concentric chest reactor glow, multi-monitor mix. |

## Design vocabulary

- **Dominant cyan**: teal-leaning `#00d8e8` family (not pure sky-blue) — current vigil.tokens.json
  primary `#00bfff` is slightly too blue.
- **Background**: true black `#000000` ✓
- **Text fg**: brighter cyan-white (~`#cceeff`); current `#b8e0f7` is slightly muted.
- **Translucent panels**: clearly visible — vigil cell bg should be `rgba(8, 16, 24, 0.85)` not opaque.
- **Arc reactor gold accent** `#ffd700` ✓ (suit trim, ok-state indicators).
- **Red-orange complete state** `#ff5040` range — rare highlight when build/render finishes.
- **Wireframe stroke**: lines connected by measurement dots at junctions. Specific FUI flair worth emulating in mermaid.
- **Numeric readouts**: dominant motif — large bright cyan numbers, smaller cap labels.
- **Skull/face scan icon**: corner-chrome cell-fresh state indicator (vigil-specific flair).

## Polishes derived from these refs (2026-05-23 commit pending)

1. vigil.tokens.json: primary cyan → teal-cyan; text-fg → brighter; cat[2] swap orange → cyan-family
   so large treemap categories stay inside the cyan envelope.
2. Cell bg slight translucency.
3. Future: skull-scan corner-chrome animation for vigil's cell-fresh state.
4. Future: numeric-readout substrate styling — large cyan number + small cap label as a vigil-default
   render for sparkline/gauge "snap to single value" moments.

---

## IM2 supplement (added 2026-05-24)

Two additional Iron Man 2 scenes shared by user, both in same vigil/Jarvis register but bringing **NEW chrome primitives not visible in the original IM1 Hot Rod Red frames**:

1. **"Welcome Home Sir" workshop scene** — <https://www.youtube.com/watch?v=EfmVRQjoNcY> (4:22). Multi-panel dashboard array around Tony at the workstation.
2. **"New element discovery" scene** — <https://www.youtube.com/watch?v=Ddk9ci6geSs> (3:12). Multi-panel orbital HUD + holographic city model + particle-cloud atomic-structure sphere.

### Additional frames (IM2-prefixed)

| File | Source | What it captures |
|---|---|---|
| `00_00_30_im2_workshop_multi_panel_hud_array.png` | welcome 0:30 | Tony at workstation surrounded by ~6 holographic display panels arranged in arc, each showing different armor view. Multi-screen workshop layout. |
| `00_00_56_im2_arc_reactor_holding_close.png` | welcome 0:56 | Tony holding the iconic Mark-II arc reactor in hand, with translucent holographic UI panels visible in background. Object + ambient HUD coexist. |
| `00_02_50_im2_stark_expo_wall_display.png` | welcome 2:50 | Wall-mounted Stark Expo display (digital signage) showing event details + Iron Man poster. Branded promotional UI variant. |
| `00_00_42_im2_stark_expo_city_hologram_floor.png` | element 0:42 | **THE iconic translucent cyan holographic city model** projected over the workshop floor — entire Stark Expo grounds rendered as glowing wireframe-plus-particles 3D model. Tony standing in the middle of it. |
| `00_01_25_im2_orbital_multi_panel_hud_center.png` | element 1:25 | **MULTIPLE FLOATING HOLOGRAPHIC PANELS** orbiting around a central holographic mechanism — Tony reaching into the projection. **THE canonical Jarvis multi-panel HUD shot.** |
| `00_01_45_im2_orbital_panel_scatter_dots.png` | element 1:45 | Similar orbital-panel layout with **scattered cyan glowing dots** as periphery ambient — extension of the multi-panel pattern. |
| `00_02_07_im2_atomic_structure_particle_sphere.png` | element 2:07 | **Particle-cloud atomic-structure sphere** — the new element as a 3D molecular model rendered entirely from cyan glowing point-particles, floating in air. |
| `00_02_27_im2_atomic_structure_close_particles.png` | element 2:27 | Close-up of the particle-cloud sphere — individual particle texture visible. |

### NEW design primitives (additions to original vigil vocabulary)

1. **Multi-panel orbital HUD** (frames 0:30 welcome + 1:25 + 1:45 element) — N display panels arranged in arc/orbit around a central focal point. Each panel shows different data. Tony interacts at center. **Maps to a future "cockpit" / "operator" layout for vigil** — same named-slot pattern as PHM (task #190) but with curved arc arrangement instead of orthogonal grid.

2. **Particle-cloud volumetric** (frames 2:07 + 2:27 element) — 3D structure rendered as cyan glowing points instead of solid geometry or wireframe edges. Different from existing `scene3d` primitives. **Map to a new `scene3d` primitive variant: `particle_structure`** — like `particle_cloud` but with non-random topology (positions describe a molecular/structural shape).

3. **Translucent city-model hologram** (frame 0:42 element) — full architectural model floating in space as wireframe-plus-particles. **Maps to a "spatial overview" cell mode** — could show org/repo/system architecture as a faux-3D model rather than a flat diagram.

4. **Branded promotional display** (frame 2:50 welcome) — wall-mounted big-screen with promotional UI variant. **Maps to a "status board" mode** for vigil — different chrome for cells that are announcements/notifications vs. live data.

### Composability with PHM cockpit-layout arc (task #190)

The IM2 orbital multi-panel HUD pattern is **structurally identical** to the PHM cockpit-layout slot arrangement, just with a curved/orbital geometry instead of orthogonal grid. Both:
- Have a central focal point (workstation in IM2, hero cell in PHM)
- Have N peripheral panels showing different data domains
- Are themed-distinct but share the slot-allocation pattern

When the cockpit layout primitive lands, it should be PARAMETERIZABLE:
- `arrangement: "grid"` (PHM rectilinear)
- `arrangement: "arc"` (IM2 / vigil orbital)
- `arrangement: "dome"` (eDEX-UI surrounding)

Same primitive, three aesthetic dialects. Adds to the eDEX-UI/PHM/LCARS triangulation already noted.

### Retune scope addition for vigil

In addition to the original IM1-derived retune scope:
- `particle_structure` scene3d primitive variant: ~1.5hr
- Orbital chrome variant for vigil-themed dashboards: tied to cockpit-layout primitive (task #190 dependency)
