# Phosphor Form: an HTML-in-Canvas demo

A live HTML form, drawn into a WebGL canvas through a CRT shader. You can still click into the fields and type.

[![Phosphor Form drawn as an amber CRT screen](docs/screenshot.png)](https://az9713.github.io/claude-html-in-canvas-demo/phosphor-form.html)

**[Open the live demo](https://az9713.github.io/claude-html-in-canvas-demo/phosphor-form.html)** · **[Read the explainer](https://az9713.github.io/claude-html-in-canvas-demo/)**

GitHub does not run scripts or iframes in a README. The screenshot above links to the live page, and the explainer page embeds the live demo.

## Inspiration

[Felix Rieseberg](https://x.com/felixrieseberg) posted on 15 November 2026: "All hail the weird web. I just enabled HTML-in-Canvas in Claude's desktop apps." He shared demos made with it and compared the feel to the Flash days. This repo is a small experiment built from that idea.

## What is HTML in Canvas?

HTML in Canvas is a proposed browser feature ([WICG proposal](https://github.com/WICG/html-in-canvas)). It lets a page draw a live HTML element into a `<canvas>` and use the result as pixels. The canvas can then draw it, warp it, or feed it to a shader.

In this demo:

| Piece of the proposal | Where it is in `docs/phosphor-form.html` |
|---|---|
| `content="drawable"` on the canvas | line 119 |
| `drawable` on the form | line 120 |
| `paint` event, `requestPaint()` | lines 293 and 298 |
| `texElementSubImage2D` (WebGL draw call) | line 273 |
| `updateElementGeometry` (hit testing) | line 290 |

The form is real DOM. The browser handles the caret, focus, radio buttons, checkboxes, range slider, and textarea. The page contains no code that draws a text field. The browser's own renderer makes the pixels, and a fragment shader (lines 200 to 236) curves them, splits the colour channels, and adds glow, scanlines, and static.

The [explainer](https://az9713.github.io/claude-html-in-canvas-demo/) covers this in full: the five pieces, a diagram of how a keystroke reaches the shader, what does not count as HTML in Canvas, and the API problems found while building it.

## Ideas and projects to build

These are ideas, not tested projects. Each one uses a capability the proposal gives: real DOM content drawn as pixels, which a shader or a 3D scene can then change. The WICG repo already has examples for some of them (`complex-text`, `pie-chart`, `nested-sparkles`, a WebGL card flip, and a WebGPU "jelly slider"). They are in its [Examples folder](https://github.com/WICG/html-in-canvas/tree/main/Examples).

**Shader-skinned interfaces** (the idea behind this demo)
- **Liquid glass and frosted panels.** Draw a settings panel as a texture, then blur and refract whatever is behind it. The controls stay real.
- **Click ripples and glitch transitions.** Distort the form around the pointer when a button is pressed.
- **Other screens.** A vector monitor, a Game Boy LCD with a pixel grid, an e-ink page that ghosts when it changes, a thermal-printer receipt.

**Real UI on 3D surfaces**
- **A working laptop or arcade cabinet in a 3D scene.** The screen is a mesh. Its texture is a live form, a chat, or a spreadsheet. Keyboard focus and `updateElementGeometry` give the clicks a place to land.
- **A book with page curl.** Each page is a drawable element with real text, links, and inputs. The curl is a vertex shader.
- **A museum room.** Each painting on the wall is an HTML card you can walk up to and use.

**Page transitions**
- **Shatter, dissolve, or fold between two pages.** Capture both pages as textures and mix them in a shader. Neither page needs to be a screenshot.

**Rich text and charts in canvas**
- **Text on a spiral, a globe, or a wave.** The browser does the shaping, so right-to-left scripts, emoji, and line breaks stay correct.
- **Charts with real HTML labels.** Multi-line, wrapped labels in a pie or Sankey chart, drawn by the canvas but laid out by CSS.

**Games**
- **Dialogue boxes, inventories, and name-entry screens** that use real inputs, and still sit inside the game's post-processing (bloom, bend, film grain).

**Export**
- **HTML to PNG or video.** Render an invoice, a certificate, or a social card as HTML, draw it to a canvas, then call `toBlob()` or record the canvas with `MediaRecorder`. An animated HTML title card becomes a video file.

**Worker rendering**
- **Heavy effects off the main thread.** The proposal lets a page pass an `ElementImage` to a worker that draws into an `OffscreenCanvas`. A particle burst over a form could then run without slowing typing.

**Accessibility experiments**
- **Canvas apps that screen readers can read.** The content is real DOM, so the accessibility tree can hold the labels. The proposal says geometry must be set (with `updateElementGeometry`) for assistive tools to place the content.

**The weird web**
- **A site that is one canvas.** A navigation you fly through, a desktop with draggable windows, a zine whose pages react to the mouse. This is the Flash-era feel that Felix Rieseberg's post described, with real links and inputs instead of a plugin.

## See the shader

The shader needs a browser with HTML-in-Canvas turned on:

- **Chrome:** open `chrome://flags/#canvas-draw-element`, set it to Enabled, and restart.
- **Claude desktop app:** Felix Rieseberg's post says the feature is enabled there. I tested only in a separate Chrome, not in the app.

Without the feature, the page shows the same form with CSS scanlines and a line of text that says so.

## Run it locally

No build step. One HTML file.

```bash
cd docs
python -m http.server 8000
```

Then open `http://localhost:8000/phosphor-form.html`.

## Files

| Path | Content |
|---|---|
| `docs/phosphor-form.html` | The demo (HTML, CSS, JavaScript, and the GLSL shader in one file) |
| `docs/index.html` | The explainer page |
| `docs/screenshot.png` | Screenshot of the shader path |

GitHub Pages serves only the `docs/` folder.

## Status and known issues

- HTML-in-Canvas is a proposal. Call names changed while this demo was built (`texElementImage2D` became `texElementSubImage2D`). The demo tries three call forms and keeps the first that works.
- Tested: Chrome 157 (headless) with `--enable-experimental-web-platform-features --enable-blink-features=CanvasDrawElement`. Typing, the curvature slider, and the shader output work there.
- Not tested: other browsers, touch input, the TRANSMIT button, the Bypass button, and the sliders other than curvature.
- One report: in the Claude desktop app viewer, the CALLSIGN field accepted only 4 letters. It did not reproduce in Chrome 157. The cause is unknown.
- At high curvature, a click near the edge can land a few pixels off the drawn target. The browser hit-tests the form at its layout position. Keyboard focus is exact.
