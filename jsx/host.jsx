/**********************************************************************
 * TikTalk - ExtendScript host
 * Exposes functions called from the CEP panel:
 *   getSelectedAudioSource()  -> "<fsName>\n<startTime>"  or "ERROR:..."
 *   buildTitles(jsonString)   -> "Created N layer(s)..."  or "ERROR:..."
 *   TT_getFonts()             -> JSON array of installed fonts or "ERROR:..."
 * ExtendScript is ES3 — no forEach/let/const, no native JSON. Keep it plain.
 *********************************************************************/

var CAPTION_TAG = "TT_CAPTION";        // layer.comment marker so we can replace old captions
var CAPTION_TAG_LEGACY = "PT_CAPTION"; // pre-rebrand marker, still cleaned up

function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }

/* Remove caption layers from a previous generate (tagged via layer.comment). */
function removeOldCaptions(comp) {
    for (var i = comp.numLayers; i >= 1; i--) {
        var L = comp.layer(i);
        try { if (L.comment === CAPTION_TAG || L.comment === CAPTION_TAG_LEGACY) L.remove(); } catch (e) {}
    }
}

function esc(s) {
    s = String(s);
    s = s.replace(/\\/g, "\\\\");
    s = s.replace(/"/g, '\\"');
    s = s.replace(/\n/g, "\\n");
    return s;
}

/* ---------------------------------------------------------------- */
/* 1. Read the source file of the selected layer                    */
/* ---------------------------------------------------------------- */
function getSelectedAudioSource() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return "ERROR:Open a composition and select a layer.";
        }
        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) {
            return "ERROR:Select an audio or video layer in the comp.";
        }
        var layer = sel[0];
        if (!layer.source || !(layer.source instanceof FootageItem) ||
            !layer.source.mainSource || !layer.source.mainSource.file) {
            return "ERROR:Selected layer has no source file (solid/text layers can't be transcribed).";
        }
        var f = layer.source.mainSource.file;
        return f.fsName + "\n" + layer.startTime;
    } catch (e) {
        return "ERROR:" + e.toString();
    }
}

/* Active comp frame rate (for frame-accurate nudging). */
function getCompFps() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "ERROR:no comp";
        return String(comp.frameRate);
    } catch (e) { return "ERROR:" + e.toString(); }
}

/* Comp-time position where the selected layer's source starts (file time 0). */
function getSelectedLayerOffset() {
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "ERROR:Open a composition.";
        var sel = comp.selectedLayers;
        if (!sel || sel.length === 0) return "ERROR:Select the audio/video layer.";
        return String(sel[0].startTime);
    } catch (e) {
        return "ERROR:" + e.toString();
    }
}

/* ---------------------------------------------------------------- */
/* Expression library                                               */
/* ---------------------------------------------------------------- */
var SPRING_SCALE =
    "f=3.0; d=6.0; t=time-inPoint;\n" +
    "if (t<0){ [0,0] } else { s=100-100*Math.exp(-d*t)*Math.cos(f*2*Math.PI*t); [s,s]; }";

var REVEAL_OP = "t=time-inPoint; linear(t,0,0.1,0,100)";

var BOUNCE_POS =
    "t=time-inPoint;\n" +
    "if (t<0){ value } else {\n" +
    "  d=6.0; f=2.0; o=Math.exp(-d*t)*Math.cos(f*2*Math.PI*t);\n" +
    "  [value[0], value[1]-160*o];\n}";

function typewriterExpr(full) {
    return 'full="' + esc(full) + '"; t=time-inPoint; cps=22; n=Math.floor(t*cps);\n' +
        '(t<0)?"":full.substr(0,Math.max(0,n));';
}

function karaokeScale(ws, we) {
    return "ws=" + ws + "; we=" + we + "; m=0.09;\n" +
        "a=clamp((time-ws)/m,0,1); b=clamp((we-time)/m,0,1);\n" +
        "k=Math.min(a,b); s=100+26*k; [s,s];";
}

function karaokeColor(ws, we, cfg) {
    var acc = "[" + cfg.accentColor[0] + "," + cfg.accentColor[1] + "," + cfg.accentColor[2] + ",1]";
    var base = "[" + cfg.fillColor[0] + "," + cfg.fillColor[1] + "," + cfg.fillColor[2] + ",1]";
    return "ws=" + ws + "; we=" + we + ";\nacc=" + acc + "; base=" + base + ";\n" +
        "(time>=ws && time<=we)? acc : base;";
}

/* Single-layer mode: auto-center the anchor to whatever text is shown. */
var ANCHOR_CENTER =
    "r = thisLayer.sourceRectAtTime(time, false);\n" +
    "[r.left + r.width/2, r.top + r.height/2]";

/* Single-layer mode: shrink to stay inside the frame, punch on each word change. */
function fitPunchScale(margin) {
    return "r = thisLayer.sourceRectAtTime(time, false);\n" +
        "maxW = thisComp.width * " + margin + ";\n" +
        "maxH = thisComp.height * " + margin + ";\n" +
        "fitW = (r.width  > 0) ? maxW / r.width  * 100 : 100;\n" +
        "fitH = (r.height > 0) ? maxH / r.height * 100 : 100;\n" +
        "fit = Math.min(100, fitW, fitH);\n" +
        "src = thisLayer.text.sourceText;\n" +
        "n = 0;\n" +
        "if (src.numKeys > 0){ n = src.nearestKey(time).index; if (src.key(n).time > time) n--; }\n" +
        "pop = 1;\n" +
        "if (n > 0){ var tt = time - src.key(n).time; pop = 1 + 0.22*Math.exp(-7.0*tt)*Math.cos(3.5*2*Math.PI*tt); }\n" +
        "var s = fit * pop;\n[s, s]";
}

/* ---------------------------------------------------------------- */
/* Single text layer with HOLD keyframes (no overlapping layers)    */
/* ---------------------------------------------------------------- */
function buildSingleLayer(comp, groups, cfg) {
    var layer = comp.layers.addText(" ");
    layer.name = "Captions";
    styleDoc(layer, cfg);

    var tp = layer.property("Source Text");
    layer.property("Position").setValue([comp.width * cfg.posX / 100, comp.height * cfg.posY / 100]);
    layer.property("Anchor Point").expression = ANCHOR_CENTER;
    layer.property("Scale").expression =
        (cfg.customExpr && trim(cfg.customExpr).length) ? cfg.customExpr : fitPunchScale(cfg.fitMargin || 0.9);

    var mode = cfg.revealMode || "phrase";
    // How long the caption lingers after its last word before a silence keyframe.
    var linger = (cfg.linger != null) ? cfg.linger : 0.15;
    // Whisper inflates a word's end to fill trailing silence; cap how long the
    // last word may stay on screen so silence is shown instead of a frozen word.
    var maxHold = (cfg.maxHold != null) ? cfg.maxHold : 1.2;

    layer.comment = CAPTION_TAG;

    function setText(t, when) { var td = tp.value; td.text = (cfg.allCaps ? t.toUpperCase() : t); tp.setValueAtTime(when, td); }

    // Blank keyframe before the first word so nothing shows until it's spoken
    // (HOLD would otherwise bleed the first caption backward to time 0).
    var firstStart = groups[0].start;
    if (firstStart > 0.0005) { setText("", 0); }

    for (var i = 0; i < groups.length; i++) {
        var g = groups[i];

        if (mode === "phrase") {
            // whole caption appears at the first word's spoken time
            setText(g.text, g.start);
        } else {
            // a keyframe at EACH word's real timestamp
            var acc = "";
            for (var j = 0; j < g.words.length; j++) {
                var wt = g.words[j].text;
                acc = (mode === "oneword") ? wt : ((j ? acc + " " : "") + wt);  // replace vs build up
                setText(acc, g.words[j].start);
            }
        }

        // Silence keyframe: clamp the last word's on-screen end so an inflated
        // (silence-padded) duration doesn't freeze the word. Skip only when the
        // next caption truly follows immediately.
        var lastW = g.words[g.words.length - 1];
        var cappedEnd = Math.min(g.end, lastW.start + maxHold);
        var nextStart = (i < groups.length - 1) ? groups[i + 1].start : Number.MAX_VALUE;
        var clearAt = cappedEnd + linger;
        if (clearAt < nextStart - 0.0005) {
            setText("", clearAt);
        }
    }

    // Make every Source Text keyframe a HOLD so the text snaps, never blends.
    var nk = tp.numKeys;
    for (var k = 1; k <= nk; k++) {
        tp.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
    }

    // Keep the layer present from comp start; the blank keyframe handles the lead-in.
    layer.inPoint = 0;
    layer.outPoint = groups[groups.length - 1].end + 0.5;
    return 1;
}

/* ---------------------------------------------------------------- */
/* Layer helpers                                                    */
/* ---------------------------------------------------------------- */
function styleDoc(layer, cfg) {
    var tp = layer.property("Source Text");
    var td = tp.value;
    td.resetCharStyle();
    td.fontSize = cfg.fontSize;
    try { if (cfg.fontName) td.font = cfg.fontName; } catch (e) {}
    td.applyFill = true;
    td.fillColor = cfg.fillColor;
    td.applyStroke = cfg.strokeWidth > 0;
    if (cfg.strokeWidth > 0) {
        td.strokeColor = cfg.strokeColor;
        td.strokeWidth = cfg.strokeWidth;
        td.strokeOverFill = false;
    }
    td.justification = ParagraphJustification.CENTER_JUSTIFY;
    tp.setValue(td);
}

function setTiming(layer, start, end) {
    var tail = 0.3;
    // Set outPoint first so inPoint never temporarily exceeds it.
    layer.outPoint = end + tail;
    layer.inPoint = start;
}

function centerAnchor(layer, comp, cfg, atTime) {
    var r = layer.sourceRectAtTime(atTime, false);
    layer.property("Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
    layer.property("Position").setValue([comp.width * cfg.posX / 100, comp.height * cfg.posY / 100]);
    return r;
}

/* ---------------------------------------------------------------- */
/* Grouping — audio-aware: break captions on pauses, sentence ends, */
/* a max word count, or a max duration. This keeps the text in sync */
/* with the actual speech instead of chopping every N words.        */
/* ---------------------------------------------------------------- */
function endsSentence(t) { return /[.?!]["')\]]?\s*$/.test(String(t)); }

function segToGroup(seg) {
    var txt = "";
    for (var k = 0; k < seg.length; k++) txt += (k ? " " : "") + seg[k].text;
    return { words: seg, start: seg[0].start, end: seg[seg.length - 1].end, text: txt };
}

function groupWords(words, cfg) {
    // wordbyword preset (multi-layer mode only) = always one word per layer.
    if (cfg.preset === "wordbyword" && !cfg.singleLayer) {
        var one = [];
        for (var i = 0; i < words.length; i++) one.push(segToGroup([words[i]]));
        return one;
    }

    var maxWords = Math.max(1, cfg.wordsPerLine || 4);
    var maxGap = (cfg.maxGap != null) ? cfg.maxGap : 0.6;   // pause that starts a new caption
    var maxDur = (cfg.maxDur != null) ? cfg.maxDur : 5;     // hard cap on a caption's length

    var groups = [], cur = [];
    for (var w = 0; w < words.length; w++) {
        var word = words[w];
        if (cur.length === 0) { cur.push(word); continue; }

        var prev = cur[cur.length - 1];
        var gap = word.start - prev.end;
        var dur = word.end - cur[0].start;

        if (gap > maxGap || cur.length >= maxWords || dur > maxDur || endsSentence(prev.text)) {
            groups.push(segToGroup(cur));
            cur = [word];
        } else {
            cur.push(word);
        }
    }
    if (cur.length) groups.push(segToGroup(cur));
    return groups;
}

/* ---------------------------------------------------------------- */
/* Builders                                                         */
/* ---------------------------------------------------------------- */
function applyPreset(layer, cfg, g) {
    var scale = layer.property("Scale");
    var opacity = layer.property("Opacity");
    var pos = layer.property("Position");
    var src = layer.property("Source Text");

    if (cfg.preset === "popin" || cfg.preset === "wordbyword") {
        scale.expression = SPRING_SCALE;
        opacity.expression = REVEAL_OP;
    } else if (cfg.preset === "bounce") {
        pos.expression = BOUNCE_POS;
        opacity.expression = REVEAL_OP;
    } else if (cfg.preset === "typewriter") {
        var full = cfg.allCaps ? g.text.toUpperCase() : g.text;
        src.expression = typewriterExpr(full);
    }

    if (cfg.customExpr && trim(cfg.customExpr).length) {
        scale.expression = cfg.customExpr;   // user override wins
    }
}

function buildGroup(comp, g, cfg) {
    var text = cfg.allCaps ? g.text.toUpperCase() : g.text;
    var layer = comp.layers.addText(text);
    layer.name = text.substr(0, 28);
    layer.comment = CAPTION_TAG;
    styleDoc(layer, cfg);
    setTiming(layer, g.start, g.end);
    centerAnchor(layer, comp, cfg, g.start + 0.05);
    applyPreset(layer, cfg, g);
    return 1;
}

function buildKaraoke(comp, g, cfg) {
    var n = g.words.length;
    var space = cfg.fontSize * 0.32;
    var layers = [], widths = [], rects = [], total = 0;

    for (var i = 0; i < n; i++) {
        var t = cfg.allCaps ? g.words[i].text.toUpperCase() : g.words[i].text;
        var L = comp.layers.addText(t);
        L.name = t.substr(0, 28);
        L.comment = CAPTION_TAG;
        styleDoc(L, cfg);
        setTiming(L, g.start, g.end);
        var r = L.sourceRectAtTime(g.start + 0.05, false);
        layers.push(L); widths.push(r.width); rects.push(r);
        total += r.width;
    }
    total += space * (n - 1);

    var cx = comp.width * cfg.posX / 100;
    var cy = comp.height * cfg.posY / 100;
    var accX = cx - total / 2;

    for (var i2 = 0; i2 < n; i2++) {
        var L2 = layers[i2], r2 = rects[i2], w = widths[i2];
        L2.property("Anchor Point").setValue([r2.left + r2.width / 2, r2.top + r2.height / 2]);
        L2.property("Position").setValue([accX + w / 2, cy]);
        accX += w + space;

        var ws = g.words[i2].start, we = g.words[i2].end;
        L2.property("Scale").expression = karaokeScale(ws, we);
        try {
            var fx = L2.property("ADBE Effect Parade").addProperty("ADBE Fill");
            fx.property("Color").expression = karaokeColor(ws, we, cfg);
        } catch (e) { /* Fill effect unavailable -> scale-only highlight */ }
    }
    return n;
}

/* ---------------------------------------------------------------- */
/* Fonts — list every font AE can see (AE 24.0+ Font API).          */
/* Returns a JSON array: [{"ps":"Arial-BoldMT","family":"Arial",    */
/* "style":"Bold"}, ...] sorted by family, or "ERROR:..." on older  */
/* AE versions (panel then falls back to manual PostScript entry).  */
/* ---------------------------------------------------------------- */
function TT_getFonts() {
    try {
        if (typeof app.fonts === "undefined" || !app.fonts || !app.fonts.allFonts) {
            return "ERROR:Font list needs After Effects 2024 (24.0) or newer — type a PostScript name instead.";
        }
        var groups = app.fonts.allFonts;   // array of font-family groups
        var out = [];
        function pushFont(f) {
            if (!f || !f.postScriptName) return;
            out.push('{"ps":"' + esc(f.postScriptName) +
                '","family":"' + esc(f.familyName || "") +
                '","style":"' + esc(f.styleName || "") + '"}');
        }
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            // allFonts returns an array of arrays (styles grouped per family),
            // but be tolerant of flat font objects too.
            if (g && typeof g.length === "number" && !g.postScriptName) {
                for (var j = 0; j < g.length; j++) pushFont(g[j]);
            } else {
                pushFont(g);
            }
        }
        if (!out.length) return "ERROR:No fonts reported by After Effects.";
        return "[" + out.join(",") + "]";
    } catch (e) {
        return "ERROR:" + e.toString();
    }
}

/* ---------------------------------------------------------------- */
/* 2. Entry point                                                   */
/* ---------------------------------------------------------------- */
function buildTitles(jsonStr) {
    var started = false;
    try {
        var cfg = eval("(" + jsonStr + ")");
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return "ERROR:Open a composition first.";
        if (!cfg.words || !cfg.words.length) return "ERROR:No words supplied.";

        // Shift every word into comp time (audio may not start at frame 0).
        var off = cfg.offset || 0;
        if (off) {
            for (var oi = 0; oi < cfg.words.length; oi++) {
                cfg.words[oi].start += off;
                cfg.words[oi].end += off;
            }
        }

        app.beginUndoGroup("TikTalk Captions");
        started = true;

        if (cfg.replace !== false) removeOldCaptions(comp);

        var groups = groupWords(cfg.words, cfg);

        if (cfg.singleLayer) {
            var made = buildSingleLayer(comp, groups, cfg);
            app.endUndoGroup();
            return "Created 1 caption layer (" + groups.length + " hold keyframes) in '" + comp.name + "'.";
        }

        var created = 0, failed = 0;
        for (var i = 0; i < groups.length; i++) {
            try {
                created += (cfg.preset === "karaoke")
                    ? buildKaraoke(comp, groups[i], cfg)
                    : buildGroup(comp, groups[i], cfg);
            } catch (ge) { failed++; }
        }

        app.endUndoGroup();
        var msg = "Created " + created + " layer(s) in '" + comp.name + "'.";
        if (failed) msg += " (" + failed + " caption(s) skipped — check timings vs comp length.)";
        return msg;
    } catch (e) {
        if (started) { try { app.endUndoGroup(); } catch (_) {} }
        return "ERROR:" + e.toString() + (e.line ? (" (line " + e.line + ")") : "");
    }
}
