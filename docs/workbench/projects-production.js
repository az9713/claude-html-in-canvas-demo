(function () {
  "use strict";

  const ink = "#b8c7c4";
  const dim = "#344546";
  const teal = "#72d8c5";
  const gold = "#f7bb74";
  const lavender = "#b8a8ee";
  const rose = "#f7959c";

  const input = (key, label, type, value, extra = {}) => ({ key, label, type, value, ...extra });
  const range = (key, label, value, min, max, step = 1, extra = {}) => (
    input(key, label, "range", value, { min, max, step, ...extra })
  );
  const select = (key, label, value, options) => input(key, label, "select", value, { options });
  const area = (key, label, value) => input(key, label, "textarea", value);
  const useFile = input("useFile", "Use the first imported text file", "checkbox", false);
  const board = (shapes, markers = [], labels = {}) => ({ kind: "board", shapes, markers, ...labels });
  const rect = (x, y, w, h, fill, stroke) => ({ type: "rect", x, y, w, h, fill, stroke });
  const line = (x, y, x2, y2, stroke = dim) => ({ type: "line", x, y, x2, y2, stroke });
  const text = (x, y, label, fill = ink, w = 20, h = 20) => ({ type: "text", x, y, label, fill, w, h });
  const dot = (x, y, r, fill) => ({ type: "circle", x, y, r, fill });
  const pin = (key, x, y, label, detail) => ({ key, x, y, label, detail });
  const crop = (value, n) => {
    const clean = String(value ?? "").replace(/\s+/g, " ").trim();
    return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
  };
  const imageFiles = sources => sources.filter(source => source.kind === "image");
  const mediaFiles = sources => sources.filter(source => source.kind === "image" || source.kind === "video");
  const localText = (sourceText, useImport, sources) => (
    useImport ? (sources.find(source => source.kind === "text")?.text ?? sourceText) : sourceText
  );
  const cellNumber = value => String(value ?? "").trim() ? Number(value) : NaN;
  const format = (value, digits = 2) => Number(value.toFixed(digits)).toString();

  function csv(source, columnCount) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    const saveField = () => {
      row.push(value.trim());
      value = "";
    };
    const saveRow = () => {
      saveField();
      if (row.length === columnCount && row.some(Boolean)) rows.push(row);
      row = [];
    };
    const data = String(source ?? "").slice(0, 160000).replace(/^\uFEFF/, "");
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      if (char === '"') {
        if (quoted && data[i + 1] === '"') { value += '"'; i++; }
        else if (quoted || !value.trim()) quoted = !quoted;
        else value += char;
      } else if (char === "," && !quoted) {
        saveField();
      } else if ((char === "\r" || char === "\n") && !quoted) {
        if (char === "\r" && data[i + 1] === "\n") i++;
        saveRow();
        if (rows.length >= 200) return rows;
      } else {
        value += char;
      }
    }
    if (!quoted && (value || row.length)) saveRow();
    return rows;
  }

  function empty(message, details) {
    return { summary: message, details, scene: board([text(8, 25, "Add valid inputs to continue", ink, 80)]) };
  }

  const projects = [
    {
      number: 22,
      id: "literature-measurement-map",
      title: "Literature map by measurement",
      summary: "Compare studies by measurement scale, result, and conditions.",
      guide: "Use one unit system for the horizontal and vertical axes. Enter or import CSV with study, scale, result, and conditions. The starting rows are synthetic. Select a marker to attach a source page or an exclusion note.",
      fields: [
        area("studies", "Measurements (CSV)", "study,scale,result,conditions\nSample A,0.02,5.3,ambient humidity\nSample B,0.12,6.4,ambient humidity\nSample C,0.65,11.2,dry chamber\nSample D,3.20,12.4,dry chamber\nSample E,15.4,12.1,ambient humidity"),
        useFile,
        input("condition", "Filter conditions", "text", ""),
        input("scaleLabel", "Measurement scale", "text", "Probe diameter (mm)"),
        input("resultLabel", "Reported quantity", "text", "Signal (relative units)"),
        input("log", "Use logarithmic scale", "checkbox", true)
      ],
      run(values, sources) {
        const conditions = values.condition.trim().toLowerCase();
        const rows = csv(localText(values.studies, values.useFile, sources), 4)
          .map(([name, scale, result, condition]) => ({ name, scale: cellNumber(scale), result: cellNumber(result), condition }))
          .filter(row => row.name && Number.isFinite(row.scale) && Number.isFinite(row.result))
          .filter(row => row.condition.toLowerCase().includes(conditions) && (!values.log || row.scale > 0));
        if (!rows.length) return empty("No papers match the current filters.", ["Rows need a study name, numeric scale, and numeric result.", "A logarithmic scale requires positive measurements."]);
        const x = row => values.log ? Math.log10(row.scale) : row.scale;
        const results = rows.map(row => row.result);
        const groups = new Set(rows.map(row => row.condition));
        return {
          summary: `${rows.length} ${rows.length === 1 ? "measurement" : "measurements"} across ${groups.size} experimental condition ${groups.size === 1 ? "group" : "groups"}.`,
          metrics: [["Lowest reported result", format(Math.min(...results))], ["Highest reported result", format(Math.max(...results))]],
          details: [
            ...(rows.length > 20 ? ["The plot shows the first 20 matching rows."] : []),
            ...rows.map(row => `${row.name} · scale ${row.scale} · result ${row.result} · ${row.condition || "Conditions unspecified"}`)
          ],
          scene: {
            kind: "plot", xLabel: values.log ? `log₁₀ ${values.scaleLabel}` : values.scaleLabel,
            yLabel: values.resultLabel,
            series: rows.slice(0, 20).map((row, index) => ({ label: crop(row.name, 24), color: index % 2 ? gold : teal, points: [[x(row), row.result]] })),
            markers: rows.slice(0, 20).map((row, index) => pin(`study-${index}`, x(row), row.result, crop(row.name, 36), `${row.condition || "Conditions unspecified"} · scale ${row.scale}`))
          }
        };
      }
    },
    {
      number: 23,
      id: "prompt-regression-replay",
      title: "Prompt regression replay",
      summary: "Replay the first changed segment of two local model runs.",
      guide: "Paste the exact prompts and outputs from two runs, or import a JSON object with baselinePrompt, candidatePrompt, baselineOutput, and candidateOutput. Alignment is a local token or line diff. Record the first consequential change in an annotation.",
      fields: [
        area("baselinePrompt", "Baseline prompt", "Summarize the experiment. List the reported sample size."),
        area("candidatePrompt", "Candidate prompt", "Summarize the experiment. Report the sample size only if stated."),
        area("baselineOutput", "Baseline output", "The study measures response under three illumination levels.\nThe sample size was 12.\nThe largest response occurred at the middle setting."),
        area("candidateOutput", "Candidate output", "The study measures response under three illumination levels.\nThe sample size was not reported.\nThe largest response occurred at the middle setting."),
        useFile,
        select("target", "Compare", "Outputs", ["Outputs", "Prompts"]),
        select("unit", "Align by", "Lines", ["Lines", "Tokens"]),
        range("position", "Replay position", 50, 0, 100, 1, { playback: true })
      ],
      run(values, sources) {
        let example = values;
        let fileIssue;
        if (values.useFile) {
          try {
            const data = JSON.parse(sources.find(source => source.kind === "text")?.text ?? "{}");
            const keys = ["baselinePrompt", "candidatePrompt", "baselineOutput", "candidateOutput"];
            if (!keys.every(key => typeof data?.[key] === "string")) throw new Error();
            example = { ...values, ...Object.fromEntries(keys.map(key => [key, data[key]])) };
          } catch {
            fileIssue = "The imported JSON needs all four text fields. Showing the editable comparison.";
          }
        }
        const tokenize = value => values.unit === "Lines" ? value.split(/\r?\n/) : (value.match(/\S+/g) ?? []);
        const suffix = values.target === "Outputs" ? "Output" : "Prompt";
        const fullBase = tokenize(example["baseline" + suffix]);
        const fullNext = tokenize(example["candidate" + suffix]);
        const edits = align(fullBase.slice(0, 400), fullNext.slice(0, 400));
        const changeIndex = edits.findIndex(edit => edit.kind !== "=");
        const selected = Math.min(edits.length - 1, Math.floor(values.position / 100 * edits.length));
        const windowStart = Math.max(0, Math.min(selected - 2, edits.length - 5));
        const active = edits[selected];
        const omitted = fullBase.length > 400 || fullNext.length > 400;
        const difference = edits.filter(edit => edit.kind !== "=").length;
        const shapes = [text(6, 13, "Baseline"), text(53, 13, "Candidate"), line(50, 9, 50, 92)];
        edits.slice(windowStart, windowStart + 5).forEach((edit, i) => {
          const y = 22 + i * 14;
          const bg = edit.kind === "=" ? "#263a39" : "#473425";
          shapes.push(rect(5, y, 90, 11, bg, windowStart + i === selected ? teal : undefined));
          shapes.push(text(7, y + 3, crop(edit.from, 27), ink, 41, 8), text(53, y + 3, crop(edit.to, 27), ink, 40, 8));
        });
        return {
          summary: changeIndex < 0 ? "The aligned comparison is identical." : `The first change is at alignment step ${changeIndex + 1}.`,
          metrics: [["Baseline segments", fullBase.length], ["Candidate segments", fullNext.length], ["Change operations", difference], ["Replay step", Math.max(0, selected + 1)]],
          details: [
            fileIssue,
            omitted ? "Alignment is limited to the first 400 segments from each run." : null,
            active ? `Baseline at this step · ${active.from || "(no segment)"}` : null,
            active ? `Candidate at this step · ${active.to || "(no segment)"}` : null
          ].filter(Boolean),
          scene: board(shapes, changeIndex < 0 ? [] : [
            pin("first-change", 50, 89, "First change", edits[changeIndex].from || edits[changeIndex].to)
          ])
        };
      }
    },
    {
      number: 24,
      id: "retrieval-review-workbench",
      title: "Retrieval review workbench",
      summary: "Audit an answer sentence against the passages seen by the model.",
      guide: "Enter one claim per line. Separate passages with blank lines, or import them as a text file. Shared-term scores only rank the passages for manual inspection. Choose a review verdict and annotate why the evidence supports it.",
      fields: [
        area("answer", "Answer claims", "The tests ran at room temperature.\nThe paper used a sample of 12.\nMeasured signal decreased at the last setting."),
        area("passages", "Retrieved passages", "[S1] All runs began at room temperature in the same test chamber.\n\n[S2] Signal increased from the first to the middle setting and decreased at the last setting.\n\n[S3] Sample count was omitted from the report."),
        useFile,
        range("claim", "Claim number", 1, 1, 30),
        range("threshold", "Review cue threshold (%)", 40, 0, 100),
        select("verdict", "Manual verdict", "Unreviewed", ["Unreviewed", "Supported", "Partly supported", "Unsupported", "Contradicted"])
      ],
      run(values, sources) {
        const claims = values.answer.split(/\r?\n/).map(item => item.trim()).filter(Boolean).slice(0, 30);
        if (!claims.length) return empty("Enter at least one answer claim.", []);
        const index = Math.min(values.claim, claims.length) - 1;
        const claim = claims[index];
        const words = terms(claim);
        const passages = localText(values.passages, values.useFile, sources)
          .split(/\r?\n\s*\r?\n/).map(item => item.trim()).filter(Boolean).slice(0, 50);
        const ranked = passages.map((passage, rank) => {
          const passageWords = terms(passage);
          const shared = [...words].filter(word => passageWords.has(word));
          return { passage, rank, shared, score: words.size ? Math.round(shared.length / words.size * 100) : 0 };
        }).sort((a, b) => b.score - a.score || a.rank - b.rank);
        const shapes = [text(7, 11, "Passage overlap with selected claim", ink, 84)];
        const markers = [];
        ranked.slice(0, 5).forEach((row, i) => {
          const y = 22 + i * 13;
          shapes.push(text(7, y + 4, `P${row.rank + 1}`), rect(20, y, 65, 8, dim));
          if (row.score) shapes.push(rect(20, y, row.score * 0.65, 8, row.score >= values.threshold ? teal : gold));
          shapes.push(text(87, y + 2, `${row.score}%`, ink, 12));
          markers.push(pin(`claim-${index}-passage-${row.rank}`, 19, y + 4, `Passage ${row.rank + 1}`, row.passage));
        });
        const cutoff = 20 + values.threshold * 0.65;
        shapes.push(line(cutoff, 20, cutoff, 84, rose));
        return {
          summary: `Claim ${index + 1} of ${claims.length} · ${values.verdict}`,
          metrics: [["Passages", passages.length], ["At or above cue", ranked.filter(row => row.score >= values.threshold).length], ["Best overlap", `${ranked[0]?.score ?? 0}%`]],
          details: [claim, ...ranked.slice(0, 5).flatMap(row => [
            `P${row.rank + 1} · shared terms ${row.shared.join(", ") || "none"}`, row.passage
          ])],
          scene: board(shapes, markers)
        };
      }
    },
    {
      number: 25,
      id: "ui-screenshot-review",
      title: "UI screenshot review",
      summary: "Compare release screenshots and document the exact region that changed.",
      guide: "Import two screenshots with matching dimensions. Pick their source numbers in import order, then switch between a wipe, split view, and difference. Use the review location and notes to record where to reproduce the issue. The built-in illustration shows a sample layout regression.",
      fields: [
        range("before", "Before image number", 1, 1, 12),
        range("after", "After image number", 2, 1, 12),
        select("view", "Comparison", "Wipe", ["Wipe", "Split", "Difference"]),
        range("position", "Wipe position (%)", 46, 0, 100),
        input("viewport", "Viewport", "text", "390 × 844"),
        input("build", "Build or change", "text", "Candidate A"),
        range("x", "Review location across (%)", 68, 0, 100),
        range("y", "Review location down (%)", 46, 0, 100),
        area("repro", "How to reproduce", "Open the search form and enter a two-line query.")
      ],
      run(values, sources) {
        const images = imageFiles(sources);
        const before = images[values.before - 1];
        const after = images[values.after - 1];
        const markers = [pin("review-spot", values.x, values.y, "Review location", values.repro)];
        const mode = values.view.toLowerCase();
        const example = !before || !after;
        return {
          summary: example ? "Illustrated example · import two screenshots for a pixel comparison." : `${before.name} and ${after.name}`,
          metrics: [["Viewport", values.viewport || "Unspecified"], ["Build", values.build || "Unspecified"], ["Comparison", values.view]],
          details: [values.repro, `Review location · ${values.x}% across, ${values.y}% down`].filter(Boolean),
          scene: example ? board(syntheticComparison(mode, values.position), markers) : {
            kind: "compare", left: before.id, right: after.id, mode, position: values.position,
            leftLabel: "Before", rightLabel: "After", markers
          }
        };
      }
    },
    {
      number: 26,
      id: "ci-timing-explorer",
      title: "CI timing explorer",
      summary: "Find slow stages and compare overlapping jobs across two builds.",
      guide: "Use CSV with run, job, start_seconds, duration_seconds, and status. Enter Base or Candidate as each run name. The time axis starts at zero. Import a local CSV or edit the synthetic runs, then move the time cursor and inspect the active jobs.",
      fields: [
        area("jobs", "Job events (CSV)", "run,job,start_seconds,duration_seconds,status\nBase,Checkout,0,10,passed\nBase,Compile,10,45,passed\nBase,Unit tests,20,27,passed\nBase,Package,55,14,passed\nCandidate,Checkout,0,11,passed\nCandidate,Compile,11,71,passed\nCandidate,Unit tests,24,33,failed\nCandidate,Package,82,15,skipped"),
        useFile,
        input("job", "Filter by job name", "text", ""),
        range("playhead", "Time cursor (%)", 52, 0, 100, 1, { playback: true })
      ],
      run(values, sources) {
        const rows = csv(localText(values.jobs, values.useFile, sources), 5)
          .map(([run, name, start, length, status]) => ({ run: run.toLowerCase(), name, start: cellNumber(start), length: cellNumber(length), status }))
          .filter(row => ["base", "candidate"].includes(row.run) && row.name && Number.isFinite(row.start) && Number.isFinite(row.length) && row.start >= 0 && row.length > 0 && Number.isFinite(row.start + row.length));
        if (!rows.length) return empty("No valid job events.", ["Use Base or Candidate as the run name, a nonnegative start time, and a positive duration."]);
        const base = rows.filter(row => row.run === "base");
        const next = rows.filter(row => row.run === "candidate");
        const baseLength = Math.max(0, ...base.map(row => row.start + row.length));
        const nextLength = Math.max(0, ...next.map(row => row.start + row.length));
        const end = Math.max(baseLength, nextLength);
        const x = t => 25 + 69 * (t / end);
        const playhead = end * (values.playhead / 100);
        const filter = values.job.trim().toLowerCase();
        const visible = rows.filter(row => row.name.toLowerCase().includes(filter));
        const displayed = visible.slice(0, 11);
        const active = visible.filter(row => row.start <= playhead && playhead < row.start + row.length);
        const shapes = [text(7, 12, "Run / job"), text(25, 12, "0 s"), text(83, 12, `${format(end, 1)} s`)];
        const markers = [];
        displayed.forEach((row, i) => {
          const y = 20 + i * (68 / Math.max(displayed.length, 6));
          const color = row.status.toLowerCase() === "failed" ? rose : row.run === "base" ? teal : gold;
          shapes.push(text(5, y + 2, `${row.run === "base" ? "B" : "C"} · ${crop(row.name, 17)}`));
          shapes.push(rect(x(row.start), y, Math.max(0.6, x(row.start + row.length) - x(row.start)), 4, color));
          markers.push(pin(`job-${rows.indexOf(row)}`, x(row.start + row.length / 2), y + 2, row.name, `${row.run} · ${format(row.length)} s · ${row.status}`));
        });
        shapes.push(line(x(playhead), 16, x(playhead), 91, lavender));
        const delta = nextLength - baseLength;
        return {
          summary: base.length && next.length ? `Candidate wall time changed by ${delta >= 0 ? "+" : ""}${format(delta)} seconds.` : "Showing the available run.",
          metrics: [["Base duration", `${format(baseLength)} s`], ["Candidate duration", `${format(nextLength)} s`], ["Time cursor", `${format(playhead)} s`], ["Jobs active at cursor", active.length]],
          details: [
            "B labels mark Base jobs. C labels mark Candidate jobs. Pink marks a failed job.",
            ...active.map(row => `${row.run} · ${row.name} · ${format(row.start)}–${format(row.start + row.length)} s · ${row.status}`),
            visible.length > displayed.length ? "The timeline shows the first eleven matching jobs. Narrow the filter to inspect later jobs." : null
          ].filter(Boolean),
          scene: board(shapes, markers)
        };
      }
    },
    {
      number: 27,
      id: "local-hardware-tradeoff-plot",
      title: "Local hardware trade-off plot",
      summary: "Select a local model configuration within a memory and accuracy budget.",
      guide: "Enter or import CSV with configuration, memory_gib, throughput_tokens_per_second, and score_percent. Use measurements collected under the same workload. The frontier marks configurations with no feasible competitor that uses less or equal memory and offers greater or equal throughput.",
      fields: [
        area("runs", "Benchmark runs (CSV)", "configuration,memory_gib,throughput_tokens_per_second,score_percent\nSmall Q4,3.6,52,62\nSmall Q8,6.2,43,70\nMedium Q4,5.8,49,78\nMedium Q6,8.4,38,82\nMedium tuned,7.8,61,83\nLarge Q4,11.7,29,87"),
        useFile,
        range("budget", "Maximum memory (GiB)", 12, 1, 128, 0.5),
        range("floor", "Minimum score (%)", 70, 0, 100),
        select("priority", "Select by", "Throughput", ["Throughput", "Score", "Lowest memory"])
      ],
      run(values, sources) {
        const rows = csv(localText(values.runs, values.useFile, sources), 4)
          .map(([name, memory, throughput, score]) => ({ name, memory: cellNumber(memory), throughput: cellNumber(throughput), score: cellNumber(score) }))
          .filter(row => row.name && Number.isFinite(row.memory) && row.memory > 0 && Number.isFinite(row.throughput) && row.throughput >= 0 && Number.isFinite(row.score) && row.score >= 0 && row.score <= 100);
        if (!rows.length) return empty("No valid benchmark rows.", ["Enter positive memory, nonnegative throughput, and a score from 0 to 100."]);
        const eligible = rows.filter(row => row.memory <= values.budget && row.score >= values.floor);
        const sortByPriority = {
          Throughput: (a, b) => b.throughput - a.throughput || b.score - a.score,
          Score: (a, b) => b.score - a.score || b.throughput - a.throughput,
          "Lowest memory": (a, b) => a.memory - b.memory || b.score - a.score
        };
        const preferred = [...eligible].sort(sortByPriority[values.priority])[0];
        const frontier = eligible.filter(row => !eligible.some(other => (
          other.memory <= row.memory && other.throughput >= row.throughput &&
          (other.memory < row.memory || other.throughput > row.throughput)
        ))).sort((a, b) => a.memory - b.memory);
        const xy = row => [row.memory, row.throughput];
        const series = [{ label: "Eligible frontier", color: teal, points: frontier.map(xy) }];
        for (const row of rows.slice(0, 24)) {
          series.push({ label: crop(row.name, 20), color: eligible.includes(row) ? teal : gold, points: [xy(row)] });
        }
        return {
          summary: preferred ? `${preferred.name} leads among the configurations that meet your constraints.` : "No configuration fits both limits.",
          metrics: [["Eligible configurations", eligible.length], ["On the frontier", frontier.length], ["Selected score", preferred ? `${preferred.score}%` : "—"]],
          details: eligible.map(row => `${row.name} · ${row.memory} GiB · ${row.throughput} tokens/s · score ${row.score}%`),
          scene: {
            kind: "plot", xLabel: "Peak memory (GiB)", yLabel: "Throughput (tokens/s)", series,
            markers: rows.slice(0, 24).map((row, i) => pin(`config-${i}`, row.memory, row.throughput, crop(row.name, 25), `Score ${row.score}% · ${eligible.includes(row) ? "Eligible" : "Outside current limits"}`))
          }
        };
      }
    },
    {
      number: 28,
      id: "animation-continuity-review",
      title: "Animation continuity review",
      summary: "Compare selected frames across a cut and record continuity issues.",
      guide: "Import two stills or two local video clips. Source numbers follow import order. Video times are seconds within each loaded clip. Enter the exposure readings and screen direction for each frame, then review the matched pair. The illustration supplies two sample setups without files.",
      fields: [
        range("left", "Shot A source number", 1, 1, 12),
        range("right", "Shot B source number", 2, 1, 12),
        input("timeA", "Shot A time (s)", "number", 1.2, { min: 0, max: 7200, step: 0.01 }),
        input("timeB", "Shot B time (s)", "number", 2.4, { min: 0, max: 7200, step: 0.01 }),
        range("exposureA", "Shot A exposure (stops)", 0, -6, 6, 0.1),
        range("exposureB", "Shot B exposure (stops)", 1, -6, 6, 0.1),
        select("directionA", "Shot A screen direction", "Right", ["Left", "Centered", "Right"]),
        select("directionB", "Shot B screen direction", "Left", ["Left", "Centered", "Right"]),
        select("match", "Expected direction at the cut", "Same direction", ["Same direction", "Opposite direction", "Either is acceptable"]),
        range("tolerance", "Exposure tolerance (stops)", 0.5, 0, 4, 0.1),
        area("note", "Continuity observation", "Compare eyeline height and light direction before considering a grade update.")
      ],
      run(values, sources) {
        const files = mediaFiles(sources);
        const a = files[values.left - 1];
        const b = files[values.right - 1];
        const delta = Math.abs(values.exposureB - values.exposureA);
        const sameDirection = values.directionA === values.directionB;
        const directional = values.match === "Same direction" ? !sameDirection :
          values.match === "Opposite direction" && (sameDirection || [values.directionA, values.directionB].includes("Centered"));
        const findings = [];
        if (delta - values.tolerance > 1e-9) findings.push("Exposure jump above review tolerance.");
        if (directional) findings.push("Screen direction differs from your expectation for this cut.");
        const markers = [
          pin("shot-a", 24, 80, "Shot A review", `${values.timeA}s · ${values.directionA} · ${values.exposureA} stops`),
          pin("shot-b", 73, 80, "Shot B review", `${values.timeB}s · ${values.directionB} · ${values.exposureB} stops`)
        ];
        const side = (media, x, t, direction, tint) => {
          if (media) return [{ type: "image", x, y: 18, w: 42, h: 57, source: media.id, time: t }];
          const eye = direction === "Left" ? x + 15 : direction === "Right" ? x + 27 : x + 21;
          return [
            rect(x, 18, 42, 57, "#202e31", dim),
            line(x + 4, 46, x + 38, 46, tint),
            dot(x + 21, 46, 6, tint),
            dot(eye, 45, 0.8, "#152524"),
            text(x + 4, 69, "Illustration")
          ];
        };
        const scene = a?.kind === "image" && b?.kind === "image" ? {
          kind: "compare", left: a.id, right: b.id, mode: "split", leftLabel: "Shot A", rightLabel: "Shot B", markers
        } : board([
          text(6, 12, "Shot A", teal), text(53, 12, "Shot B", gold),
          ...side(a, 5, values.timeA, values.directionA, teal), ...side(b, 53, values.timeB, values.directionB, gold)
        ], markers);
        return {
          summary: findings.length ? `${findings.length} continuity checks need review.` : "The entered exposure and direction pass the selected checks.",
          metrics: [["Exposure change", `${format(delta)} stops`], ["Shot A direction", values.directionA], ["Shot B direction", values.directionB]],
          details: [...findings, values.note].filter(Boolean),
          scene
        };
      }
    },
    {
      number: 29,
      id: "narrated-tutorial-maker",
      title: "Narrated tutorial maker",
      summary: "Compose local footage or a sample motion study with timed captions and measurements.",
      guide: "Enter one cue per line as seconds | caption | measurement. Import a still or local video to replace the sample motion study. Play the scene to check cue changes, save a composed frame, or record the visual canvas as WebM. Source audio stays in the original file.",
      fields: [
        input("title", "Title", "text", "Uniform motion and distance"),
        area("cues", "Timed captions", "0 | Start the timer as the marker crosses zero. | 0.0 m\n3 | The marker travels the same distance each second. | 1.5 m\n7 | Divide the measured distance by elapsed time. | 3.5 m\n10 | The speed is 0.5 m/s. | 5.0 m"),
        useFile,
        range("media", "Background source number", 1, 1, 12),
        input("duration", "Scene length (s)", "number", 12, { min: 1, max: 600, step: 1 }),
        range("time", "Scene playhead (%)", 33, 0, 100, 1, { playback: true, durationKey: "duration" }),
        select("placement", "Caption placement", "Bottom", ["Bottom", "Top"]),
        select("theme", "Caption background", "Dark", ["Dark", "Light"])
      ],
      run(values, sources) {
        const time = values.duration * values.time / 100;
        const cues = localText(values.cues, values.useFile, sources).split(/\r?\n/).slice(0, 200).map(row => {
          const [start, caption, measurement] = row.split("|").map(cell => cell.trim());
          return { start: cellNumber(start), caption, measurement };
        }).filter(row => Number.isFinite(row.start) && row.start >= 0 && row.caption && row.start <= values.duration)
          .sort((a, b) => a.start - b.start);
        const cue = cues.filter(row => row.start <= time).at(-1);
        const next = cues.find(row => row.start > time);
        const source = mediaFiles(sources)[values.media - 1];
        const shapes = [
          text(5, 7, crop(values.title || "Untitled tutorial", 54), teal, 90, 8),
          rect(5, 15, 90, 60, "#142625", dim)
        ];
        if (source) {
          shapes.push({ type: "image", x: 5, y: 15, w: 90, h: 60, source: source.id, time });
        } else {
          shapes.push(line(15, 52, 85, 52, ink));
          for (const distance of [0, 1, 2, 3, 4, 5, 6]) {
            const x = 15 + 70 * distance / 6;
            shapes.push(line(x, 48, x, 55, ink), text(x, 60, `${distance} m`));
          }
          shapes.push(dot(15 + 70 * time / values.duration, 46, 2.9, gold));
        }
        const captionY = values.placement === "Top" ? 16 : 60;
        const dark = values.theme === "Dark";
        const captionInk = dark ? "#eef7f5" : "#182b2a";
        if (cue) {
          shapes.push(rect(7, captionY, 86, 15, dark ? "#162824" : "#e6eeea"),
            text(10, captionY + 3, crop(cue.caption, 96), captionInk, cue.measurement ? 63 : 80, 11));
          if (cue.measurement) shapes.push(text(76, captionY + 3, crop(cue.measurement, 10), dark ? gold : "#454d1f", 16, 11));
        }
        const tx = sec => 8 + sec / values.duration * 84;
        shapes.push(line(tx(0), 86, tx(values.duration), 86, dim));
        for (const row of cues) shapes.push(line(tx(row.start), 83, tx(row.start), 90, teal));
        shapes.push(dot(tx(time), 86, 1.4, gold), text(8, 93, `${format(time, 1)} / ${format(values.duration, 1)} s`));
        return {
          summary: cue?.caption ?? "No caption is active at this time.",
          metrics: [
            ["Current time", `${format(time, 2)} s`], ["Cue measurement", cue?.measurement || "—"],
            ...(source ? [] : [["Calculated position", `${format(6 * time / values.duration)} m`]]),
            ["Cues", cues.length], ["Next cue", next ? `${format(next.start)} s` : "—"]
          ],
          details: source ? [`Local background · ${source.name}`] : ["The sample marker traverses the ruler at a constant rate over the configured duration."],
          scene: board(shapes, cues.slice(0, 16).map((row, i) => pin(`cue-${i}`, tx(row.start), 87, `${row.start}s`, row.caption)))
        };
      }
    },
    {
      number: 30,
      id: "responsive-layout-comparison",
      title: "Responsive layout comparison",
      summary: "See how shared form content and box geometry behave at three widths.",
      guide: "This preview models a monospace form template with fixed rules for its label and field widths. Change the shared text, padding, and stacking breakpoint. The preview reports actual allocations in its model. Use a browser to inspect a production component with different CSS.",
      fields: [
        input("narrow", "Narrow viewport (px)", "number", 320, { min: 160, max: 1800, step: 1 }),
        input("middle", "Middle viewport (px)", "number", 500, { min: 160, max: 1800, step: 1 }),
        input("wide", "Wide viewport (px)", "number", 840, { min: 160, max: 1800, step: 1 }),
        input("breakpoint", "Stack below (px)", "number", 520, { min: 160, max: 1800, step: 1 }),
        range("padding", "Horizontal padding (px)", 24, 0, 80),
        input("label", "Field label", "text", "Where should the receipt be sent?"),
        input("field", "Field value", "text", "billing@example.invalid"),
        input("error", "Validation text", "text", "Please confirm this address before continuing."),
        input("wrap", "Break long unspaced words", "checkbox", false)
      ],
      run(values) {
        const layouts = [values.narrow, values.middle, values.wide].map(width => previewForm(width, values));
        const shapes = [];
        const markers = [];
        layouts.forEach((item, i) => {
          const x = 3 + 33 * i;
          const outer = 28;
          const inset = 2;
          const usable = outer - inset * 2;
          const y = 31;
          const tint = item.overflow ? rose : teal;
          shapes.push(text(x, 15, `${item.width}px`), rect(x, 22, outer, 68, "#1b2c2b", dim));
          if (item.stacked) {
            shades(shapes, x + inset, y, usable, item.labelLines, tint, 8);
            shapes.push(rect(x + inset, 56, usable, 9, "#243d38", tint));
          } else {
            const labelW = usable * 0.35;
            shades(shapes, x + inset, y, labelW, item.labelLines, tint, 8);
            shapes.push(rect(x + inset + labelW + 2, y, usable - labelW - 2, 9, "#243d38", tint));
          }
          shades(shapes, x + inset, 73, usable, item.errorLines, gold, 3);
          markers.push(pin(`layout-${i}`, x + outer / 2, 93, `${item.width}px`, `${item.stacked ? "Stacked" : "Inline"} · ${item.overflow ? "Overflow" : "Fits"}`));
        });
        return {
          summary: `${layouts.filter(item => item.overflow).length} of three viewports have a text or control overflow.`,
          metrics: layouts.map(item => [`${item.width}px`, item.stacked ? "Stacked" : "Inline"]),
          details: layouts.map(item => [
            `${item.width}px · ${item.labelWidth}px label / ${item.fieldWidth}px field · ${item.labelLines} label lines / ${item.errorLines} message lines`,
            item.overflow ? item.reasons.join(", ") : "No overflow"
          ].join(" · ")),
          scene: board(shapes, markers)
        };
      }
    },
    {
      number: 31,
      id: "device-interface-simulator",
      title: "Device interface simulator",
      summary: "Rehearse the controls, limits, and interlocks of a mock tabletop chamber.",
      guide: "Use the action buttons to power on, confirm a target, start, and advance the simulated cycle. Changing an armed target requires confirmation again. The clearance and viewpoint settings let you review whether the panel would be readable and reachable. This model controls only its own on-screen state.",
      fields: [
        select("state", "Simulated state", "Off", ["Off", "Standby", "Ready", "Running", "Complete"]),
        select("profile", "Profile", "Standard", ["Gentle", "Standard", "Fast"]),
        range("target", "Target reading", 45, 20, 75),
        range("reading", "Current reading", 22, 20, 75),
        input("closed", "Door closed", "checkbox", true),
        select("armed", "Confirmed target", "Unconfirmed", ["Unconfirmed", ...Array.from({ length: 56 }, (_, index) => String(index + 20))]),
        range("recess", "Panel recess (cm)", 6, 0, 35),
        range("reach", "Available reach (cm)", 23, 6, 60),
        select("view", "Viewpoint", "Front", ["Front", "From above", "Oblique"]),
        input("event", "Operator log", "text", "Power is off.")
      ],
      actions: [
        { label: "Toggle power", run(values) {
          return values.state === "Off" ? { state: "Standby", event: "Power on. Set a target and confirm it." } :
            { state: "Off", armed: "Unconfirmed", event: "Power off. Any active cycle was stopped." };
        } },
        { label: "Confirm target", run(values) {
          const max = profileMax[values.profile];
          if (values.state === "Off" || values.state === "Running") return { event: "Target can be confirmed only while powered on and idle." };
          if (values.target > max) return { event: `This profile allows a target up to ${max}.` };
          return { state: "Ready", armed: String(values.target), event: `Target ${values.target} confirmed.` };
        } },
        { label: "Start cycle", run(values) {
          if (values.state !== "Ready") return { event: "Turn on the chamber and confirm a target first." };
          if (!values.closed) return { event: "Close the door before starting." };
          if (String(values.target) !== values.armed || values.target > profileMax[values.profile]) return { event: "Confirm the target again after an adjustment." };
          return { state: "Running", event: "Cycle started." };
        } },
        { label: "Advance cycle", run(values) {
          if (values.state !== "Running") return { event: "Start a cycle before advancing it." };
          if (!values.closed || String(values.target) !== values.armed || values.target > profileMax[values.profile]) {
            return { state: "Standby", armed: "Unconfirmed", event: "Interlock stopped the cycle. Check the door and confirm the target." };
          }
          const step = { Gentle: 2, Standard: 4, Fast: 7 }[values.profile];
          const reading = values.reading + Math.sign(values.target - values.reading) * Math.min(Math.abs(values.target - values.reading), step);
          if (reading === values.target) return { reading, state: "Complete", event: "Cycle complete. Reading reached the target." };
          return { reading, event: `Cycle advanced. Current reading ${reading}.` };
        } }
      ],
      run(values) {
        const reachRemaining = values.reach - values.recess - 7;
        const skew = values.view === "Oblique" ? 16 : values.view === "From above" ? -8 : 0;
        const box = [
          { type: "polygon", points: [[8 + skew, 13], [91, 13], [91 - skew / 2, 87], [8, 87]],
            fill: "#182926", stroke: teal },
          rect(27 + skew / 2, 24, 48 - Math.abs(skew / 2), 32, "#101b1a", dim),
          text(32 + skew / 2, 35, values.state, values.state === "Running" ? gold : teal),
          text(32 + skew / 2, 47, `Reading ${values.reading} / Target ${values.target}`, ink, 39 - Math.abs(skew / 2)),
          rect(29, 66, 16, 11, dim), text(31, 72, "Power"),
          rect(47, 66, 12, 11, dim), text(49, 72, "Set"),
          rect(61, 66, 16, 11, dim), text(63, 72, "Start"),
          dot(82, 71, 1.8, values.closed ? teal : rose)
        ];
        return {
          summary: values.event || values.state,
          metrics: [["State", values.state], ["Door", values.closed ? "Closed" : "Open"], ["Profile maximum", profileMax[values.profile]], ["Reach margin", `${reachRemaining} cm`]],
          details: [
            reachRemaining >= 0 ? "The chosen reach covers this simulated recess and a 7 cm control allowance." :
              "The control recess exceeds the chosen reach and allowance.",
            `Cycle profile · ${values.profile} · confirmed target ${values.armed}`
          ],
          scene: board(box, [
            pin("display", 50, 27, "Display", `${values.state} · ${values.reading}`),
            pin("controls", 49, 79, "Control reach", `${reachRemaining} cm margin`)
          ])
        };
      }
    }
  ];

  const profileMax = { Gentle: 45, Standard: 60, Fast: 75 };

  // An LCS table keeps unchanged tokens aligned after an insertion or deletion.
  function align(from, to) {
    const columns = to.length + 1;
    const lcs = new Uint16Array((from.length + 1) * columns);
    for (let i = from.length - 1; i >= 0; i--) {
      for (let j = to.length - 1; j >= 0; j--) {
        const slot = i * columns + j;
        lcs[slot] = from[i] === to[j] ? 1 + lcs[slot + columns + 1] : Math.max(lcs[slot + columns], lcs[slot + 1]);
      }
    }
    const result = [];
    let i = 0;
    let j = 0;
    while (i < from.length || j < to.length) {
      if (i < from.length && j < to.length && from[i] === to[j]) {
        result.push({ kind: "=", from: from[i++], to: to[j++] });
      } else if (i < from.length && (j === to.length || lcs[(i + 1) * columns + j] >= lcs[i * columns + j + 1])) {
        result.push({ kind: "-", from: from[i++], to: "" });
      } else {
        result.push({ kind: "+", from: "", to: to[j++] });
      }
    }
    return result;
  }

  const stopWords = new Set(["the","was","and","for","from","that","this","with","into","were","are","its","had","has"]);
  function terms(value) {
    const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    return new Set(words.filter(word => !stopWords.has(word) && (word.length > 2 || /^\d+$/.test(word))));
  }

  function syntheticComparison(mode, position) {
    const frame = [rect(14, 10, 72, 80, "#192826", dim), text(18, 19, "Synthetic search form", teal, 64)];
    if (mode === "difference") {
      return [...frame, rect(27, 38, 45, 12, dim), rect(62, 38, 13, 25, rose), text(24, 76, "Highlighted sample shift", rose, 58)];
    }
    if (mode === "split") {
      return [...frame, text(23, 31, "Before"), text(62, 31, "After"), line(50, 24, 50, 79),
        rect(19, 39, 20, 9, dim), rect(39, 39, 6, 9, teal), rect(55, 39, 27, 11, dim),
        rect(72, 52, 10, 9, gold), text(20, 66, "Inline"), text(56, 66, "Wraps")];
    }
    const boundary = 18 + position * 0.64;
    return [...frame, rect(20, 37, 60, 14, dim), rect(20, 58, 60, 8, "#253635"),
      boundary > 61 ? rect(61, 37, Math.min(19, boundary - 61), 14, teal) : null,
      boundary < 80 ? rect(Math.max(61, boundary), 54, 80 - Math.max(61, boundary), 10, gold) : null,
      line(boundary, 25, boundary, 75, lavender), text(19, 79, `Wipe ${position}%`)].filter(Boolean);
  }

  // The model uses a 14 px monospace font with an 8 px nominal advance.
  function measure(value) {
    return [...value].reduce((width, char) => width + (/[^\u0000-\u024f]/u.test(char) ? 16 : 8), 0);
  }

  function measureWrapping(textValue, width, breakWords) {
    const words = textValue.trim().split(/\s+/).filter(Boolean);
    const limit = Math.max(1, width);
    let lines = words.length ? 1 : 0;
    let available = limit;
    let overflow = false;
    for (const word of words) {
      let wordWidth = measure(word);
      if (wordWidth <= available) {
        available -= wordWidth + 8;
        continue;
      }
      if (available < limit) lines++;
      if (wordWidth > limit) {
        if (breakWords) {
          lines += Math.ceil(wordWidth / limit) - 1;
          wordWidth %= limit;
          if (!wordWidth) wordWidth = limit;
        } else {
          overflow = true;
        }
      }
      available = limit - wordWidth - 8;
    }
    return { lines, overflow };
  }

  function previewForm(width, values) {
    const stacked = width < values.breakpoint;
    const inner = Math.max(0, width - values.padding * 2);
    const labelWidth = stacked ? inner : Math.floor(inner * 0.35);
    const fieldWidth = stacked ? inner : Math.max(0, inner - labelWidth - 12);
    const label = measureWrapping(values.label, labelWidth, values.wrap);
    const error = measureWrapping(values.error, inner, values.wrap);
    const reasons = [];
    if (!inner || fieldWidth < 96) reasons.push("Field is below its 96 px minimum");
    if (label.overflow) reasons.push("Long label word overflows");
    if (error.overflow) reasons.push("Long message word overflows");
    if (measure(values.field) + 24 > fieldWidth) reasons.push("Entered value exceeds visible field width");
    return { width, stacked, labelWidth, fieldWidth, labelLines: label.lines, errorLines: error.lines, reasons, overflow: reasons.length > 0 };
  }

  function shades(shapes, x, y, width, count, color, limit) {
    for (let row = 0; row < Math.min(count, limit); row++) {
      const lineWidth = row === count - 1 ? width * 0.58 : width;
      shapes.push(rect(x, y + row * 2.7, lineWidth, 0.75, color));
    }
  }

  window.workbenchProjects.push(...projects);
}());
