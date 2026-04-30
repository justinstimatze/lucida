# Demo recording

## Quick reference

```bash
# Terminal 1 — reset cells and start dripping
bash demo/record.sh

# Record manually: Ctrl+Alt+Shift+R to start, same to stop
# Recording saves to ~/Videos/Screencast*.webm

# Convert to MP4 (trim the first few seconds of futz time)
bash demo/convert.sh ~/Videos/Screencast*.webm --trim 6
```

That produces `assets/demo.mp4`. Embed in the README with:

```markdown
![lucida demo](assets/demo.mp4)
```

---

## Demo session content

`seed_conversation.md` contains 8 prompts voiced as a plasma physicist reading
the NIF ignition paper (Abu-Shawareb et al., PRL 132, 065102 — Dec 2022 shot,
Q≈1.54). Each prompt ends with a genuine physics question; Claude explains, and
lucida auto-mints the visuals. No explicit "plot this" language.

To run a fresh live session instead of replaying curated cells:

```bash
# Terminal 1
bash demo/start_session.sh

# Terminal 2
mkdir -p /tmp/nif-session && cd /tmp/nif-session && claude
# Paste prompts from seed_conversation.md, wait ~30s between each
```

After the session, curate the best cells:

```bash
python demo/curate.py --session nif-demo
# → writes demo/demo_cells.json
```

Then replay those cells for recording:

```bash
bash demo/record.sh   # resets + drips demo_cells.json
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| `record.sh` | Reset cells + start replay drip; print recording instructions |
| `convert.sh` | Convert raw WebM → `assets/demo.mp4` |
| `replay.py` | Drip `demo_cells.json` into `cells.json` at a configurable interval |
| `curate.py` | Extract best cells from a live session into `demo_cells.json` |
| `start_session.sh` | Start renderer + watcher for a fresh live session |
| `seed_conversation.md` | 8-prompt NIF ignition paper session script |

---

## Notes

- **GNOME Wayland automated recording** (`org.gnome.Shell.Screencast`) produced
  a 1-frame WebM on this machine — root cause unknown (GStreamer pipeline
  terminates immediately). Manual recording with Ctrl+Alt+Shift+R works fine.
- The GNOME built-in recorder saves VP8 WebM to `~/Videos/Screencasts/`.
- `convert.sh` re-encodes to H.264 MP4 which GitHub embeds natively in READMEs.
- `demo_cells.json` is gitignored — regenerate with `curate.py` from a live session.
