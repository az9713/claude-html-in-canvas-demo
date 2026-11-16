(function () {
  "use strict";

  const projects = window.workbenchProjects;
  const teal = "#63d6c5";
  const gold = "#f1bd76";
  const lilac = "#bca8fb";
  const gray = "#566783";
  const blueFill = "#23334a";
  const rad = Math.PI / 180;

  function number(key, label, value, min, max, step = 1, unit) {
    return { key, label, type: "number", value, min, max, step, unit };
  }

  function range(key, label, value, min, max, step = 1, unit) {
    return { ...number(key, label, value, min, max, step, unit), type: "range" };
  }

  function select(key, label, options, value = options[0]) {
    return { key, label, type: "select", value, options };
  }

  function text(key, label, value, type = "text") {
    return { key, label, type, value };
  }

  function checkbox(key, label, value = false) {
    return { key, label, type: "checkbox", value };
  }

  function rows(input) {
    return input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  }

  function sourceText(sources, index, fallback) {
    return sources.filter(source => source.kind === "text")[index]?.text ?? fallback;
  }

  function images(sources) {
    return sources.filter(source => source.kind === "image");
  }

  function clip(value, length) {
    return value.length > length ? value.slice(0, length - 1).trimEnd() + "…" : value;
  }

  function board(shapes, markers = []) {
    return { kind: "board", shapes, markers };
  }

  function rect(x, y, w, h, fill = blueFill, stroke = gray) {
    return { type: "rect", x, y, w, h, fill, stroke };
  }

  function line(x, y, x2, y2, stroke = gray) {
    return { type: "line", x, y, x2, y2, stroke };
  }

  function circle(x, y, r, fill, stroke) {
    return { type: "circle", x, y, r, fill, stroke };
  }

  function label(x, y, value, fill = "#e5edf9") {
    return { type: "text", x, y, label: value, fill };
  }

  function photo(source, x, y, w, h) {
    return { type: "image", x, y, w, h, source: source.id };
  }

  function marker(key, x, y, title, detail) {
    return { key, x, y, label: title, detail };
  }

  function trace(label, points, color) {
    return { label, points, color };
  }

  function plot(xLabel, yLabel, series, markers = [], limits = {}) {
    return { kind: "plot", xLabel, yLabel, series, markers, ...limits };
  }

  function invalid(summary, detail) {
    return { summary, details: [detail], scene: board([]) };
  }

  function formatClock(ms) {
    return new Date(ms).toISOString().slice(11, 16) + " UTC";
  }

  function utc(text) {
    const normalized = text.trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/i.test(normalized)) return NaN;
    const ms = Date.parse(normalized);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 16) === normalized.slice(0, 16) ? ms : NaN;
  }

  function altitude(ra, declination, latitude, longitude, ms) {
    const days = ms / 86400000 - 10957.5;
    const localSidereal = (280.46061837 + 360.98564736629 * days + longitude) % 360;
    const hourAngle = (localSidereal - 15 * ra) * rad;
    const lat = latitude * rad;
    const dec = declination * rad;
    const sine = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
    return Math.asin(Math.max(-1, Math.min(1, sine))) / rad;
  }

  projects.push({
    number: 12,
    id: "observing-session",
    title: "Observing-session planner",
    summary: "Compare altitude windows for a set of sky targets from a hypothetical site.",
    guide: "Set latitude, longitude, and a UTC start time. Enter each target as name, right ascension in hours, and declination in degrees. An imported text file can supply the target rows. The calculator uses fixed equatorial coordinates and geometric altitude.",
    fields: [
      number("latitude", "Site latitude", 35, -90, 90, 0.1, "°"),
      number("longitude", "Site longitude, east positive", 0, -180, 180, 0.1, "°"),
      text("start", "Start (YYYY-MM-DDTHH:MMZ)", "2026-11-17T20:00Z"),
      number("hours", "Session length", 7, 1, 24, 0.5, "h"),
      range("threshold", "Minimum useful altitude", 30, 0, 85, 1, "°"),
      text("targets", "Targets (name, RA hours, declination °)", "Vega,18.616,38.784\nDeneb,20.690,45.280\nAltair,19.846,8.868", "textarea")
    ],
    run(values, sources) {
      const start = utc(values.start);
      if (!Number.isFinite(start)) {
        return invalid("Enter a valid UTC start.", "Use a value such as 2026-11-17T20:00Z.");
      }
      const entries = rows(sourceText(sources, 0, values.targets));
      const targets = entries.slice(0, 21).map(entry => {
        const [name, ra, dec] = entry.split(",").map(value => value.trim());
        return { name, ra: ra ? Number(ra) : NaN, dec: dec ? Number(dec) : NaN };
      }).filter(target => target.name && target.ra >= 0 && target.ra < 24 && Math.abs(target.dec) <= 90).slice(0, 8);
      if (!targets.length) return invalid("Add a sky target.", "Example row: Deneb,20.690,45.280.");
      const count = Math.ceil(values.hours * 12);
      const palette = [teal, gold, lilac, "#ed8fa0", "#a1cef6", "#93ca9f", "#f2a77d", "#c0c8e0"];
      const series = [{ ...trace("Minimum", [[0, values.threshold], [values.hours, values.threshold]], gray), dashed: true }];
      const markers = [];
      const details = [];
      targets.forEach((target, index) => {
        const points = Array.from({ length: count + 1 }, (_, step) => {
          const elapsed = step * values.hours / count;
          const height = altitude(target.ra, target.dec, values.latitude, values.longitude, start + elapsed * 3600000);
          return [elapsed, height];
        });
        const peak = points.reduce((best, point) => point[1] > best[1] ? point : best);
        const windows = [];
        let open = null;
        points.forEach(([time, height], step) => {
          if (height >= values.threshold && open === null) open = time;
          if (open !== null && (height < values.threshold || step === count)) {
            windows.push([open, height < values.threshold ? points[step - 1][0] : time]);
            open = null;
          }
        });
        const timing = windows.map(period => period.map(t => formatClock(start + t * 3600000)).join(" to ")).join(", ");
        const note = timing ? "Above minimum " + timing : "Below minimum throughout";
        details.push(target.name + " · " + note);
        markers.push(marker("target-" + index, peak[0], peak[1], clip(target.name, 28), note));
        series.push(trace(target.name, points, palette[index]));
      });
      return {
        summary: "Altitude sampled every five minutes or less with times shown in UTC.",
        metrics: [["Targets plotted", targets.length], ["Minimum altitude", values.threshold + "°"], ["Rows not plotted", entries.length - targets.length]],
        details: [...details, "Planning estimate. Darkness, weather, terrain and refraction are outside this calculation."],
        scene: plot("Hours since " + formatClock(start), "Altitude (°)", series, markers, { xRange: [0, values.hours], yRange: [-90, 90] })
      };
    }
  });

  const anatomyLandmarks = [
    ["Scapula", -14, -27, -8], ["Acromion", -7, -31, 0], ["Glenoid", -1, -24, -2],
    ["Humeral head", 4, -23, 2], ["Humeral shaft", 8, -3, 0], ["Medial epicondyle", 6, 11, -2],
    ["Lateral epicondyle", 14, 11, 2], ["Radial head", 14, 17, 3], ["Radius", 16, 27, 6],
    ["Radial styloid", 18, 36, 5], ["Olecranon", 7, 15, -5], ["Ulna", 8, 28, -3], ["Ulnar styloid", 10, 36, -2]
  ];
  const anatomySegments = [[0, 1], [0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [5, 6], [6, 7], [7, 8], [8, 9], [5, 10], [10, 11], [11, 12]];
  const anatomyNotes = {
    "Scapula": "Shoulder blade. The glenoid is on its lateral side.",
    "Glenoid": "Socket of the glenohumeral joint.",
    "Humeral head": "Rounded proximal humerus articulating with the glenoid.",
    "Medial epicondyle": "Distal humeral prominence on the medial side of the elbow.",
    "Radial head": "Proximal end of the radius near the elbow.",
    "Radius": "Forearm bone on the thumb side in anatomical position.",
    "Olecranon": "Proximal ulnar projection that forms the point of the elbow.",
    "Ulna": "Forearm bone on the little-finger side in anatomical position."
  };

  projects.push({
    number: 13,
    id: "anatomy-explanations",
    title: "Anatomy explanation bench",
    summary: "Rotate a schematic upper limb and test whether you can recognize landmarks from another angle.",
    guide: "Select a landmark, rotate the schematic, and identify it before revealing its label. The diagram is a 3D teaching schematic. A selected marker holds your notes as you change the viewpoint.",
    fields: [
      range("yaw", "Yaw", 12, -180, 180, 1, "°"),
      range("pitch", "Pitch", -12, -70, 70, 1, "°"),
      range("target", "Target number", 4, 1, anatomyLandmarks.length, 1),
      checkbox("reveal", "Reveal landmark"),
      text("guess", "Your answer", "")
    ],
    run(values) {
      const yaw = values.yaw * rad;
      const pitch = values.pitch * rad;
      const projected = anatomyLandmarks.map(([, x, y, z]) => {
        const horizontal = x * Math.cos(yaw) + z * Math.sin(yaw);
        const depth = z * Math.cos(yaw) - x * Math.sin(yaw);
        return [50 + horizontal * 1.15, 49 + (y * Math.cos(pitch) - depth * Math.sin(pitch)) * 1.05];
      });
      const index = values.target - 1;
      const [landmark] = anatomyLandmarks[index];
      const [x, y] = projected[index];
      const shapes = anatomySegments.map(([a, b]) => line(...projected[a], ...projected[b], "#b3bace"));
      shapes.push(...projected.map(([px, py], point) => circle(px, py, point === index ? 2.1 : 0.85, point === index ? gold : blueFill, point === index ? gold : "#aab1c3")));
      shapes.push(label(7, 10, "Upper-limb schematic", teal));
      const answer = values.reveal ? landmark : "Identify landmark";
      return {
        summary: values.reveal ? (anatomyNotes[landmark] || landmark) : "Identify the highlighted landmark before revealing its name.",
        metrics: [["Yaw", values.yaw + "°"], ["Pitch", values.pitch + "°"], ["Named landmarks", anatomyLandmarks.length]],
        details: values.guess.trim() ? ["Your answer · " + values.guess.trim()] : [],
        scene: board(shapes, [marker("anatomy-" + index, x, y, answer, values.reveal ? anatomyNotes[landmark] : "Rotate the joint and look for nearby structures.")])
      };
    }
  });

  const lectureCues = [
    "0 | Setup | f(x) on a full period | Symmetric waveform",
    "34 | Define the coefficient | aₙ = (1/π) ∫₋π^π f(x) cos(nx) dx | Projection onto a cosine",
    "68 | Use parity | even × odd = odd | Compare the two halves",
    "107 | Cancel the sine terms | bₙ = 0 for even f | Equal areas of opposite sign",
    "151 | Interpret the result | Even signal = cosine series | Reconstruct with three modes"
  ].join("\n");

  function parseCues(raw) {
    return rows(raw).slice(0, 100).flatMap(row => {
      const [time, title, equation = "", concept = ""] = row.split("|").map(part => part.trim());
      const seconds = Number(time);
      return time && title && Number.isFinite(seconds) && seconds >= 0 ? [{ seconds, title, equation, concept }] : [];
    }).sort((a, b) => a.seconds - b.seconds);
  }

  function lectureTime(seconds) {
    return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
  }

  projects.push({
    number: 14,
    id: "lecture-reconstruction",
    title: "Lecture reconstruction",
    summary: "Reconstruct a lecture step against a timed transcript, equation, and optional source figure.",
    guide: "Use the timeline to stop just before a key result. Enter your reconstruction, then reveal the original step. Import a cue sheet with seconds | cue | equation | diagram note and add a local video or reference figure.",
    fields: [
      { ...range("time", "Timeline position", 48, 0, 100, 1, "%"), playback: true, durationKey: "length" },
      range("length", "Timeline length", 151, 10, 3600, 1, "s"),
      checkbox("reveal", "Reveal next step"),
      text("reconstruction", "Your reconstruction", "", "textarea"),
      text("cues", "Timed cues", lectureCues, "textarea")
    ],
    run(values, sources) {
      const cues = parseCues(sourceText(sources, 0, values.cues));
      if (!cues.length) return invalid("Add a timestamped cue.", "Use seconds | cue | equation | diagram note.");
      const duration = Math.max(values.length, cues.at(-1).seconds);
      const time = duration * values.time / 100;
      const current = cues.findLast(cue => cue.seconds <= time);
      const next = cues.find(cue => cue.seconds > time);
      const active = values.reveal ? next || current : current;
      const video = sources.find(source => source.kind === "video");
      const figure = video || images(sources)[0];
      const shapes = [line(9, 74, 91, 74), label(8, 83, "0:00"), label(84, 83, lectureTime(duration)), line(9 + 0.82 * values.time, 68, 9 + 0.82 * values.time, 80, gold)];
      if (figure) {
        shapes.push({ ...photo(figure, 10, 8, 80, 51), time });
      } else {
        shapes.push(rect(10, 8, 80, 51), label(15, 23, clip(active?.title || "Before the first cue", 60), teal));
        if (active?.equation) shapes.push(label(15, 36, clip(active.equation, 65)));
        if (active?.concept) shapes.push(label(15, 48, clip(active.concept, 64)));
      }
      const markers = cues.filter(cue => values.reveal || cue.seconds <= time).slice(0, 12)
        .map((cue, index) => marker("cue-" + index, 9 + 82 * cue.seconds / duration, 74, lectureTime(cue.seconds) + " " + clip(cue.title, 22), cue.equation));
      return {
        summary: values.reveal ? (active ? "Revealed · " + active.title : "No cue at this time.") : "Reconstruct the next step before revealing it.",
        metrics: [["Playhead", lectureTime(time)], ["Cues", cues.length], ["Next cue time", next ? lectureTime(next.seconds) : "End"]],
        details: [active?.equation, active?.concept, values.reconstruction.trim() ? "Your reconstruction · " + values.reconstruction.trim() : ""].filter(Boolean),
        scene: board(shapes, markers)
      };
    }
  });

  const recallPrompts = {
    "Interpret a slope": ["What physical quantity does the initial slope represent?", "The initial rate of change per unit time."],
    "Explain the plateau": ["What does a constant value at late times suggest?", "The measured quantity is approaching a steady value."],
    "Read the halfway point": ["What does the highlighted point on the curve tell you?", "It locates the time when the measured quantity has reached about half its final value."],
    "Custom": ["", ""]
  };
  const recallX = { "Interpret a slope": 0.6, "Explain the plateau": 4.4, "Read the halfway point": 0.83 };

  projects.push({
    number: 15,
    id: "figure-spaced-repetition",
    title: "Figure-first spaced repetition",
    summary: "Hide a figure's interpretation, retrieve it from memory, and mark the next review.",
    guide: "Use the sample curve or import a local figure. Write a custom question and answer, set the marker position, and cover axis-label areas if you want a blind test. Rate your recall to get a suggested review interval.",
    fields: [
      select("prompt", "Prompt", Object.keys(recallPrompts)),
      text("question", "Custom question", ""),
      text("answer", "Custom answer", "", "textarea"),
      text("attempt", "Your answer", "", "textarea"),
      range("x", "Imported figure marker horizontal", 50, 7, 93, 1, "%"),
      range("y", "Imported figure marker vertical", 45, 9, 88, 1, "%"),
      range("bottomCover", "Bottom edge to cover", 0, 0, 30, 1, "%"),
      range("leftCover", "Left edge to cover", 0, 0, 30, 1, "%"),
      checkbox("reveal", "Reveal answer and axes"),
      select("recall", "Recall rating", ["Unrated", "Again", "Hard", "Good", "Easy"]),
      number("prior", "Previous interval", 1, 1, 365, 1, "days")
    ],
    run(values, sources) {
      const [presetQuestion, presetAnswer] = recallPrompts[values.prompt] || recallPrompts.Custom;
      const question = values.question.trim() || presetQuestion || "Add a recall question.";
      const answer = values.answer.trim() || presetAnswer || "Add the expected answer.";
      const nextDays = factor => Math.min(365, Math.max(1, Math.round(values.prior * factor))) + " days";
      const interval = { Again: "Today", Hard: nextDays(1.2), Good: nextDays(2), Easy: nextDays(3) };
      const x = recallX[values.prompt] || 0.83;
      const curve = t => 1 - Math.exp(-t / 1.2);
      const figure = images(sources)[0];
      const note = values.reveal ? answer : question;
      const shapes = figure ? [photo(figure, 4, 5, 92, 90)] : [];
      if (figure && !values.reveal) {
        if (values.bottomCover > 0) shapes.push(rect(4, 95 - values.bottomCover * 0.9, 92, values.bottomCover * 0.9));
        if (values.leftCover > 0) shapes.push(rect(4, 5, values.leftCover * 0.92, 90));
      }
      const scene = figure
        ? board(shapes, [marker("recall", values.x, values.y, "Recall point", note)])
        : plot(values.reveal ? "Time (arbitrary units)" : "Horizontal axis hidden", values.reveal ? "Normalized response" : "Vertical axis hidden",
            [trace(values.reveal ? "Saturating response" : "Curve", Array.from({ length: 61 }, (_, index) => [index / 12, curve(index / 12)]), teal)],
            [marker("recall", x, curve(x), "Recall point", note)], { xRange: [0, 5], yRange: [0, 1.1], hideTickLabels: !values.reveal });
      return {
        summary: values.reveal ? answer : question,
        metrics: [["Review", interval[values.recall] || "Unrated"], ["Source", figure ? figure.name : "Sample response"]],
        details: [values.attempt.trim() ? "Your answer · " + values.attempt.trim() : "", values.reveal ? "Question · " + question : ""].filter(Boolean),
        scene
      };
    }
  });

  const evidenceRows = [
    "Persists in darkness | contradicts | supports",
    "Disappears when a connector is reseated | contradicts | supports",
    "Appears again only in bright light after repair | supports | unresolved"
  ].join("\n");

  projects.push({
    number: 16,
    id: "competing-explanations",
    title: "Competing explanations board",
    summary: "Compare two explanations against the same observations and choose a test that could discriminate between them.",
    guide: "Write a prediction for each explanation. Mark each observation as supports, contradicts, or unresolved for A and B. Scores count your labels with equal weight. The original observation and proposed follow-up remain visible.",
    fields: [
      text("observation", "Observation", "An optical sensor intermittently reads high."),
      text("explanationA", "Explanation A", "Ambient light enters the enclosure"),
      text("explanationB", "Explanation B", "An intermittent signal connection"),
      text("predictionA", "Prediction A", "The reading changes when a shade blocks external light."),
      text("predictionB", "Prediction B", "The reading changes when touching the connector in a dark enclosure."),
      text("evidence", "Evidence | effect on A | effect on B", evidenceRows, "textarea"),
      text("experiment", "Next discriminating test", "Alternate bright and dark conditions with a fixed connector, then test connector movement in darkness.")
    ],
    run(values, sources) {
      const effect = new Map([["supports", 1], ["contradicts", -1], ["unresolved", 0]]);
      const evidence = rows(sourceText(sources, 0, values.evidence)).slice(0, 30).flatMap(row => {
        const [name, a, b] = row.toLowerCase().split("|").map(part => part.trim());
        return name && effect.has(a) && effect.has(b)
          ? [{ name: row.split("|")[0].trim(), a, b }] : [];
      });
      const score = key => evidence.reduce((total, item) => total + effect.get(item[key]), 0);
      const a = score("a"), b = score("b");
      const shapes = [
        rect(20, 8, 60, 19), label(26, 16, "Shared observation", teal),
        label(26, 22, clip(values.observation, 53)),
        line(50, 27, 27, 39), line(50, 27, 73, 39),
        rect(6, 39, 42, 24, blueFill, teal), rect(52, 39, 42, 24, blueFill, gold),
        label(11, 49, "Explanation A", teal), label(57, 49, "Explanation B", gold),
        label(11, 56, clip(values.explanationA, 29)), label(57, 56, clip(values.explanationB, 29)),
        line(27, 63, 50, 75), line(73, 63, 50, 75), rect(20, 75, 60, 17),
        label(26, 85, "Proposed follow-up")
      ];
      return {
        summary: evidence.length ? a === b ? "The evidence ratings are tied." : "Your evidence ratings currently lean toward " + (a > b ? "A." : "B.") : "Add evidence ratings to compare the explanations.",
        metrics: [["Evidence rows", evidence.length], ["A balance", a], ["B balance", b]],
        details: [...evidence.map(item => item.name + " · A " + item.a + " · B " + item.b), "Proposed follow-up · " + values.experiment],
        scene: board(shapes, [marker("hypothesis-a", 27, 60, "Prediction A", values.predictionA), marker("hypothesis-b", 73, 60, "Prediction B", values.predictionB), marker("experiment", 50, 89, "Next test", values.experiment)])
      };
    }
  });

  const sampleReference = "x,y\n0,0\n1,0.7\n2,1.15\n3,1.43\n4,1.62\n5,1.72";
  const sampleReconstruction = "x,y\n0,0.02\n1,0.63\n2,1.18\n3,1.51\n4,1.65\n5,1.71";

  function coordinates(raw) {
    const samples = new Map();
    rows(raw).slice(0, 2000).forEach(row => {
      const [first, second] = row.includes(",") ? row.split(",").map(part => part.trim()) : row.split(/\s+/);
      if (!first || !second) return;
      const x = Number(first), y = Number(second);
      if (Number.isFinite(x) && Number.isFinite(y)) samples.set(x, y);
    });
    return [...samples].sort((first, second) => first[0] - second[0]);
  }

  function estimate(points, x) {
    if (x < points[0][0] || x > points.at(-1)[0]) return null;
    let low = 0;
    let high = points.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (points[middle][0] <= x) low = middle;
      else high = middle;
    }
    const [x0, y0] = points[low];
    const [x1, y1] = points[high];
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }

  projects.push({
    number: 17,
    id: "replication",
    title: "Replication workbench",
    summary: "Align reference and reconstructed series, then examine the residual or compare figures.",
    guide: "Enter two sets of x,y observations or import two local text files. Reference values are linearly interpolated at overlapping reconstruction coordinates. Alternatively, import two images prepared at the same framing and switch to image comparison.",
    fields: [
      select("view", "View", ["Curves", "Residual", "Image wipe", "Image difference"]),
      range("wipe", "Image wipe", 50, 0, 100, 1, "%"),
      text("reference", "Reference x,y", sampleReference, "textarea"),
      text("replica", "Reconstruction x,y", sampleReconstruction, "textarea"),
      text("units", "Y unit", "response units"),
      text("method", "Preprocessing or version note", "Both curves use a shared baseline.")
    ],
    run(values, sources) {
      if (values.view.startsWith("Image")) {
        const [left, right] = images(sources);
        if (!left || !right) return invalid("Import two figures.", "Use matching framing and an identical axis range so differences have a common coordinate system.");
        return {
          summary: "Compare two locally imported figures in shared normalized image coordinates.",
          metrics: [["Reference", left.name], ["Reconstruction", right.name]],
          details: [values.method].filter(Boolean),
          scene: {
            kind: "compare", left: left.id, right: right.id,
            position: values.wipe, mode: values.view === "Image difference" ? "difference" : "wipe",
            leftLabel: "Reference", rightLabel: "Reconstruction",
            markers: [marker("image-review", 50, 52, "Registration note", values.method)]
          }
        };
      }
      const reference = coordinates(sourceText(sources, 0, values.reference));
      const replica = coordinates(sourceText(sources, 1, values.replica));
      if (reference.length < 2 || replica.length < 2) {
        return invalid("Add two or more distinct x coordinates to both series.", "Use one x,y pair per line.");
      }
      const residual = replica.flatMap(([x, y]) => {
        const referenceY = estimate(reference, x);
        return referenceY === null ? [] : [[x, y - referenceY]];
      });
      const peak = residual.reduce((largest, current) => !largest || Math.abs(current[1]) > Math.abs(largest[1]) ? current : largest, null);
      const rms = residual.length ? Math.sqrt(residual.reduce((sum, [, y]) => sum + y * y, 0) / residual.length) : null;
      const range = values.view === "Residual" && residual.length ? [residual[0][0], residual.at(-1)[0]] : [reference[0][0], reference.at(-1)[0]];
      const units = values.units.trim() || "y units";
      const details = values.method.trim() ? ["Version or preprocessing · " + values.method] : [];
      if (!residual.length) details.push("The two coordinate ranges do not overlap.");
      if (peak) details.push("Largest signed residual " + peak[1].toPrecision(4) + " at x = " + peak[0]);
      return {
        summary: values.view === "Residual" ? "Reconstruction minus the interpolated reference." : "Source and reconstructed samples on one coordinate system.",
        metrics: [["Overlapping samples", residual.length], ["RMS residual", rms === null ? "—" : rms.toPrecision(4)], ["Excluded samples", replica.length - residual.length]],
        details,
        scene: values.view === "Residual"
          ? plot("x", "Residual (" + units + ")", [
              { ...trace("Zero", [[range[0], 0], [range[1], 0]], gray), dashed: true },
              trace("Reconstruction − reference", residual, gold)
            ], peak ? [marker("residual-peak", peak[0], peak[1], "Largest residual", details.at(-1))] : [])
          : plot("x", units, [trace("Reference", reference, teal), trace("Reconstruction", replica, gold)],
              peak ? [marker("largest-discrepancy", peak[0], replica.find(point => point[0] === peak[0])[1], "Compare this point", details.at(-1))] : [])
      };
    }
  });

  const misconceptionExamples = [
    "Series resistance | Positive resistor added in series | The source supplies the same current | The added resistance raises the total series resistance | I = V/R, so current falls for a fixed voltage",
    "Thermal equilibrium | Two objects share a final temperature | They must contain equal thermal energy | Equal temperature describes equilibrium, while energy depends on the system | Compare masses and heat capacities",
    "Convolution | Shift one function over the other | Pointwise multiplication is sufficient | The convolution accumulates overlap at each shift | Integrate the product using the shifted, reflected function"
  ].join("\n");

  projects.push({
    number: 18,
    id: "misconception-atlas",
    title: "Misconception atlas",
    summary: "Review an incorrect inference at the exact step where it enters a derivation.",
    guide: "Save each episode as topic | prompt | original error | corrected step | check. Pick a case number and a reveal stage. Import a local text file to switch to a different collection.",
    fields: [
      number("case", "Case number", 1, 1, 35, 1),
      select("stage", "Reveal stage", ["Prompt only", "Show original error", "Show correction"]),
      text("prediction", "Your current reasoning", "", "textarea"),
      text("cases", "Case records", misconceptionExamples, "textarea")
    ],
    run(values, sources) {
      const entries = rows(sourceText(sources, 0, values.cases)).slice(0, 35).map(row => row.split("|").map(part => part.trim()))
        .filter(row => row.length === 5 && row.every(Boolean));
      if (!entries.length) return invalid("Add a complete case.", "Provide topic, prompt, error, correction, and a check, separated by |.");
      const index = Math.min(Math.max(0, Math.round(values.case) - 1), entries.length - 1);
      const [topic, prompt, error, correction, check] = entries[index];
      const showError = values.stage !== "Prompt only";
      const showCorrection = values.stage === "Show correction";
      const stages = [
        ["Prompt", prompt, teal, true],
        ["Original error", error, gold, showError],
        ["Corrected step", correction, lilac, showCorrection],
        ["Check", check, teal, showCorrection]
      ];
      const shapes = [label(7, 11, clip(topic, 60), teal), line(13, 19, 13, 87)];
      const markers = [];
      const details = [];
      stages.forEach(([title, body, color, visible], i) => {
        const y = 25 + 19 * i;
        shapes.push(circle(13, y, 1.05, visible ? color : blueFill, color), rect(19, y - 6.5, 74, 13, blueFill, visible ? color : gray));
        shapes.push(label(23, y - 0.5, title, visible ? color : "#8b9ab3"), label(47, y - 0.5, visible ? clip(body, 41) : "Hidden"));
        if (visible) {
          markers.push(marker("case-" + index + "-stage-" + i, 16, y, title, body));
          details.push(title + " · " + body);
        }
      });
      if (values.prediction.trim()) details.push("Current reasoning · " + values.prediction.trim());
      return {
        summary: topic + " · " + values.stage,
        metrics: [["Case", (index + 1) + " / " + entries.length], ["Stages visible", stages.filter(([, , , visible]) => visible).length]],
        details,
        scene: board(shapes, markers)
      };
    }
  });

  const bilingualLabels = [
    "28 | 28 | Input intensity (W/m²) | 入射光強度（W/m²）",
    "68 | 47 | Transmitted intensity | 透射光強度",
    "48 | 73 | Measured angle of incidence | 實測入射角"
  ].join("\n");

  function textWidth(text) {
    return Array.from(text).reduce((total, char) => {
      if (/\p{Mark}/u.test(char)) return total;
      if (/[\p{Script=Han}\p{Extended_Pictographic}]/u.test(char) || /[\uFF01-\uFF60]/u.test(char)) return total + 2;
      return total + 1;
    }, 0);
  }

  function wrapLabel(value, budget, lang) {
    const tokens = lang === "中文" ? Array.from(value) : value.split(/(?<=\s)|(?=\s)/u).filter(Boolean);
    const lines = [""];
    for (const token of tokens) {
      const line = lines.at(-1);
      if (line && textWidth(line + token) > budget) lines.push(token.trimStart());
      else lines[lines.length - 1] += token;
    }
    return lines.map(line => line.trimEnd());
  }

  projects.push({
    number: 19,
    id: "figure-translation",
    title: "Translation review for technical figures",
    summary: "Compare English and Traditional Chinese labels pinned to the same coordinates.",
    guide: "Edit one label per line as x | y | English | Traditional Chinese. Use 0–100 coordinates and adjust maximum label width. Import a local figure to test whether the longer labels fit around your data. Width estimates use simple character units.",
    fields: [
      select("language", "Languages shown", ["Both", "English", "Traditional Chinese"]),
      range("budget", "Label width estimate", 22, 10, 44, 1, "units"),
      text("labels", "Figure labels", bilingualLabels, "textarea")
    ],
    run(values, sources) {
      const entries = rows(sourceText(sources, 0, values.labels)).slice(0, 16).flatMap(row => {
        const [x, y, en, zh] = row.split("|").map(part => part.trim());
        return x && y && en && zh && Number(x) >= 0 && Number(x) <= 100 && Number(y) >= 0 && Number(y) <= 100
          ? [{ x: Number(x), y: Number(y), en, zh }] : [];
      });
      if (!entries.length) return invalid("Add a bilingual label.", "Use x and y in 0–100, followed by both translations separated by |.");
      const source = images(sources)[0];
      const shapes = source ? [photo(source, 1, 1, 98, 98)] : [
        rect(2, 3, 96, 94, "#172233"), line(6, 56, 95, 56, "#506585"),
        line(12, 14, 58, 56, teal), line(58, 56, 87, 79, gold), line(58, 20, 58, 91, gray),
        label(6, 9, "Optics example", teal)
      ];
      const markers = [];
      let wrapped = 0;
      let longTokens = 0;
      const details = [];
      entries.forEach(({ x, y, en, zh }, index) => {
        const languages = [];
        if (values.language !== "Traditional Chinese") languages.push(["EN", en, teal]);
        if (values.language !== "English") languages.push(["中文", zh, gold]);
        const visible = languages.flatMap(([lang, value, color]) => {
          const lines = wrapLabel(value, values.budget, lang);
          if (lines.length > 1) wrapped += 1;
          if (lines.some(line => textWidth(line) > values.budget)) longTokens += 1;
          details.push(lang + " · " + value + " · " + lines.length + (lines.length === 1 ? " line" : " lines"));
          return lines.map(line => [line, color]);
        });
        const left = Math.max(4, Math.min(x - 8, 91 - values.budget * 0.62));
        const top = Math.max(4, Math.min(y - 8, 94 - 3.8 * visible.length));
        const right = Math.min(94, left + 8 + values.budget * 0.64);
        shapes.push(line(x, y, left, top, "#7595b6"));
        shapes.push(rect(left - 1, top - 1, right - left + 2, 2.2 + visible.length * 3.8, "#142033", "#3d5473"));
        visible.forEach(([line, color], i) => shapes.push(label(left + 1, top + 0.5 + 3.8 * i, clip(line, 48), color)));
        markers.push(marker("bilingual-" + index, x, y, "Label " + (index + 1), en + " / " + zh));
      });
      return {
        summary: "Review line breaks and collisions at the selected language and label width.",
        metrics: [["Label positions", entries.length], ["Wrapped labels", wrapped], ["Over-width tokens", longTokens]],
        details,
        scene: board(shapes, markers)
      };
    }
  });

  function figurePanel(panel, source, mode) {
    const { x, y, w, h, name, index } = panel;
    const shapes = [rect(x, y, w, h, "#172639", "#3c5474")];
    if (source) {
      shapes.push(photo(source, x + 1.5, y + 6, w - 3, h - 8));
    } else {
      const x0 = x + 0.11 * w;
      const x1 = x + 0.92 * w;
      const y0 = y + 0.83 * h;
      const y1 = y + 0.28 * h;
      shapes.push(line(x0, y0, x1, y0), line(x0, y0, x0, y1));
      const points = Array.from({ length: 19 }, (_, tick) => {
        const t = tick / 18;
        const response = mode === "Line series" ? 0.2 + 0.7 * (1 - Math.exp(-t * (2 + index))) : 0.42 + 0.30 * Math.sin(Math.PI * (t + index / 5));
        return [x0 + (x1 - x0) * t, y0 - (y0 - y1) * response];
      });
      if (mode === "Line series") {
        points.slice(1).forEach(([px, py], i) => shapes.push(line(...points[i], px, py, teal)));
      } else {
        points.forEach(([px, py], i) => shapes.push(circle(px, py + Math.sin(i * 2.9) * 1.1, 0.36, gold, gold)));
      }
    }
    shapes.push(label(x + 2, y + 3.8, String.fromCharCode(65 + index) + "  " + clip(name, 32), teal));
    return shapes;
  }

  projects.push({
    number: 20,
    id: "publication-figure",
    title: "Publication figure editor",
    summary: "Assemble figures in a multi-panel layout with editable titles, units, and caption.",
    guide: "Import local images in panel order or use the sample traces. Choose a layout, type each panel title on its own line, and export the composed figure. Drawn text in the preview is abbreviated where the layout is narrow.",
    fields: [
      text("title", "Figure title", "Response across measurement conditions"),
      select("layout", "Layout", ["Two across", "Two stacked", "Four panels"]),
      text("panelTitles", "Panel titles", "Control\nTreatment\nReference\nReplicate", "textarea"),
      select("demoStyle", "Sample figure type", ["Line series", "Scatter"]),
      text("units", "Shared unit note", "Time (s) · normalized response"),
      text("caption", "Figure caption", "Responses under matched measurement conditions.", "textarea")
    ],
    run(values, sources) {
      const count = values.layout === "Four panels" ? 4 : 2;
      const columns = values.layout === "Two stacked" ? 1 : 2;
      const panelRows = count / columns;
      const width = columns === 1 ? 91 : 44;
      const height = panelRows === 1 ? 57 : 27;
      const titles = rows(values.panelTitles);
      const figures = images(sources);
      const shapes = [label(5, 8, clip(values.title, 80), teal), label(5, 82, clip(values.units, 85), gold), label(5, 90, clip(values.caption, 95))];
      const markers = [marker("caption", 91, 91, "Figure caption", values.caption)];
      for (let index = 0; index < count; index += 1) {
        const x = 4.5 + index % columns * 47;
        const y = 15 + Math.floor(index / columns) * 30;
        const name = titles[index] || "Panel " + String.fromCharCode(65 + index);
        shapes.push(...figurePanel({ x, y, w: width, h: height, name, index }, figures[index], values.demoStyle));
        markers.push(marker("panel-" + index, x + width - 2, y + 3, String.fromCharCode(65 + index) + " · " + name, figures[index]?.name || "Synthetic preview"));
      }
      return {
        summary: values.title || "Untitled figure",
        metrics: [["Panels", count], ["Imported panels", Math.min(figures.length, count)], ["Layout", values.layout]],
        details: [values.units, values.caption].filter(Boolean),
        scene: board(shapes, markers)
      };
    }
  });

  const reportBefore = [
    "[data] Response estimate 8.0",
    "[data] Included observations 26",
    "[method] Static baseline",
    "[interpretation] Effect appears uniform"
  ].join("\n");
  const reportAfter = [
    "[data] Response estimate 7.2",
    "[data] Included observations 31",
    "[method] Per-session baseline",
    "[method] Excluded one saturated reading",
    "[interpretation] Effect varies across sessions"
  ].join("\n");
  const revisionKinds = ["Data", "Method", "Interpretation", "Other"];

  function revisionLines(raw) {
    return raw.split(/\r?\n/).slice(0, 300).flatMap((line, index) => {
      const row = line.trim();
      if (!row) return [];
      const tagged = /^\[([a-z]+)\]\s*(.+)$/i.exec(row);
      return [{
        index: index + 1,
        kind: revisionKinds.find(kind => kind.toLowerCase() === tagged?.[1].toLowerCase()) || "Other",
        line: tagged ? tagged[2] : row
      }];
    });
  }

  function revisionDiff(before, after) {
    const key = item => item.kind + "|" + item.line;
    const scores = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
    for (let i = before.length - 1; i >= 0; i -= 1) {
      for (let j = after.length - 1; j >= 0; j -= 1) {
        scores[i][j] = key(before[i]) === key(after[j])
          ? 1 + scores[i + 1][j + 1] : Math.max(scores[i + 1][j], scores[i][j + 1]);
      }
    }
    const diff = [];
    let i = 0;
    let j = 0;
    while (i < before.length || j < after.length) {
      if (i < before.length && j < after.length && key(before[i]) === key(after[j])) {
        i += 1;
        j += 1;
      } else if (j < after.length && (i === before.length || scores[i][j + 1] > scores[i + 1][j])) {
        diff.push({ ...after[j], status: "Added" });
        j += 1;
      } else {
        diff.push({ ...before[i], status: "Removed" });
        i += 1;
      }
    }
    return diff;
  }

  projects.push({
    number: 21,
    id: "source-revisions",
    title: "Source revision timeline",
    summary: "Track additions and removals across two local report revisions with evidence categories.",
    guide: "Enter earlier and later text or import two local text files in that order. Prefix a line with [data], [method], or [interpretation] to make its intent explicit. Switch the filter and move through the changes to review each hunk.",
    fields: [
      text("before", "Earlier version", reportBefore, "textarea"),
      text("after", "Later version", reportAfter, "textarea"),
      select("kind", "Change category", ["All", ...revisionKinds]),
      range("position", "Position in changes", 0, 0, 100, 1, "%")
    ],
    run(values, sources) {
      const before = revisionLines(sourceText(sources, 0, values.before));
      const after = revisionLines(sourceText(sources, 1, values.after));
      const changes = revisionDiff(before, after);
      const filtered = changes.filter(change => values.kind === "All" || change.kind === values.kind);
      const index = Math.round(Math.max(0, filtered.length - 1) * values.position / 100);
      const visible = filtered.slice(Math.max(0, index - 2), index + 4);
      const markers = [];
      const shapes = [
        line(21, 19, 21, 87, gray), line(79, 19, 79, 87, gray),
        label(14, 11, "Earlier", gold), label(72, 11, "Later", teal)
      ];
      visible.forEach((change, row) => {
        const isAdded = change.status === "Added";
        const x = isAdded ? 79 : 21;
        const y = 24 + row * 12;
        const color = isAdded ? teal : gold;
        shapes.push(circle(x, y, 1.25, color, color), line(Math.min(50, x), y, Math.max(50, x), y, color));
        shapes.push(label(29, y - 1.9, change.status + " · " + change.kind + " · line " + change.index, color));
        markers.push(marker("revision-" + change.status + "-" + change.index, x, y, change.kind + " · line " + change.index, change.line));
      });
      if (!visible.length) shapes.push(label(31, 49, "No changes in this category"));
      return {
        summary: filtered.length ? "Change " + (index + 1) + " of " + filtered.length + " · " + filtered[index].status + " · " + filtered[index].line : "No changes in this category.",
        metrics: [["Added lines", filtered.filter(change => change.status === "Added").length], ["Removed lines", filtered.filter(change => change.status === "Removed").length], ["Filter", values.kind]],
        details: visible.map(change => change.status + " · " + change.kind + " · " + change.line),
        scene: board(shapes, markers)
      };
    }
  });
})();
