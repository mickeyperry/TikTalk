# TikTalk

**TikTok-style auto-captions for After Effects.**
*Keeping up with the kids, one caption at a time.*

TikTalk transcribes the voice-over in your comp **locally** (whisper.cpp — no cloud,
no account, no per-minute fees) and generates animated, word-accurate caption
layers in one click. Made by **Mickey Perry**.

---

## Install (the easy way)

1. **Download** this repo — green `Code` button → `Download ZIP` → extract anywhere.
2. **Double-click `install.bat`.** That's it. No certificates, no ZXP wrestling —
   it registers the panel for your user (no admin needed).
3. Restart After Effects → `Window > Extensions > TikTalk`.
4. First launch: click **Download engine** in the panel. It fetches
   whisper + ffmpeg + a language model (~250 MB, once).

> Prefer a `.zxp`? Run `setup\build_zxp.ps1` to build a self-signed
> `dist\TikTalk.zxp` and install it with any ZXP installer.

## Use

1. **Transcribe** — select your audio/video layer in the comp, hit *Use selected
   layer*, then *Transcribe*. Word timings get snapped to the actual waveform.
2. **Captions** — the transcript is fully editable (one word per line:
   `start  end  text`). Tune words-per-line, pause splitting, ALL CAPS, offset.
3. **Style** — pick any font installed on your machine with the searchable font
   picker (live preview), set size/stroke/colors/position, choose a reveal mode
   or an animation preset.
4. **Generate Titles** — always one click away in the bottom bar.

### Modes

- **Single layer (recommended):** one "Captions" text layer driven by hold
  keyframes — text changes exactly when each word is spoken, auto-centered and
  auto-shrunk to stay in frame.
- **Multi-layer:** one text layer per caption (per word for word-by-word / karaoke).

### Animation presets (work in both modes)

Punch, pop-in, word-by-word, bounce drop, typewriter, karaoke highlight — with
**Bounciness** and **Animation speed** sliders.

**Karaoke timing is keyframed:** single-layer mode adds a `Karaoke Word` slider
(hold keys 1, 2, 3… = which word of the phrase is lit, 0 = none); multi-layer
mode adds a `Karaoke` slider per word layer (first key = highlight start, last
key = end). Drag the keyframes in the timeline to retime the highlight.

The engine installer skips anything already on the machine (bin/ or PATH) and
walks back through whisper.cpp releases until it finds one that ships a Windows
x64 build.

## For development

- `install_dev_link.bat` junction-links this folder into CEP extensions, so your
  edits go live on every AE restart.
- The panel is plain CEP: `index.html` + `js/main.js` (panel logic, Node enabled)
  + `jsx/host.jsx` (ExtendScript that builds the layers).
- The searchable font picker uses AE's Font API (`app.fonts`, AE 24+). On older
  versions, type a PostScript name and press Enter.

## Requirements

- Windows, After Effects CC 2019 (16.0) or newer
  (font picker needs AE 2024+; everything else works on 2019+)
- ~250 MB disk for the local speech engine

---

Made by **MICKEY PERRY** · captions that pass the vibe check, no cap.
