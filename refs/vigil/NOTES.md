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
