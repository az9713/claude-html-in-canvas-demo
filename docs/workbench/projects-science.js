(function () {
  "use strict";

  const cyan = "#69e2db";
  const orange = "#ffb56c";
  const violet = "#c1a7ff";
  const pink = "#ff819a";
  const rule = "#344654";
  const fmt = (value, digits = 3) => value && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e6) ?
    Number(value.toPrecision(digits)).toExponential() :
    new Intl.NumberFormat("en", {maximumSignificantDigits: digits}).format(value);
  const pct = value => fmt(100 * value, 4) + "%";
  const deg = value => value * Math.PI / 180;
  const sample = (min, max, size, fn) => Array.from({length: size}, (_, index) => {
    const x = min + (max - min) * index / (size - 1);
    return [x, fn(x)];
  });
  const input = (key, label, value, min, max, step, unit) =>
    ({key, label, value, min, max, step, unit, type: "number"});
  const slider = (key, label, value, min, max, step, unit) =>
    ({...input(key, label, value, min, max, step, unit), type: "range"});
  const select = (key, label, value, options) => ({key, label, value, options, type: "select"});
  const text = (key, label, value) => ({key, label, value, type: "text"});
  const area = (key, label, value) => ({key, label, value, type: "textarea"});
  const toggle = (key, label, value) => ({key, label, value, type: "checkbox"});
  const line = (x, y, x2, y2, stroke = rule) => ({type: "line", x, y, x2, y2, stroke});
  const rect = (x, y, w, h, fill, stroke) => ({type: "rect", x, y, w, h, fill, stroke});
  const note = (x, y, label, fill) => ({type: "text", x, y, label, fill});
  const mark = (key, x, y, label, detail) => ({key, x, y, label, detail});
  const series = (label, points, color, dashed = false) => ({label, points, color, dashed});
  const byKind = (sources, kind) => (sources || []).filter(source => source.kind === kind);

  function parseXY(rows) {
    return numericPairs(String(rows).slice(0, 50000).split(/\r?\n/))
      .slice(0, 2000).sort((a, b) => a[0] - b[0]);
  }

  function numericPairs(rows) {
    return rows.map(row => {
      const columns = row.trim().split(/[,;\s]+/);
      return columns.length >= 2 && columns[0] && columns[1] ? columns.slice(0, 2).map(Number) : [];
    }).filter(row => row.length === 2 && row.every(value => Number.isFinite(value) && Math.abs(value) <= 1e100));
  }

  function interpolateTrace(points, x) {
    const upper = points.findIndex(point => point[0] >= x);
    if (upper < 0) return null;
    if (points[upper][0] === x) return points[upper][1];
    if (upper === 0) return null;
    const [x0, y0] = points[upper - 1];
    const [x1, y1] = points[upper];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }

  const paperFigures = {
    number: 2, id: "paper-figure-workbench", title: "Paper figure workbench",
    summary: "Record a claim, inference, and test against the same part of an imported figure.",
    guide: "Import up to two local images. Use the wipe to compare images framed to the same axes. For a quantitative comparison, switch to trace mode and paste x,y pairs or import CSV files with two numeric columns.",
    fields: [
      select("view", "View", "Digitized traces", ["Digitized traces", "Image wipe", "Side by side", "Difference"]),
      slider("wipe", "Wipe position", 52, 0, 100, 1, "%"),
      text("page", "Source and page", "Example figure · p. 4"),
      slider("pinX", "Pin horizontal position", 53, 0, 100, 1, "%"),
      slider("pinY", "Pin vertical position in image", 42, 0, 100, 1, "%"),
      area("claim", "Author’s claim", "The response levels off once the input exceeds 4 units."),
      area("inference", "Your inference", "A limited measurement range could also produce the plateau."),
      area("test", "Discriminating test", "Repeat the sweep with a higher-range detector."),
      area("traceA", "Figure trace · x,y", "0,0\n1,0.42\n2,0.69\n3,0.86\n4,0.95\n5,0.97\n6,0.99"),
      area("traceB", "Comparison trace · x,y", "0,0\n1,0.40\n2,0.70\n3,0.85\n4,0.97\n5,1.06\n6,1.12")
    ],
    run(values, sources) {
      const images = byKind(sources, "image");
      const files = byKind(sources, "text");
      const details = [
        "Claim — " + values.claim,
        "Inference — " + values.inference,
        "Discriminating test — " + values.test
      ];
      const baseResult = {
        summary: values.page || "Figure review",
        details,
        metrics: [["Imported images", Math.min(2, images.length)]]
      };
      if (values.view === "Digitized traces" || !images.length) {
        const sourceTrace = parseXY(files[0]?.text || values.traceA);
        const comparison = parseXY(files[1]?.text || values.traceB);
        const probe = sourceTrace.length ? sourceTrace[0][0] +
          (sourceTrace[sourceTrace.length - 1][0] - sourceTrace[0][0]) * values.pinX / 100 : null;
        const selected = sourceTrace.reduce((best, point) => !best ||
          Math.abs(point[0] - probe) < Math.abs(best[0] - probe) ? point : best, null);
        baseResult.metrics = [["Source points", sourceTrace.length], ["Comparison points", comparison.length]];
        if (selected) {
          const comparisonY = interpolateTrace(comparison, selected[0]);
          if (comparisonY !== null) {
            baseResult.metrics.push(["Comparison minus source", fmt(comparisonY - selected[1], 4)]);
          }
        }
        if (values.view !== "Digitized traces") baseResult.details.push("Import a local image to use the selected image view.");
        baseResult.scene = {
          kind: "plot", xLabel: "Input", yLabel: "Response",
          series: [series("Source trace", sourceTrace, cyan), series("Comparison trace", comparison, orange)],
          markers: selected ? [mark("figure-claim", ...selected, "Evidence", values.claim)] : []
        };
        return baseResult;
      }
      const modes = {"Image wipe": "wipe", "Side by side": "split", "Difference": "difference"};
      baseResult.scene = {
        kind: "compare", left: images[0]?.id, right: images[1]?.id, position: values.wipe,
        mode: modes[values.view], leftLabel: "Source figure", rightLabel: "Comparison",
        markers: [mark("figure-claim", values.pinX, values.pinY, "Evidence", values.claim)]
      };
      return baseResult;
    }
  };

  function scoreAnswer(answer, prefix, values, file) {
    return {
      answer: file?.text || answer,
      firstToken: values[prefix + "first"],
      total: values[prefix + "total"],
      correctness: values[prefix + "correctness"],
      explanation: values[prefix + "explanation"]
    };
  }

  const modelEvaluation = {
    number: 3, id: "local-model-evaluation", title: "Local model evaluation workbench",
    summary: "Blind-review two existing answers against a common rubric and record where they diverge.",
    guide: "Paste model answers or import two local text files. Score correctness and explanation separately, enter timings from the run logs, and save a reusable evaluation case.",
    fields: [
      text("prompt", "Evaluation prompt", "What is the sum of the first 20 positive odd integers?"),
      area("rubric", "Rubric", "The answer is 400. Derive the result or explain why the sum is 20²."),
      text("nameA", "First run label", "Run A"), text("nameB", "Second run label", "Run B"),
      area("answerA", "First answer", "Pair terms 1 + 39 = 40, 3 + 37 = 40, and so on. Ten pairs sum to 400."),
      area("answerB", "Second answer", "There are 20 terms and the central term is 19, so the sum is 380."),
      input("afirst", "First run · first token", 160, 0, 100000, 1, "ms"),
      input("atotal", "First run · finished", 1020, 0, 100000, 1, "ms"),
      input("bfirst", "Second run · first token", 120, 0, 100000, 1, "ms"),
      input("btotal", "Second run · finished", 680, 0, 100000, 1, "ms"),
      slider("acorrectness", "First run · correctness", 5, 0, 5, 1, "/5"),
      slider("aexplanation", "First run · explanation", 5, 0, 5, 1, "/5"),
      slider("bcorrectness", "Second run · correctness", 1, 0, 5, 1, "/5"),
      slider("bexplanation", "Second run · explanation", 2, 0, 5, 1, "/5"),
      slider("weight", "Weight given to correctness", 70, 0, 100, 1, "%"),
      area("tools", "Tool events · A or B | ms | event", "A | 460 | Checked the first and last terms\nB | 380 | Estimated the middle term"),
      toggle("blind", "Blind review in the canvas and results", true),
      area("decision", "Reviewer’s decision", "Check the two central terms before averaging.")
    ],
    run(values, sources) {
      const files = byKind(sources, "text");
      const results = [
        scoreAnswer(values.answerA, "a", values, files[0]),
        scoreAnswer(values.answerB, "b", values, files[1])
      ];
      const labels = values.blind ? ["Answer A", "Answer B"] : [values.nameA || "Run A", values.nameB || "Run B"];
      const weight = values.weight / 100;
      const scores = results.map(run => (run.correctness * weight + run.explanation * (1 - weight)) * 20);
      const valid = results.every(run => run.firstToken <= run.total);
      const maxTime = Math.max(1, ...results.map(run => run.total), ...results.map(run => run.firstToken));
      const timeX = ms => 8 + 83 * ms / maxTime;
      const shapes = [];
      const markers = [];
      const rows = values.tools.split(/\r?\n/).map(row => row.trim()).filter(Boolean).slice(0, 12);
      const events = rows.flatMap(row => {
        const [run, rawTime, ...description] = row.split("|").map(part => part.trim());
        const index = ["A", "B"].indexOf(run.toUpperCase());
        const time = Number(rawTime);
        const label = description.join(" | ");
        return index >= 0 && rawTime && Number.isFinite(time) && time >= 0 && time <= results[index].total && label ?
          [{index, time, label}] : [];
      });
      results.forEach((run, index) => {
        const y = 33 + index * 44;
        const color = index ? orange : cyan;
        shapes.push(line(8, y, 91, y), line(8, y, timeX(run.total), y, color));
        shapes.push({type: "circle", x: timeX(run.firstToken), y, r: 1.1, fill: color});
        markers.push(mark("first-token-" + index, timeX(run.firstToken), y, labels[index] + " first token", fmt(run.firstToken) + " ms"));
        markers.push(mark("answer-" + index, timeX(run.total), y, labels[index] + " completed",
          fmt(run.total) + " ms · " + fmt(scores[index], 4) + "/100"));
      });
      events.forEach(({index, time, label}, markerIndex) => {
        const y = 33 + index * 44;
        shapes.push(line(timeX(time), y, timeX(time), y - 9, violet));
        markers.push(mark("tool-event-" + markerIndex, timeX(time), y - 9, labels[index] + " event",
          fmt(time) + " ms · " + label));
      });
      return {
        summary: valid ? "Weighted rubric difference " + fmt(scores[0] - scores[1], 4) + " points (A minus B)." :
          "Check the timing inputs. A first token occurs before or at completion.",
        metrics: labels.map((label, index) => [label + " score", fmt(scores[index], 4) + "/100"]),
        details: [
          "Prompt — " + values.prompt,
          "Rubric — " + values.rubric,
          ...results.map((run, index) => labels[index] + " — " + String(run.answer).slice(0, 4000)),
          ...events.map(({index, time, label}) => labels[index] + " at " + fmt(time) + " ms — " + label),
          ...(events.length < rows.length ? ["Tool events must use a run letter, a time within that run, and a label."] : []),
          "Decision — " + values.decision
        ],
        scene: {kind: "board", xLabel: "Elapsed time → " + fmt(maxTime) + " ms", shapes, markers}
      };
    }
  };

  function exampleMesh(neck) {
    const profile = [[-1, 0.58], [-0.88, 0.70], [0.37, 0.65], [0.73, neck], [1, neck]];
    const sides = 12;
    const vertices = profile.flatMap(([y, radius]) => Array.from({length: sides}, (_, index) => {
      const angle = index * 2 * Math.PI / sides;
      return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
    }));
    const edges = [];
    const faces = [];
    for (let row = 0; row < profile.length; row++) {
      for (let side = 0; side < sides; side++) {
        const index = row * sides + side;
        const next = row * sides + (side + 1) % sides;
        edges.push([index, next]);
        if (row) {
          edges.push([index - sides, index]);
          faces.push([index - sides, next - sides, next, index]);
        }
      }
    }
    faces.push(Array.from({length: sides}, (_, index) => index));
    faces.push(Array.from({length: sides}, (_, index) => vertices.length - sides + index));
    return {vertices, edges, faces};
  }

  function loadOBJ(text) {
    const vertices = [];
    const edges = new Map();
    const faces = [];
    for (const line of String(text).slice(0, 250000).split(/\r?\n/)) {
      const [kind, ...parts] = line.split("#")[0].trim().split(/\s+/);
      if (kind === "v" && parts.length >= 3) {
        const vertex = parts.slice(0, 3).map(Number);
        if (!vertex.every(value => Number.isFinite(value) && Math.abs(value) <= 1e12)) return null;
        vertices.push(vertex);
      }
      if ((kind === "f" || kind === "l") && parts.length >= 2 && edges.size < 6000) {
        const indexes = parts.map(part => {
          const index = Number(part.split("/")[0]);
          return index < 0 ? vertices.length + index : index - 1;
        });
        if (!indexes.every(index => Number.isInteger(index) && index >= 0 && index < vertices.length)) continue;
        if (kind === "f" && indexes.length >= 3 && faces.length < 3500) faces.push(indexes);
        const edgeCount = kind === "f" ? indexes.length : indexes.length - 1;
        for (let i = 0; i < edgeCount && edges.size < 6000; i++) {
          const edge = [indexes[i], indexes[(i + 1) % indexes.length]].sort((a, b) => a - b);
          edges.set(edge.join("/"), edge);
        }
      }
    }
    return vertices.length && edges.size ? {vertices, edges: [...edges.values()], faces} : null;
  }

  function sharedBounds(meshes) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    meshes.forEach(mesh => mesh.vertices.forEach(vertex => vertex.forEach((value, axis) => {
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    })));
    return {center: min.map((value, axis) => (value + max[axis]) / 2),
      scale: Math.max(...max.map((value, axis) => value - min[axis]), 1e-9)};
  }

  function surfacePolygons(mesh, view, toScreen, color) {
    return mesh.faces.map(face => {
      const viewVertices = face.map(index => view[index]);
      const [a, b, c] = viewVertices;
      const p = b.map((value, i) => value - a[i]);
      const q = c.map((value, i) => value - a[i]);
      const normal = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
      const size = Math.hypot(...normal);
      const facing = size ? Math.abs((0.25 * normal[0] + 0.4 * normal[1] + 0.88 * normal[2]) / size) : 0;
      const shade = 0.23 + 0.77 * facing;
      const fill = "rgb(" + color.map(channel => Math.round(channel * shade)).join(",") + ")";
      const depth = viewVertices.reduce((total, vertex) => total + vertex[2], 0) / face.length;
      return {depth, type: "polygon", points: viewVertices.map(toScreen), fill};
    }).sort((a, b) => a.depth - b.depth);
  }

  const atlasReview = {
    number: 4, id: "style-atlas-review", title: "3D Style Atlas review bench",
    summary: "Inspect two asset revisions with the same orbit, elevation, zoom, and frame.",
    guide: "Import two small OBJ meshes in the same coordinate system. Use triangulated faces for shaded views. You can also import two matching rendered stills and compare them in Image wipe mode. The example objects are generated locally.",
    fields: [
      select("view", "Comparison", "Shaded surfaces", ["Shaded surfaces", "Wireframes side by side", "Wireframe overlay", "Image wipe"]),
      slider("azimuth", "Orbit angle", 25, 0, 360, 1, "°"),
      slider("elevation", "Elevation", 15, -75, 75, 1, "°"),
      {...slider("frame", "Turntable frame", 0, 0, 119, 1, "/119"), playback: true, duration: 9},
      slider("zoom", "Camera scale", 100, 35, 135, 1, "%"),
      slider("neck", "Example revision neck radius", 0.38, 0.12, 0.65, 0.01),
      slider("wipe", "Image wipe position", 50, 0, 100, 1, "%"),
      slider("focusX", "Review pin across image", 72, 0, 100, 1, "%"),
      slider("focusY", "Review pin down image", 31, 0, 100, 1, "%"),
      area("review", "Review focus", "Compare the shoulder transition at the same turntable angle.")
    ],
    run(values, sources) {
      const images = byKind(sources, "image");
      const marker = mark("asset-review", values.focusX, values.focusY, "Review focus", values.review);
      if (values.view === "Image wipe" && images.length >= 2) {
        return {
          summary: "Compare two rendered stills registered to the same camera.",
          scene: {kind: "compare", left: images[0].id, right: images[1].id, mode: "wipe",
            position: values.wipe, leftLabel: "Baseline", rightLabel: "Revision", markers: [marker]}
        };
      }
      const files = byKind(sources, "text");
      const parsed = files.slice(0, 2).map(source => loadOBJ(source.text));
      const usesImports = parsed.length === 2 && parsed.every(Boolean);
      const meshes = usesImports ? parsed : [exampleMesh(0.25), exampleMesh(values.neck)];
      const bounds = sharedBounds(meshes);
      const yaw = deg(values.azimuth + values.frame * 3);
      const pitch = deg(values.elevation);
      const overlay = values.view === "Wireframe overlay";
      const shaded = values.view === "Shaded surfaces";
      const shapes = overlay ? [] : [line(50, 12, 50, 92)];
      const scale = values.zoom / 100 / bounds.scale;
      meshes.forEach((mesh, index) => {
        const center = overlay ? 50 : 25 + index * 50;
        const color = index ? orange : cyan;
        const view = mesh.vertices.map(vertex => {
          const [x, y, z] = vertex.map((value, axis) => (value - bounds.center[axis]) * scale);
          const u = x * Math.cos(yaw) + z * Math.sin(yaw);
          const depth = -x * Math.sin(yaw) + z * Math.cos(yaw);
          return [u, y * Math.cos(pitch) - depth * Math.sin(pitch), y * Math.sin(pitch) + depth * Math.cos(pitch)];
        });
        const toScreen = ([u, v]) => [center + u * (overlay ? 51 : 29), 54 - v * (overlay ? 84 : 48)];
        shapes.push(note(overlay ? 8 + index * 49 : center - 11, 10, index ? "Revision" : "Baseline", color));
        if (shaded && mesh.faces.length) {
          shapes.push(...surfacePolygons(mesh, view, toScreen, index ? [241, 165, 91] : [97, 217, 211]));
        } else {
          const screen = view.map(toScreen);
          mesh.edges.forEach(([a, b]) => shapes.push(line(...screen[a], ...screen[b], color)));
        }
      });
      return {
        summary: usesImports ? "Two local meshes share one orthographic camera and scale." :
          "Two example meshes share one orthographic camera and scale.",
        metrics: [["Baseline edges", meshes[0].edges.length], ["Revision edges", meshes[1].edges.length],
          ["Turntable angle", fmt((values.azimuth + values.frame * 3) % 360) + "°"]],
        details: [
          ...(files.length && !usesImports ? ["Import two readable OBJ meshes to replace the example pair."] : []),
          ...(values.view === "Image wipe" ? ["Import two local images to activate the wipe."] : []),
          ...(shaded ? ["Shading is a depth-sorted preview. Wireframe views expose edges hidden by the surface."] : [])
        ],
        scene: {kind: "board", shapes, markers: [marker]}
      };
    }
  };

  function reflectance(wavelength, layers, substrate, angle, polarization) {
    const sinIncidence = Math.sin(deg(angle));
    const indices = [1, ...layers.map(layer => layer[0]), substrate];
    const cosines = indices.map(n => Math.sqrt(1 - (sinIncidence / n) ** 2));
    const admittances = indices.map((n, i) => polarization === "s" ? n * cosines[i] : n / cosines[i]);
    const r = i => (admittances[i] - admittances[i + 1]) / (admittances[i] + admittances[i + 1]);
    let real = r(layers.length);
    let imaginary = 0;
    for (let i = layers.length - 1; i >= 0; i--) {
      const [n, thickness] = layers[i];
      const phase = 4 * Math.PI * n * cosines[i + 1] * thickness / wavelength;
      const x = real * Math.cos(phase) - imaginary * Math.sin(phase);
      const y = real * Math.sin(phase) + imaginary * Math.cos(phase);
      const left = r(i);
      const denominatorX = 1 + left * x;
      const denominatorY = left * y;
      const square = denominatorX ** 2 + denominatorY ** 2;
      real = ((left + x) * denominatorX + y * denominatorY) / square;
      imaginary = (y * denominatorX - (left + x) * denominatorY) / square;
    }
    return real ** 2 + imaginary ** 2;
  }

  const photonics = {
    number: 5, id: "photonics-design", title: "Photonics design notebook",
    summary: "Compare a lossless dielectric stack with a bare substrate and a reference thickness.",
    guide: "Use a first film and optional deeper layers. Enter one refractive index and thickness in nanometers per line. The reference changes the first film’s thickness only.",
    fields: [
      input("film", "Film index", 1.38, 1, 5, 0.01),
      input("substrate", "Substrate index", 1.52, 1, 5, 0.01),
      slider("thickness", "Film thickness", 100, 0, 1200, 1, "nm"),
      input("reference", "Reference thickness", 130, 0, 1200, 1, "nm"),
      area("stack", "Additional layers · index, thickness in nm", ""),
      slider("angle", "Incidence from air", 0, 0, 85, 1, "°"),
      select("pol", "Polarization", "s", ["s", "p", "Unpolarized"]),
      slider("cursor", "Inspect wavelength", 550, 350, 900, 1, "nm")
    ],
    run(values) {
      const stackRows = values.stack.split(/\r?\n/).filter(row => row.trim()).slice(0, 8);
      const layers = numericPairs(stackRows).filter(([n, thickness]) => n >= 1 && n <= 5 && thickness >= 0 && thickness <= 5000);
      const response = layerList => wavelength => {
        const at = polarization => reflectance(wavelength, layerList, values.substrate, values.angle, polarization);
        return 100 * (values.pol === "Unpolarized" ? (at("s") + at("p")) / 2 : at(values.pol));
      };
      const current = response([[values.film, values.thickness], ...layers]);
      const comparison = response([[values.film, values.reference], ...layers]);
      const bare = response([]);
      const curve = sample(350, 900, 551, current);
      const [minimumLambda, minimum] = curve.reduce((best, next) => next[1] < best[1] ? next : best);
      return {
        summary: "Lowest sampled coated reflectance is " + fmt(minimum, 4) + "% at " + minimumLambda + " nm.",
        metrics: [["Coated at cursor", fmt(current(values.cursor), 4) + "%"],
          ["Reference at cursor", fmt(comparison(values.cursor), 4) + "%"],
          ["Bare at cursor", fmt(bare(values.cursor), 4) + "%"]],
        details: ["The model assumes air, homogeneous layers, a semi-infinite substrate, real refractive indices, and coherent specular reflection.",
          "Layers from air to substrate — " + [[values.film, values.thickness], ...layers]
            .map(([n, thickness]) => "n " + n + " · " + thickness + " nm").join(" / "),
          ...(layers.length === stackRows.length ? [] : ["Skipped layers require an index from 1 to 5 and a thickness from 0 to 5,000 nm."])],
        scene: {kind: "plot", xLabel: "Wavelength (nm)", yLabel: "Reflectance (%)", xRange: [350, 900],
          series: [series("Current film", curve, cyan), series("Reference film", sample(350, 900, 201, comparison), orange),
            series("Bare substrate", sample(350, 900, 2, bare), violet, true)],
          markers: [mark("probe", values.cursor, current(values.cursor), "Wavelength probe", fmt(current(values.cursor), 4) + "% reflected")]}
      };
    }
  };

  const phaseDiagram = {
    number: 6, id: "phase-diagram-lab", title: "Phase-diagram lab",
    summary: "Read a miscibility gap and calculate phase fractions on its tie line.",
    guide: "This teaching diagram is a symmetric mean-field miscibility envelope. Move the temperature and bulk composition, predict the phase fractions, then inspect the lever-rule calculation.",
    fields: [
      slider("composition", "Bulk composition of B", 40, 0, 100, 0.5, "mol %"),
      {...slider("temperature", "Temperature", 180, 0, 400, 1, "K"), playback: true, duration: 12},
      input("critical", "Critical temperature", 300, 50, 400, 1, "K"),
      slider("spread", "Low-temperature half-width", 38, 1, 50, 1, "mol %"),
      slider("prediction", "Predicted β fraction", 25, 0, 100, 1, "%")
    ],
    run(values) {
      const width = temperature => values.spread * Math.sqrt(Math.max(0, 1 - temperature / values.critical));
      const low = 50 - width(values.temperature);
      const high = 50 + width(values.temperature);
      const within = high > low && values.composition > low && values.composition < high;
      const fraction = within ? (values.composition - low) / (high - low) : null;
      const envelopes = [-1, 1].map(sign => Array.from({length: 101}, (_, index) => {
        const distance = values.spread * index / 100;
        return [50 + sign * distance, values.critical * (1 - (distance / values.spread) ** 2)];
      }).sort((a, b) => a[0] - b[0]));
      const markers = [mark("overall", values.composition, values.temperature, "Bulk composition", fmt(values.composition, 4) + " mol % B")];
      const curves = [series("α boundary", envelopes[0], cyan), series("β boundary", envelopes[1], orange)];
      if (within) {
        curves.push(series("Current tie line", [[low, values.temperature], [high, values.temperature]], violet, true));
        markers.push(mark("alpha", low, values.temperature, "α composition", fmt(low, 4) + " mol % B"));
        markers.push(mark("beta", high, values.temperature, "β composition", fmt(high, 4) + " mol % B"));
      }
      return {
        summary: within ? "At this temperature the two phases share the tie line." : "The bulk state lies outside the open miscibility gap.",
        metrics: within ? [["α fraction", pct(1 - fraction)], ["β fraction", pct(fraction)],
          ["β prediction error", fmt(Math.abs(100 * fraction - values.prediction), 4) + " percentage points"]] : [["Phase count", 1]],
        details: within ? ["β fraction equals (C₀ − Cα) / (Cβ − Cα).", "The phase boundary is a synthetic teaching example."] :
          ["The model uses a single homogeneous phase in this region."],
        scene: {kind: "plot", xLabel: "Composition of B (mol %)", yLabel: "Temperature (K)",
          xRange: [0, 100], yRange: [0, 400], series: curves, markers}
      };
    }
  };

  function signalAt(waveform, cycles, x) {
    const phase = (cycles * x + 0.13) % 1;
    if (waveform === "Sine") return Math.sin(2 * Math.PI * phase);
    if (waveform === "Square") return phase < 0.5 ? 1 : -1;
    if (waveform === "Triangle") return 1 - 4 * Math.abs(phase - 0.5);
    return 2 * phase - 1;
  }

  function fitFourier(samples, count) {
    const N = samples.length;
    return Array.from({length: count + 1}, (_, frequency) => {
      const factor = frequency === 0 || frequency * 2 === N ? 1 / N : 2 / N;
      const [cos, sin] = samples.reduce(([c, s], value, i) => {
        const angle = 2 * Math.PI * i * frequency / N;
        return [c + value * Math.cos(angle), s + value * Math.sin(angle)];
      }, [0, 0]);
      return [cos * factor, sin * factor];
    });
  }

  const fourier = {
    number: 7, id: "fourier-reconstruction", title: "Fourier reconstruction bench",
    summary: "Use discrete Fourier coefficients to isolate sampling and truncation errors.",
    guide: "A fractional number of cycles in one record produces a discontinuity at its periodic seam. Lower the sample count to explore aliasing, and lower the retained bins to explore truncation.",
    fields: [
      select("wave", "Input waveform", "Square", ["Sine", "Square", "Triangle", "Sawtooth"]),
      slider("cycles", "Cycles per record", 2.5, 0.5, 24, 0.25),
      input("samples", "Samples per record", 64, 8, 256, 1),
      slider("bins", "Highest retained Fourier bin", 12, 1, 128, 1),
      toggle("residual", "Show pointwise residual", true),
      slider("cursor", "Inspect position in record", 66, 0, 100, 1, "%")
    ],
    run(values) {
      const sampleCount = Math.floor(values.samples);
      const count = Math.min(values.bins, Math.floor(sampleCount / 2));
      const truth = x => signalAt(values.wave, values.cycles, x);
      const samples = Array.from({length: sampleCount}, (_, i) => truth(i / sampleCount));
      const coefficients = fitFourier(samples, count);
      const fit = x => coefficients.reduce((total, [cos, sin], bin) => {
        const angle = 2 * Math.PI * x * bin;
        return total + cos * Math.cos(angle) + sin * Math.sin(angle);
      }, 0);
      const original = sample(0, 1, 501, truth);
      const reconstructed = sample(0, 1, 501, fit);
      const residual = original.map(([x, value], index) => [x, reconstructed[index][1] - value]);
      const rms = Math.sqrt(residual.reduce((sum, point) => sum + point[1] ** 2, 0) / residual.length);
      const strongest = coefficients.slice(1).reduce((best, [c, s], index) =>
        c * c + s * s > best.power ? {index: index + 1, power: c * c + s * s} : best, {index: 0, power: 0});
      const cursor = values.cursor / 100;
      return {
        summary: values.cycles > sampleCount / 2 ?
          "The fundamental exceeds the Nyquist limit for this sample count." :
          "The sampled reconstruction keeps bins 0 through " + count + ".",
        metrics: [["RMS residual", fmt(rms, 4)], ["Nyquist bin", sampleCount / 2],
          ["Strongest retained non-DC bin", strongest.index || "None"]],
        details: ["The sample start phase is fixed at 0.13 cycles.", "The inverse series is evaluated on a denser grid to expose errors between sample locations."],
        scene: {kind: "plot", xLabel: "Position within the record", yLabel: "Amplitude",
          xRange: [0, 1], series: [series("Input", original, cyan), series("Reconstruction", reconstructed, orange),
            ...(values.residual ? [series("Reconstruction minus input", residual, violet, true)] : [])],
          markers: [mark("fourier-cursor", cursor, fit(cursor), "Residual probe", "Error " + fmt(fit(cursor) - truth(cursor), 4))]}
      };
    }
  };

  const addScaled = (base, vector, step) => base.map((value, i) => value + step * vector[i]);
  function takeStep(method, derivative, state, h) {
    const k1 = derivative(state);
    if (method === "Euler") return addScaled(state, k1, h);
    const k2 = derivative(addScaled(state, k1, h / 2));
    if (method === "Midpoint") return addScaled(state, k2, h);
    const k3 = derivative(addScaled(state, k2, h / 2));
    const k4 = derivative(addScaled(state, k3, h));
    return state.map((value, i) => value + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
  }

  function integrate(method, derivative, initial, step, duration, exact, tolerance) {
    const points = [[0, initial[0]]];
    let state = initial;
    let firstWarning = null;
    let diverged = false;
    const stepCount = Math.ceil(duration / step);
    for (let index = 1; index <= stepCount; index++) {
      const end = Math.min(index * step, duration);
      const start = (index - 1) * step;
      state = takeStep(method, derivative, state, end - start);
      if (state.some(value => !Number.isFinite(value) || Math.abs(value) > 1000)) {
        diverged = true;
        break;
      }
      const point = [end, state[0]];
      points.push(point);
      if (!firstWarning && Math.abs(state[0] - exact(end)) >= tolerance) firstWarning = point;
    }
    return {points, firstWarning, diverged};
  }

  const odeDebugger = {
    number: 8, id: "numerical-methods-debugger", title: "Numerical-methods debugger",
    summary: "Compare Euler, midpoint and fourth-order Runge–Kutta with an exact trajectory.",
    guide: "Increase the time step to see where solutions drift or grow unstable. Use the error threshold to identify the earliest visible divergence.",
    fields: [
      select("system", "Test system", "Harmonic oscillator", ["Harmonic oscillator", "Logistic growth"]),
      slider("rate", "Angular frequency or growth rate", 1.6, 0.1, 8, 0.1),
      input("initial", "Initial displacement or population", 0.85, 0.01, 0.99, 0.01),
      slider("step", "Step size", 0.45, 0.01, 1, 0.01, "s"),
      slider("duration", "Duration", 10, 1, 24, 1, "s"),
      slider("tolerance", "Absolute error threshold", 0.12, 0.01, 1, 0.01)
    ],
    run(values) {
      const oscillator = values.system === "Harmonic oscillator";
      const initial = oscillator ? [values.initial, 0] : [values.initial];
      const derivative = ([x, velocity]) => oscillator ? [velocity, -(values.rate ** 2) * x] :
        [values.rate * x * (1 - x)];
      const exact = t => oscillator ? values.initial * Math.cos(values.rate * t) :
        values.initial / (values.initial + (1 - values.initial) * Math.exp(-values.rate * t));
      const methods = ["Euler", "Midpoint", "RK4"];
      const runs = methods.map(method =>
        integrate(method, derivative, initial, values.step, values.duration, exact, values.tolerance));
      const colors = [orange, violet, pink];
      const curves = [series("Exact", sample(0, values.duration, 500, exact), cyan),
        ...runs.map((run, index) => series(methods[index], run.points, colors[index], index === 2))];
      const markers = runs.flatMap((run, index) => run.firstWarning ?
        [mark("threshold-" + index, ...run.firstWarning, methods[index] + " crosses threshold",
          "t = " + fmt(run.firstWarning[0]) + " s")] : []);
      return {
        summary: oscillator ? "Harmonic oscillator with zero initial velocity." : "Logistic growth with carrying capacity 1.",
        metrics: runs.map((run, index) => {
          const [t, result] = run.points[run.points.length - 1];
          return [methods[index] + (run.diverged ? " stability" : " final error"),
            run.diverged ? "Diverged after " + fmt(t) + " s" : fmt(Math.abs(exact(t) - result), 4)];
        }),
        details: ["All three methods share step times. The final step is shortened to land on the specified duration.",
          "A trajectory stops once any state component is non-finite or exceeds magnitude 1,000."],
        scene: {kind: "plot", xLabel: "Time (s)", yLabel: oscillator ? "Displacement" : "Population",
          xRange: [0, values.duration], series: curves, markers}
      };
    }
  };

  const dimensions = ["kg", "m", "s", "A", "K", "mol", "cd"];
  const unitPowers = {
    "1": [], kg: [1], g: [1], m: [0, 1], s: [0, 0, 1], A: [0, 0, 0, 1],
    K: [0, 0, 0, 0, 1], mol: [0, 0, 0, 0, 0, 1], cd: [0, 0, 0, 0, 0, 0, 1],
    Hz: [0, 0, -1], rad: [], sr: [], N: [1, 1, -2], Pa: [1, -1, -2], J: [1, 2, -2],
    W: [1, 2, -3], C: [0, 0, 1, 1], V: [1, 2, -3, -1], F: [-1, -2, 4, 2],
    ohm: [1, 2, -3, -2], Ω: [1, 2, -3, -2], S: [-1, -2, 3, 2], Wb: [1, 2, -2, -1],
    T: [1, 0, -2, -1], H: [1, 2, -2, -2], lm: [0, 0, 0, 0, 0, 0, 1],
    lx: [0, -2, 0, 0, 0, 0, 1], Bq: [0, 0, -1], Gy: [0, 2, -2], Sv: [0, 2, -2],
    kat: [0, 0, -1, 0, 0, 1], L: [0, 3], l: [0, 3], min: [0, 0, 1], h: [0, 0, 1],
    deg: []
  };
  const prefixes = ["da", "Q", "R", "Y", "Z", "E", "P", "T", "G", "M", "k", "h",
    "d", "c", "m", "u", "µ", "μ", "n", "p", "f", "a", "z", "y", "r", "q"];
  const superscripts = "⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹";
  function baseSignature(unit) {
    const isUnit = text => Object.prototype.hasOwnProperty.call(unitPowers, text);
    if (!isUnit(unit)) {
      const prefix = prefixes.find(prefix => unit.startsWith(prefix) && unit.length > prefix.length &&
        !["1", "kg", "min", "h"].includes(unit.slice(prefix.length)) && isUnit(unit.slice(prefix.length)));
      if (!prefix) throw new Error("Unknown unit " + unit + ".");
      unit = unit.slice(prefix.length);
    }
    return dimensions.map((_, i) => unitPowers[unit][i] || 0);
  }

  function parseUnits(input) {
    const source = String(input).trim().replace(/[×·⋅]/g, "*").replace(/−/g, "-")
      .replace(/[⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, powers => "^" +
        [...powers].map(symbol => "-+0123456789"[superscripts.indexOf(symbol)]).join(""));
    if (!source || source.length > 240) throw new Error("Enter an expression of 1–240 characters.");
    const tokens = source.match(/[a-zA-ZΩµμ]+|[+-]?\d+|[()^*/]/g) || [];
    if (tokens.join("") !== source.replace(/\s+/g, "")) throw new Error("Use valid unit symbols and ^, *, / or parentheses.");
    let cursor = 0;
    function factor(depth) {
      if (depth > 16) throw new Error("Parentheses are nested too deeply.");
      const token = tokens[cursor++];
      let signature;
      if (token === "(") {
        signature = product(depth + 1);
        if (tokens[cursor++] !== ")") throw new Error("Close every group with a parenthesis.");
      } else {
        if (!token || /^[()^*/]$/.test(token)) throw new Error("Expected a unit or a parenthesized group.");
        signature = baseSignature(token);
      }
      if (tokens[cursor] === "^") {
        cursor++;
        const exponent = Number(tokens[cursor++]);
        if (!Number.isInteger(exponent) || Math.abs(exponent) > 12) throw new Error("Use integer powers from −12 to 12.");
        signature = signature.map(value => value * exponent);
      }
      return signature;
    }
    function product(depth) {
      let signature = factor(depth);
      while (cursor < tokens.length && tokens[cursor] !== ")") {
        const op = tokens[cursor];
        if (op === "*" || op === "/") cursor++;
        const right = factor(depth);
        signature = signature.map((value, i) => value + (op === "/" ? -right[i] : right[i]));
      }
      return signature;
    }
    const units = product(0);
    if (cursor !== tokens.length) throw new Error("Check the closing parentheses.");
    return units;
  }

  const formatUnits = signature => signature.map((n, i) =>
    n === 0 ? "" : dimensions[i] + (n === 1 ? "" : "^" + n)).filter(Boolean).join(" · ") || "dimensionless";

  function analyzeUnit(label, expression) {
    try {
      return {label, expression, signature: parseUnits(expression)};
    } catch (error) {
      return {label, expression, error: error.message};
    }
  }

  const dimensionTrainer = {
    number: 9, id: "dimensional-analysis", title: "Dimensional-analysis trainer",
    summary: "Find the first incompatible term in a derivation by expanding units to SI base powers.",
    guide: "Enter the required units on the left, then one named additive term per line as label | unit expression. Use * for products, / for quotients, and ^ for integer powers.",
    fields: [
      text("target", "Required units", "N"),
      area("terms", "Terms · label | units", "Mass × acceleration | kg*m/s^2\nPressure × area | Pa*m^2\nMomentum | kg*m/s")
    ],
    run(values) {
      const target = analyzeUnit("Required units", values.target);
      const terms = values.terms.split(/\r?\n/).map(row => row.trim()).filter(Boolean).slice(0, 10).map((row, i) => {
        const split = row.indexOf("|");
        return split < 0 ? analyzeUnit("Term " + (i + 1), row) :
          analyzeUnit(row.slice(0, split).trim() || "Term " + (i + 1), row.slice(split + 1).trim());
      });
      const inputs = [target, ...terms];
      let matches = 0;
      const shapes = [];
      const markers = [];
      const details = ["Equal dimensions establish consistency only. Prefixes and conversion factors are ignored."];
      inputs.forEach((term, index) => {
        const equals = target.signature && term.signature && term.signature.every((n, i) => target.signature[i] === n);
        if (equals && index) matches++;
        const output = term.error || formatUnits(term.signature);
        const y = 8 + (84 / inputs.length) * index;
        const color = term.error || !equals && target.signature ? pink : index === 0 ? violet : cyan;
        shapes.push(line(12, y, 90, y, color));
        markers.push(mark("unit-term-" + index, 12, y, term.label, output));
        details.push(term.label + " · " + term.expression + " → " + output +
          (index && !term.error && target.signature ? (equals ? " · matches" : " · mismatch") : ""));
      });
      return {
        summary: target.error ? "Resolve the required-unit expression before comparing terms." :
          matches === terms.length ? "All listed terms match the required dimensions." :
            (terms.length - matches) + " term(s) have incompatible or unreadable dimensions.",
        metrics: [["Required dimensions", target.error || formatUnits(target.signature)], ["Matching terms", matches + "/" + terms.length]],
        details, scene: {kind: "board", shapes, markers}
      };
    }
  };

  function parseMap(value) {
    const raw = value.trim();
    if (!raw || !/^\d+(?:[ ,]+\d+)*$/.test(raw)) return null;
    const values = raw.split(/[ ,]+/).map(Number);
    return values.length <= 30 && values.every(index => Number.isSafeInteger(index) && index <= 999) ? values : null;
  }

  const diagrams = {
    number: 10, id: "commutative-diagram", title: "Commutative-diagram practice",
    summary: "Compose two paths through a finite-set square and inspect the first disagreement.",
    guide: "For each function, enter the output index for inputs 0, 1, 2, and so on. The two first maps share a domain. Compare both composite values on every element of A.",
    fields: [
      text("f", "f from A to B", "1, 0, 2"),
      text("g", "g from B to D", "0, 2, 1"),
      text("h", "h from A to C", "2, 1, 0"),
      text("k", "k from C to D", "1, 2, 2"),
      select("prediction", "Prediction", "No prediction", ["No prediction", "Commutes", "Does not commute"]),
      input("inspect", "Inspect input index", 1, 0, 29, 1)
    ],
    run(values) {
      const [f, g, h, k] = [values.f, values.g, values.h, values.k].map(parseMap);
      const shapes = [line(23, 20, 77, 20, cyan), line(77, 20, 77, 78, cyan),
        line(23, 20, 23, 78, orange), line(23, 78, 77, 78, orange),
        note(49, 16, "f", cyan), note(80, 53, "g", cyan),
        note(20, 53, "h", orange), note(49, 74, "k", orange)];
      const valid = f && g && h && k && f.length === h.length &&
        f.every(output => output < g.length) && h.every(output => output < k.length);
      if (!valid) {
        return {
          summary: "Check the map tables before comparing compositions.",
          details: ["Use up to 30 nonnegative integer outputs per map. The A→B and A→C tables need the same length, and each output must index the next map."],
          scene: {kind: "board", shapes, markers: []}
        };
      }
      const disagreement = f.map((output, x) => g[output] === k[h[x]] ? -1 : x).filter(x => x >= 0);
      const selected = Math.min(Math.floor(values.inspect), f.length - 1);
      const top = g[f[selected]];
      const bottom = k[h[selected]];
      return {
        summary: disagreement.length ? "The square fails to commute at input " + disagreement[0] + "." :
          "The square commutes on every listed input.",
        metrics: [["Matching inputs", (f.length - disagreement.length) + "/" + f.length],
          ["g ∘ f at " + selected, top], ["k ∘ h at " + selected, bottom],
          ...(values.prediction === "No prediction" ? [] : [[
            "Prediction", (values.prediction === "Commutes") === !disagreement.length ? "Matches" : "Try again"
          ]])],
        details: f.map((value, x) => x + " → " + value + " → " + g[value] + " on the upper path, and " +
          x + " → " + h[x] + " → " + k[h[x]] + " on the lower path."),
        scene: {kind: "board", shapes, markers: [
          mark("A", 23, 20, "A", "Input " + selected), mark("B", 77, 20, "B", "f(" + selected + ") = " + f[selected]),
          mark("C", 23, 78, "C", "h(" + selected + ") = " + h[selected]),
          mark("D", 77, 78, "D", "Upper path " + top + " · lower path " + bottom)]}
      };
    }
  };

  const gcd = (a, b) => {
    while (b) [a, b] = [b, a % b];
    return a;
  };
  const mod = (a, m) => (a % m + m) % m;
  const conjectures = {
    "Modular square roots": {
      explain: m => "If a² ≡ b² mod " + m + ", then a ≡ b or a ≡ −b mod " + m + ".",
      test: (a, b, m) => mod(a * a - b * b, m) !== 0 || mod(a - b, m) === 0 || mod(a + b, m) === 0,
      details: (a, b, m) => "a² mod m = " + mod(a * a, m) + ", b² mod m = " + mod(b * b, m) +
        ", (a − b) mod m = " + mod(a - b, m) + ", and (a + b) mod m = " + mod(a + b, m) + "."
    },
    "Square root of a sum": {
      explain: () => "√(a + b) = √a + √b for nonnegative integers.",
      test: (a, b) => a === 0 || b === 0,
      details: (a, b) => "Left value " + fmt(Math.sqrt(a + b), 6) + " · right value " + fmt(Math.sqrt(a) + Math.sqrt(b), 6) + "."
    },
    "GCD under sum and difference": {
      explain: () => "gcd(a, b) = gcd(a + b, |a − b|), using gcd(0, 0) = 0.",
      test: (a, b) => gcd(a, b) === gcd(a + b, Math.abs(a - b)),
      details: (a, b) => "Left gcd " + gcd(a, b) + " · right gcd " + gcd(a + b, Math.abs(a - b)) + "."
    },
    "Arithmetic–geometric mean": {
      explain: () => "(a + b)/2 ≥ √(ab) for nonnegative integers.",
      test: (a, b) => (a + b) ** 2 >= 4 * a * b,
      details: (a, b) => "Arithmetic mean " + fmt((a + b) / 2, 6) + " · geometric mean " + fmt(Math.sqrt(a * b), 6) + "."
    }
  };

  const counterexamples = {
    number: 11, id: "counterexample-search", title: "Counterexample search",
    summary: "Sweep a bounded integer grid and inspect the simplest counterexample to a conjecture.",
    guide: "Start with a composite modulus, then try primes. The smallest counterexample is ordered by a + b, then by a. Use the inspected pair to check the arithmetic.",
    fields: [
      select("conjecture", "Conjecture", "Modular square roots", Object.keys(conjectures)),
      input("modulus", "Modulus for modular roots", 8, 2, 101, 1),
      slider("bound", "Largest tested integer", 14, 1, 35, 1),
      input("a", "Inspect a", 1, 0, 35, 1),
      input("b", "Inspect b", 3, 0, 35, 1)
    ],
    actions: [{
      label: "Inspect smallest counterexample",
      run(values) {
        const conjecture = conjectures[values.conjecture];
        const failures = findCounterexamples(Math.floor(values.bound), Math.floor(values.modulus), conjecture);
        return failures.length ? {a: failures[0][0], b: failures[0][1]} : {};
      }
    }],
    run(values) {
      const conjecture = conjectures[values.conjecture];
      const bound = Math.floor(values.bound);
      const modulus = Math.floor(values.modulus);
      const failures = findCounterexamples(bound, modulus, conjecture);
      const first = failures[0];
      const a = Math.min(Math.floor(values.a), bound);
      const b = Math.min(Math.floor(values.b), bound);
      const step = 75 / (bound + 1);
      const x = value => 14 + step * (value + 0.5);
      const y = value => 87 - step * (value + 0.5);
      const shapes = [rect(14, 12, 75, 75, "#15242d", rule), note(50, 97, "a", cyan), note(4, 51, "b", cyan)];
      for (let index = 0; index <= bound; index++) {
        const yLine = 87 - index * step;
        const xLine = 14 + index * step;
        shapes.push(line(14, yLine, 89, yLine), line(xLine, 12, xLine, 87));
      }
      failures.forEach(([u, v]) => shapes.push(rect(x(u) - step / 2, y(v) - step / 2, step, step, "#b94467")));
      const successful = conjecture.test(a, b, modulus);
      return {
        summary: conjecture.explain(modulus),
        metrics: [["Pairs tested", (bound + 1) ** 2], ["Counterexamples", failures.length],
          ["Smallest pair", first ? "(" + first.join(", ") + ")" : "None in this grid"]],
        details: [conjecture.details(a, b, modulus), "A finite sweep can falsify a general claim. A sweep with no failures leaves the general claim open."],
        scene: {kind: "board", shapes, markers: [
          mark("tested-pair", x(a), y(b), "Inspect (" + a + ", " + b + ")", successful ? "Holds" : "Counterexample"),
          ...(!first || first[0] === a && first[1] === b ? [] :
            [mark("first-failure", x(first[0]), y(first[1]), "Smallest failure", "(" + first.join(", ") + ")")])
        ]}
      };
    }
  };

  function findCounterexamples(bound, modulus, conjecture) {
    const failures = [];
    for (let a = 0; a <= bound; a++) {
      for (let b = 0; b <= bound; b++) {
        if (!conjecture.test(a, b, modulus)) failures.push([a, b]);
      }
    }
    return failures.sort((left, right) => left[0] + left[1] - right[0] - right[1] || left[0] - right[0]);
  }

  window.workbenchProjects.push(paperFigures, modelEvaluation, atlasReview, photonics, phaseDiagram,
    fourier, odeDebugger, dimensionTrainer, diagrams, counterexamples);
})();
