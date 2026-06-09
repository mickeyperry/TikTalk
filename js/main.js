/* global CSInterface, SystemPath */
(function () {
    "use strict";

    var cs = new CSInterface();
    var extPath = cs.getSystemPath(SystemPath.EXTENSION);

    // Node modules (available because the manifest enables --enable-nodejs).
    var hasNode = (typeof require === "function");
    var cp, fs, path, os;
    if (hasNode) {
        cp = require("child_process");
        fs = require("fs");
        path = require("path");
        os = require("os");
    }

    // ---- tiny DOM helpers -------------------------------------------------
    function $(id) { return document.getElementById(id); }
    function show(el) { el.classList.remove("hidden"); }
    function hide(el) { el.classList.add("hidden"); }

    var logEl = $("log");
    function log(msg, cls) {
        var line = document.createElement("div");
        if (cls) line.className = cls;
        line.textContent = msg;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }
    function clearLog() { logEl.innerHTML = ""; }

    // ---- taglines: keeping up with the kids -------------------------------
    var TAGLINES = [
        "keeping up with the kids, one caption at a time",
        "fluent in Gen Z since never",
        "your captions just passed the vibe check",
        "no cap(tion) left behind",
        "ok boomer, we'll handle the subtitles",
        "brainrot-compatible since day one",
        "it's giving... readable",
        "making you sound younger than you are"
    ];
    $("tagline").textContent = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

    // ---- settings (persisted in localStorage) -----------------------------
    var SETTINGS_KEYS = ["whisperPath", "modelPath", "ffmpegPath", "language", "silenceDb", "silenceMin"];
    function loadSettings() {
        SETTINGS_KEYS.forEach(function (k) {
            // tt_ is the current prefix; pt_ is read once to migrate old installs.
            var v = localStorage.getItem("tt_" + k);
            if (v === null) v = localStorage.getItem("pt_" + k);
            if (v !== null) $(k).value = v;
        });
    }
    function saveSettingsSilent() {
        SETTINGS_KEYS.forEach(function (k) {
            localStorage.setItem("tt_" + k, $(k).value.trim());
        });
    }
    function saveSettings() {
        saveSettingsSilent();
        log("Settings saved.", "ok");
        checkEngine();
    }
    function computeBinPaths() {
        if (!hasNode) return null;
        var bin = path.join(extPath, "bin");
        var modelsDir = path.join(bin, "models");
        var model = "";
        try {
            var files = fs.readdirSync(modelsDir).filter(function (f) { return /\.bin$/.test(f); });
            // prefer base, then small, then first available
            var pick = files.filter(function (f) { return /base/.test(f); })[0]
                || files.filter(function (f) { return /small/.test(f); })[0]
                || files[0] || "";
            if (pick) model = path.join(modelsDir, pick);
        } catch (e) { /* models dir not there yet */ }
        return {
            whisper: path.join(bin, "whisper-cli.exe"),
            ffmpeg: path.join(bin, "ffmpeg.exe"),
            model: model || path.join(modelsDir, "ggml-base.bin")
        };
    }

    function autoFillPaths(silent) {
        var p = computeBinPaths();
        if (!p) return;
        $("whisperPath").value = p.whisper;
        $("ffmpegPath").value = p.ffmpeg;
        $("modelPath").value = p.model;
        if (!silent) log("Auto-filled paths from bin/. Click Save.", "ok");
    }

    // ---- engine check + one-click setup ------------------------------------
    function engineReady() {
        return fileOk($("whisperPath").value.trim()) &&
               fileOk($("ffmpegPath").value.trim()) &&
               fileOk($("modelPath").value.trim());
    }

    function checkEngine() {
        if (!hasNode) return;
        if (engineReady()) {
            hide($("setupCard"));
        } else {
            show($("setupCard"));
        }
    }

    var setupRunning = false;
    function runEngineSetup() {
        if (!hasNode || setupRunning) return;
        var script = path.join(extPath, "setup", "setup.ps1");
        if (!fileOk(script)) { log("setup.ps1 not found at " + script, "err"); return; }

        setupRunning = true;
        var btn = $("setupBtn");
        btn.disabled = true;
        btn.textContent = "Downloading…";
        var prog = $("setupProgress");
        show(prog);
        prog.classList.add("indef");
        prog.querySelector("span").textContent = "Fetching whisper + ffmpeg + model (~250 MB)…";
        log("Engine setup started — grab a coffee, this downloads ~250 MB once.");

        var p = cp.spawn("powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
            { windowsHide: true });
        function onData(d) {
            d.toString().split(/\r?\n/).forEach(function (ln) {
                if (ln.trim()) log(ln.trim());
            });
        }
        p.stdout.on("data", onData);
        p.stderr.on("data", onData);
        p.on("error", function (e) { finish("Setup failed to start: " + e.message); });
        p.on("close", function (code) {
            if (code === 0) {
                autoFillPaths(true);
                saveSettingsSilent();
                finish(null);
            } else {
                finish("Setup exited with code " + code + ". You can also run setup\\setup.ps1 manually.");
            }
        });

        function finish(err) {
            setupRunning = false;
            hide(prog);
            btn.disabled = false;
            btn.textContent = "Download engine";
            if (err) { log(err, "err"); return; }
            log("Engine installed. TikTalk is ready — let's get this bread.", "ok");
            checkEngine();
        }
    }

    // ---- load the ExtendScript host ---------------------------------------
    function loadHost() {
        var jsx = (extPath + "/jsx/host.jsx").replace(/\\/g, "/");
        cs.evalScript('$.evalFile("' + jsx + '")', function (r) {
            // r is empty on success
        });
    }

    // ---- font picker -------------------------------------------------------
    var FONTS = [];            // [{ps, family, style}]
    var fontDrop = $("fontDrop");
    var fontSearch = $("fontSearch");

    function setFont(ps, labelText) {
        $("fontName").value = ps;
        $("fontPS").textContent = ps;
        localStorage.setItem("tt_fontPS", ps);
        if (labelText) {
            fontSearch.value = labelText;
            localStorage.setItem("tt_fontLabel", labelText);
        }
    }

    function fontsFromCache() {
        try {
            var raw = localStorage.getItem("tt_fonts");
            if (raw) FONTS = JSON.parse(raw) || [];
        } catch (e) { FONTS = []; }
    }

    function fetchFonts(cb, forced) {
        cs.evalScript("TT_getFonts()", function (res) {
            if (!res || res.indexOf("ERROR:") === 0) {
                if (forced) log(res ? res.replace("ERROR:", "") : "No response from AE.", "err");
                if (cb) cb(false);
                return;
            }
            try {
                var list = JSON.parse(res);
                // sort by family then style, dedupe by PostScript name
                var seen = {};
                FONTS = list.filter(function (f) {
                    if (!f.ps || seen[f.ps]) return false;
                    seen[f.ps] = 1;
                    return true;
                }).sort(function (a, b) {
                    var fa = (a.family || a.ps).toLowerCase(), fb = (b.family || b.ps).toLowerCase();
                    if (fa !== fb) return fa < fb ? -1 : 1;
                    return (a.style || "").toLowerCase() < (b.style || "").toLowerCase() ? -1 : 1;
                });
                localStorage.setItem("tt_fonts", JSON.stringify(FONTS));
                if (forced) log(FONTS.length + " fonts loaded from After Effects.", "ok");
                if (cb) cb(true);
            } catch (e) {
                if (forced) log("Could not parse the font list: " + e.message, "err");
                if (cb) cb(false);
            }
        });
    }

    var MAX_FONT_ITEMS = 250;  // keep the dropdown snappy; search narrows it down

    function renderFontList(filter) {
        fontDrop.innerHTML = "";
        var q = (filter || "").toLowerCase().trim();
        var shown = 0;
        for (var i = 0; i < FONTS.length && shown < MAX_FONT_ITEMS; i++) {
            var f = FONTS[i];
            var hay = (f.family + " " + f.style + " " + f.ps).toLowerCase();
            if (q && hay.indexOf(q) === -1) continue;
            var item = document.createElement("div");
            item.className = "font-item";
            // preview each entry in its own typeface (Chromium sees OS fonts by family name)
            item.style.fontFamily = '"' + f.family + '", "Segoe UI", sans-serif';
            item.textContent = f.family;
            if (f.style && f.style.toLowerCase() !== "regular") {
                var st = document.createElement("span");
                st.className = "style";
                st.textContent = f.style;
                item.appendChild(st);
            }
            item.setAttribute("data-ps", f.ps);
            item.setAttribute("data-label", f.family + (f.style ? " " + f.style : ""));
            fontDrop.appendChild(item);
            shown++;
        }
        if (!shown) {
            var empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = FONTS.length
                ? "No match — keep typing, or paste a PostScript name and press Enter."
                : "No font list yet — click ↻ to load it from After Effects.";
            fontDrop.appendChild(empty);
        }
        show(fontDrop);
    }

    function initFontPicker() {
        fontsFromCache();
        var savedPS = localStorage.getItem("tt_fontPS");
        var savedLabel = localStorage.getItem("tt_fontLabel");
        if (savedPS) {
            $("fontName").value = savedPS;
            $("fontPS").textContent = savedPS;
            if (savedLabel) fontSearch.value = savedLabel;
        }
        if (!FONTS.length) fetchFonts(null, false);   // warm the cache quietly

        fontSearch.addEventListener("focus", function () {
            fontSearch.select();
            if (!FONTS.length) fetchFonts(function () { renderFontList(""); }, false);
            else renderFontList("");
        });
        fontSearch.addEventListener("input", function () {
            renderFontList(fontSearch.value);
        });
        fontSearch.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
                var first = fontDrop.querySelector(".font-item");
                if (first) {
                    setFont(first.getAttribute("data-ps"), first.getAttribute("data-label"));
                } else if (fontSearch.value.trim()) {
                    // power-user escape hatch: treat the text as a raw PostScript name
                    setFont(fontSearch.value.trim(), fontSearch.value.trim());
                }
                hide(fontDrop);
                fontSearch.blur();
            } else if (ev.key === "Escape") {
                hide(fontDrop);
            }
        });
        // mousedown (not click) so it fires before the input's blur
        fontDrop.addEventListener("mousedown", function (ev) {
            var item = ev.target.closest(".font-item");
            if (!item) return;
            ev.preventDefault();
            setFont(item.getAttribute("data-ps"), item.getAttribute("data-label"));
            hide(fontDrop);
        });
        fontSearch.addEventListener("blur", function () {
            setTimeout(function () { hide(fontDrop); }, 150);
        });
        $("fontRefresh").addEventListener("click", function () {
            log("Reloading fonts from After Effects…");
            fetchFonts(function (ok) { if (ok) renderFontList(fontSearch.value); }, true);
        });
    }

    // ---- collapsible cards --------------------------------------------------
    function initCollapsibles() {
        var cards = document.querySelectorAll(".card[data-collapse]");
        Array.prototype.forEach.call(cards, function (card) {
            var key = "tt_fold_" + card.getAttribute("data-collapse");
            if (localStorage.getItem(key) === "1") card.classList.add("collapsed");
            card.querySelector(".card-head").addEventListener("click", function () {
                card.classList.toggle("collapsed");
                localStorage.setItem(key, card.classList.contains("collapsed") ? "1" : "0");
            });
        });
    }

    // ---- state ------------------------------------------------------------
    var sourceFile = null;     // absolute path of selected layer source
    var layerOffset = 0;       // comp-time offset (layer.startTime) in seconds

    // ---- 1. detect selected layer -----------------------------------------
    function detectSource() {
        cs.evalScript("getSelectedAudioSource()", function (res) {
            if (!res || res.indexOf("ERROR:") === 0) {
                $("sourceInfo").textContent = res ? res.replace("ERROR:", "") : "No response from After Effects.";
                $("sourceInfo").style.color = "var(--err)";
                sourceFile = null;
                $("transcribeBtn").disabled = true;
                return;
            }
            var parts = res.split("\n");
            sourceFile = parts[0];
            layerOffset = parseFloat(parts[1]) || 0;
            $("sourceInfo").style.color = "var(--ok)";
            $("sourceInfo").textContent = "Source: " + sourceFile +
                "\nComp offset: " + layerOffset.toFixed(3) + "s";
            $("transcribeBtn").disabled = !hasNode;
        });
    }

    // ---- progress UI ------------------------------------------------------
    var prog = $("progress");
    function progStart(label, indefinite) {
        show(prog);
        prog.classList.toggle("indef", !!indefinite);
        prog.querySelector(".bar").style.width = indefinite ? "" : "0%";
        prog.querySelector("span").textContent = label || "";
    }
    function progSet(pct, label) {
        prog.classList.remove("indef");
        prog.querySelector(".bar").style.width = Math.max(0, Math.min(100, pct)) + "%";
        if (label) prog.querySelector("span").textContent = label;
    }
    function progDone() { hide(prog); }

    // ---- 1b. transcribe ----------------------------------------------------
    function transcribe() {
        if (!hasNode) { log("Node.js is not enabled in this panel.", "err"); return; }
        if (!sourceFile) { log("Pick a source layer first.", "err"); return; }

        var whisper = $("whisperPath").value.trim();
        var model = $("modelPath").value.trim();
        var ffmpeg = $("ffmpegPath").value.trim();
        var lang = $("language").value.trim();

        if (!fileOk(whisper)) { log("whisper-cli not found: " + whisper, "err"); return; }
        if (!fileOk(model)) { log("Model not found: " + model, "err"); return; }
        if (!fileOk(ffmpeg)) { log("ffmpeg not found: " + ffmpeg, "err"); return; }
        if (!fileOk(sourceFile)) { log("Source file not found on disk: " + sourceFile, "err"); return; }

        clearLog();
        $("transcribeBtn").disabled = true;
        $("generateBtn").disabled = true;

        var tmp = os.tmpdir();
        var stamp = String(Date.now());
        var wav = path.join(tmp, "tt_" + stamp + ".wav");
        var outBase = path.join(tmp, "tt_" + stamp);

        // Step 1: ffmpeg -> 16kHz mono WAV
        progStart("Extracting audio (ffmpeg)…", true);
        log("ffmpeg: extracting 16 kHz mono WAV…");
        var ff = cp.spawn(ffmpeg, ["-y", "-i", sourceFile, "-ar", "16000", "-ac", "1",
            "-c:a", "pcm_s16le", wav], { windowsHide: true });
        ff.stderr.on("data", function () {/* ffmpeg is noisy; ignore */ });
        ff.on("error", function (e) { fail("ffmpeg failed to start: " + e.message); });
        ff.on("close", function (code) {
            if (code !== 0 || !fileOk(wav)) { return fail("ffmpeg exited with code " + code); }
            runWhisper(whisper, model, wav, outBase, lang);
        });

        function runWhisper(whisper, model, wav, outBase, lang) {
            progStart("Transcribing (whisper)…", false);
            log("whisper: transcribing…");
            var args = ["-m", model, "-f", wav, "-oj", "-of", outBase,
                "--max-len", "1", "--split-on-word", "--print-progress"];
            if (lang && lang.toLowerCase() !== "auto") { args.push("-l", lang); }

            var w = cp.spawn(whisper, args, { windowsHide: true });
            var errBuf = "";
            w.stderr.on("data", function (d) {
                var s = d.toString();
                errBuf += s;
                var m = s.match(/progress\s*=\s*(\d+)%/);
                if (m) progSet(parseInt(m[1], 10), "Transcribing… " + m[1] + "%");
            });
            w.stdout.on("data", function () {/* json goes to file */ });
            w.on("error", function (e) { fail("whisper failed to start: " + e.message); });
            w.on("close", function (code) {
                var jsonPath = outBase + ".json";
                if (!fileOk(jsonPath)) {
                    return fail("whisper produced no output (code " + code + ").\n" +
                        errBuf.split("\n").slice(-6).join("\n"));
                }
                var words;
                try { words = readWhisperWords(jsonPath); }
                catch (e) { cleanup([wav, jsonPath]); return fail("Could not parse whisper JSON: " + e.message); }
                if (!words.length) { cleanup([wav, jsonPath]); return fail("whisper returned no words."); }

                if ($("snapAudio").checked) {
                    progStart("Detecting speech onsets (ffmpeg)…", true);
                    detectSilences(ffmpeg, wav, function (sils) {
                        var snapped = sils ? snapWords(words, sils) : 0;
                        finishTranscript(words, snapped, sils);
                        cleanup([wav, jsonPath]);
                    });
                } else {
                    finishTranscript(words, 0, null);
                    cleanup([wav, jsonPath]);
                }
            });
        }

        function finishTranscript(words, snapped, sils) {
            var lines = [];
            for (var i = 0; i < words.length; i++) {
                lines.push(words[i].start.toFixed(3) + "\t" + words[i].end.toFixed(3) + "\t" + words[i].text);
            }
            $("transcript").value = lines.join("\n");
            $("offset").value = (layerOffset || 0).toFixed(3);
            progDone();
            var msg = "Transcribed " + words.length + " words.";
            if (sils) msg += " Snapped " + snapped + " word timing(s) to " + sils.length + " detected silence region(s).";
            else if ($("snapAudio").checked) msg += " (Speech detection found no silences.)";
            log(msg, "ok");
            $("transcribeBtn").disabled = false;
            $("generateBtn").disabled = false;
        }

        function fail(msg) {
            progDone();
            log(msg, "err");
            $("transcribeBtn").disabled = false;
        }
    }

    function cleanup(files) {
        files.forEach(function (f) { try { fs.unlinkSync(f); } catch (e) {} });
    }
    function fileOk(p) {
        if (!p) return false;
        try { return fs.existsSync(p); } catch (e) { return false; }
    }

    // ---- read whisper word list (file-relative seconds) -------------------
    function readWhisperWords(jsonPath) {
        var data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        var segs = data.transcription || [];
        var words = [];
        segs.forEach(function (s) {
            var txt = (s.text || "").trim();
            if (!txt) return;
            var from = (s.offsets && s.offsets.from != null) ? s.offsets.from / 1000 : 0;
            var to = (s.offsets && s.offsets.to != null) ? s.offsets.to / 1000 : from + 0.3;
            words.push({ start: from, end: to, text: txt });
        });
        return words;
    }

    // ---- detect speech/silence boundaries from the actual waveform --------
    // Runs ffmpeg's silencedetect and returns [{start,end}, ...] silence regions.
    function detectSilences(ffmpeg, wav, cb) {
        var db = parseFloat($("silenceDb").value); if (isNaN(db)) db = -30;
        var mind = parseFloat($("silenceMin").value); if (isNaN(mind)) mind = 0.12;
        var p = cp.spawn(ffmpeg, ["-i", wav, "-af",
            "silencedetect=noise=" + db + "dB:d=" + mind, "-f", "null", "-"], { windowsHide: true });
        var buf = "";
        p.stderr.on("data", function (d) { buf += d.toString(); });
        p.on("error", function () { cb(null); });
        p.on("close", function () {
            var starts = [], ends = [], m;
            var reS = /silence_start:\s*(-?[\d.]+)/g, reE = /silence_end:\s*(-?[\d.]+)/g;
            while ((m = reS.exec(buf)) !== null) starts.push(parseFloat(m[1]));
            while ((m = reE.exec(buf)) !== null) ends.push(parseFloat(m[1]));
            var sils = [];
            for (var i = 0; i < starts.length; i++) {
                sils.push({ start: Math.max(0, starts[i]), end: (i < ends.length ? ends[i] : Infinity) });
            }
            cb(sils);
        });
    }

    // ---- snap word timings to the detected audio -------------------------
    // Start: if it falls inside a silence, push to that silence's end (speech onset).
    // End:   clamp to the next silence start after the word's start (real speech offset).
    function snapWords(words, sils) {
        var changed = 0;
        function silenceAt(t) {
            for (var i = 0; i < sils.length; i++) {
                if (t >= sils[i].start - 0.001 && t < sils[i].end) return sils[i];
            }
            return null;
        }
        function nextSilenceStart(t) {
            var best = Infinity;
            for (var i = 0; i < sils.length; i++) {
                if (sils[i].start > t + 0.001 && sils[i].start < best) best = sils[i].start;
            }
            return best;
        }
        for (var i = 0; i < words.length; i++) {
            var w = words[i], s0 = w.start, e0 = w.end;
            var sil = silenceAt(w.start);
            if (sil && sil.end !== Infinity) w.start = sil.end;          // onset
            var ns = nextSilenceStart(w.start);
            if (ns < w.end) w.end = ns;                                  // offset
            if (w.end <= w.start) w.end = w.start + 0.10;                // min duration
            // keep order with previous word
            if (i > 0 && w.start < words[i - 1].start) w.start = words[i - 1].start;
            if (Math.abs(w.start - s0) > 0.012 || Math.abs(w.end - e0) > 0.012) changed++;
        }
        return changed;
    }

    // ---- parse transcript textarea ----------------------------------------
    function parseTranscript() {
        var raw = $("transcript").value.split("\n");
        var words = [];
        raw.forEach(function (ln) {
            if (!ln.trim()) return;
            // format: start \t end \t text   (tabs or multiple spaces)
            var m = ln.match(/^\s*([-\d.]+)\s+([-\d.]+)\s+(.+?)\s*$/);
            if (m) {
                words.push({ start: parseFloat(m[1]), end: parseFloat(m[2]), text: m[3] });
            } else {
                // a bare word with no timing — append after previous
                var prevEnd = words.length ? words[words.length - 1].end : 0;
                words.push({ start: prevEnd, end: prevEnd + 0.4, text: ln.trim() });
            }
        });
        return words;
    }

    // ---- color helper -----------------------------------------------------
    function hexToRgb(hex) {
        var h = hex.replace("#", "");
        return [parseInt(h.substr(0, 2), 16) / 255,
                parseInt(h.substr(2, 2), 16) / 255,
                parseInt(h.substr(4, 2), 16) / 255];
    }

    // ---- 4. generate titles -----------------------------------------------
    function generate() {
        var words = parseTranscript();
        if (!words.length) { log("No words to generate. Transcribe or type captions first.", "err"); return; }

        var cfg = {
            words: words,
            wordsPerLine: parseInt($("wordsPerLine").value, 10) || 3,
            preset: $("preset").value,
            fontSize: parseFloat($("fontSize").value) || 120,
            strokeWidth: parseFloat($("strokeWidth").value) || 0,
            fontName: $("fontName").value.trim() || "Arial-BoldMT",
            fillColor: hexToRgb($("fillColor").value),
            strokeColor: hexToRgb($("strokeColor").value),
            accentColor: hexToRgb($("accentColor").value),
            posX: parseFloat($("posX").value),
            posY: parseFloat($("posY").value),
            allCaps: $("allCaps").checked,
            customExpr: $("customExpr").value,
            singleLayer: $("singleLayer").checked,
            fitMargin: (parseFloat($("fitMargin").value) || 90) / 100,
            maxGap: (isNaN(parseFloat($("maxGap").value)) ? 0.6 : parseFloat($("maxGap").value)),
            maxDur: parseFloat($("maxDur").value) || 5,
            revealMode: $("revealMode").value,
            linger: (isNaN(parseFloat($("linger").value)) ? 0.15 : parseFloat($("linger").value)),
            maxHold: (isNaN(parseFloat($("maxHold").value)) ? 1.2 : parseFloat($("maxHold").value)),
            offset: (isNaN(parseFloat($("offset").value)) ? 0 : parseFloat($("offset").value)),
            replace: $("replace").checked
        };

        var json = JSON.stringify(cfg);
        var script = "buildTitles(" + JSON.stringify(json) + ")";
        log("Generating " + words.length + " words → " +
            (cfg.singleLayer ? "single layer (hold keyframes)" : cfg.preset) + "…");
        cs.evalScript(script, function (res) {
            if (res && res.indexOf("ERROR:") === 0) {
                log(res.replace("ERROR:", ""), "err");
            } else {
                log(res || "Done.", "ok");
            }
        });
    }

    // ---- wire up ----------------------------------------------------------
    function init() {
        loadHost();
        loadSettings();
        initCollapsibles();
        initFontPicker();

        // If paths were never set, default them to bin/ automatically and persist.
        if (hasNode && !$("whisperPath").value.trim()) {
            autoFillPaths(true);
            saveSettingsSilent();
        }
        checkEngine();
        if (hasNode && engineReady()) {
            log("Engine ready. Select a layer and hit Transcribe.", "ok");
        }

        $("settingsToggle").addEventListener("click", function () {
            $("settings").classList.toggle("hidden");
        });
        $("saveSettings").addEventListener("click", saveSettings);
        $("autoDetectPaths").addEventListener("click", autoFillPaths);
        $("setupBtn").addEventListener("click", runEngineSetup);
        $("detectBtn").addEventListener("click", detectSource);
        $("transcribeBtn").addEventListener("click", transcribe);
        $("generateBtn").addEventListener("click", generate);

        $("grabOffsetBtn").addEventListener("click", function () {
            cs.evalScript("getSelectedLayerOffset()", function (r) {
                if (r && r.indexOf("ERROR:") === 0) { log(r.replace("ERROR:", ""), "err"); return; }
                var v = parseFloat(r);
                if (!isNaN(v)) { $("offset").value = v.toFixed(3); log("Offset set to " + v.toFixed(3) + "s.", "ok"); }
            });
        });
        function nudge(dir) {
            cs.evalScript("getCompFps()", function (r) {
                var fps = parseFloat(r);
                if (isNaN(fps) || fps <= 0) fps = 30;
                var cur = parseFloat($("offset").value) || 0;
                $("offset").value = (cur + dir / fps).toFixed(3);
            });
        }
        $("nudgeMinus").addEventListener("click", function () { nudge(-1); });
        $("nudgePlus").addEventListener("click", function () { nudge(1); });

        // captions present? allow generate even without transcribing
        $("transcript").addEventListener("input", function () {
            $("generateBtn").disabled = $("transcript").value.trim().length === 0;
        });

        if (!hasNode) {
            log("Warning: Node.js not enabled — transcription disabled. " +
                "You can still type captions and generate titles.", "err");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
