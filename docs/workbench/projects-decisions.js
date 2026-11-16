(function () {
  "use strict";

  const projects = window.workbenchProjects;
  const day = 86400000;
  const teal = "#66cfbd";
  const gold = "#efb970";
  const lilac = "#bea7f9";
  const rose = "#e99596";
  const muted = "#9baec4";
  const border = "#4e637d";
  const panel = "#1c2d42";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const short = (value, max = 46) => value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value;
  const nonemptyRows = raw => raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const cols = raw => raw.split("|").map(column => column.trim());
  const readText = (sources, fallback) => sources.find(source => source.kind === "text")?.text ?? fallback;
  const localImages = sources => sources.filter(source => source.kind === "image");
  const localMedia = sources => sources.filter(source => source.kind === "image" || source.kind === "video");
  const measurement = raw => raw && Number.isFinite(Number(raw)) ? Number(raw) : NaN;
  const dayString = value => new Date(value).toISOString().slice(0, 10);

  function parseDay(raw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NaN;
    const value = Date.parse(raw + "T00:00:00Z");
    return Number.isFinite(value) && dayString(value) === raw ? value : NaN;
  }

  function numeric(key, label, value, min, max, step = 1, unit) {
    return { key, label, type: "number", value, min, max, step, unit };
  }

  function range(key, label, value, min, max, step = 1, unit, playback = false) {
    return { ...numeric(key, label, value, min, max, step, unit), type: "range", playback };
  }

  function text(key, label, value, type = "text") {
    return { key, label, type, value };
  }

  function select(key, label, options, value = options[0]) {
    return { key, label, type: "select", value, options };
  }

  const board = (shapes, markers = []) => ({ kind: "board", shapes, markers });
  const rect = (x, y, w, h, fill = panel, stroke = border) => ({ type: "rect", x, y, w, h, fill, stroke });
  const line = (x, y, x2, y2, stroke = border) => ({ type: "line", x, y, x2, y2, stroke });
  const dot = (x, y, r, color) => ({ type: "circle", x, y, r, fill: color, stroke: color });
  const label = (x, y, value, fill = "#eef2f7", w = 31, h = 10) => ({ type: "text", x, y, w, h, label: value, fill });
  const polygon = (points, fill, stroke = border) => ({ type: "polygon", points, fill, stroke });
  const photo = (source, x, y, w, h, time) => ({ type: "image", x, y, w, h, source: source.id, time });
  const mark = (key, x, y, label, detail) => ({ key, x, y, label, detail });
  const invalid = (summary, detail) => ({ summary, details: [detail], scene: board([]) });

  const backupExample = [
    "Project files | Work drive | Desktop | 2026-11-15 | 2026-11-15 | 0.5",
    "Project files | Rotation disk | Local cabinet | 2026-11-14 | 2026-11-10 | 1.75",
    "Project files | Archive disk | Remote storage | 2026-11-11 | 2026-11-12 | 4",
    "Reference notes | Work drive | Desktop | 2026-11-15 | 2026-11-15 | 0.25",
    "Reference notes | Archive disk | Remote storage | 2026-11-01 | 2026-11-02 | 3",
    "Capture clips | Work drive | Desktop | 2026-11-15 | 2026-11-15 | 1",
    "Capture clips | Rotation disk | Local cabinet | 2026-11-15 | 2026-11-14 | 4"
  ].join("\n");

  function backupRows(input) {
    return nonemptyRows(input).slice(0, 60).flatMap(row => {
      const [data, name, domain, snapshot, checked = "", hours] = cols(row);
      const time = parseDay(snapshot || "");
      const restore = measurement(hours);
      return data && name && domain && Number.isFinite(time) && restore >= 0
        ? [{ data, name, domain, time, checked: parseDay(checked), restore }] : [];
    });
  }

  projects.push({
    number: 32,
    id: "backup-restore-rehearsal",
    title: "Backup and restore rehearsal",
    summary: "Simulate losing a storage location and work out what you could recover within your targets.",
    guide: "Name one failed storage domain. Data loss is the age of the latest surviving snapshot relative to the rehearsal date. Verification uses the date of the last successful restore test you record. The workbench simulates the inventory you enter and does not access any storage device.",
    fields: [
      text("today", "Rehearsal date (YYYY-MM-DD)", "2026-11-16"),
      text("failed", "Unavailable storage domain", "Desktop"),
      numeric("ageLimit", "Maximum acceptable snapshot age", 3, 0, 365, 1, "days"),
      numeric("restoreLimit", "Maximum acceptable restore time per dataset", 4, 0, 336, 0.25, "h"),
      numeric("testLimit", "Maximum age of a restore test", 30, 1, 730, 1, "days"),
      text("inventory", "Dataset | copy | storage domain | snapshot date | last restore test date | restore hours", backupExample, "textarea")
    ],
    run(values, sources) {
      const today = parseDay(values.today);
      if (!Number.isFinite(today)) return invalid("Enter a rehearsal date.", "Use a real date in YYYY-MM-DD format.");
      const copies = backupRows(readText(sources, values.inventory));
      if (!copies.length) return invalid("Add a backup copy.", "Provide dataset, copy, storage domain, snapshot date, test date and estimated restore hours.");
      const failed = values.failed.trim().toLowerCase();
      const datasets = [...new Set(copies.map(copy => copy.data))];
      const results = datasets.map(data => {
        const survivors = copies.filter(copy => copy.data === data && copy.domain.toLowerCase() !== failed && copy.time <= today)
          .map(copy => ({ ...copy, age: (today - copy.time) / day, testAge: (today - copy.checked) / day }))
          .sort((a, b) => a.age - b.age || a.restore - b.restore);
        const verified = copy => copy.testAge >= 0 && copy.testAge <= values.testLimit;
        const within = survivors.find(copy => copy.age <= values.ageLimit && copy.restore <= values.restoreLimit && verified(copy));
        const best = within || survivors[0];
        const status = within ? "Within targets" : best ? "Outside targets" : "No surviving copy";
        const note = best ? best.name + " · " + best.domain + " · " + best.age + " d old · " + best.restore + " h · "
          + (verified(best) ? "test " + best.testAge + " d ago" : "restore test due or unrecorded") : "No copy is available after the simulated loss.";
        const procedure = best ? "Restore from " + best.name + ", confirm the snapshot date, then check a sample of restored files before use." : "Confirm whether an additional copy exists in a different storage domain.";
        return { data, best, within, status, note, procedure };
      });
      const shapes = [label(6, 5, failed ? "Unavailable · " + values.failed : "All domains available", gold, 88)];
      const markers = [];
      for (const [index, result] of results.slice(0, 7).entries()) {
        const y = 17 + index * (77 / Math.min(7, results.length));
        const height = Math.min(12, 61 / Math.min(7, results.length));
        const color = result.within ? teal : result.best ? gold : rose;
        shapes.push(rect(6, y, 30, height), rect(48, y, 44, height, panel, color));
        shapes.push(line(36, y + height / 2, 48, y + height / 2, color),
          label(8, y + 1, short(result.data, 26), "#eef2f7", 26, height),
          label(51, y + 1, short(result.best?.name || result.status, 34), color, 39, height));
        markers.push(mark("restore-" + result.data, 93, y + height / 2, short(result.data), result.status + " · " + result.note + "\n" + result.procedure));
      }
      const success = results.filter(result => result.within).length;
      return {
        summary: success + " of " + results.length + " datasets meet all recovery targets in this rehearsal.",
        metrics: [["Within targets", success], ["No surviving copy", results.filter(result => !result.best).length], ["Copies listed", copies.length]],
        details: results.map(result => result.data + " · " + result.status + " · " + result.note + " · " + result.procedure),
        scene: board(shapes, markers)
      };
    }
  });

  function simpleFloor() {
    return [
      rect(4, 5, 92, 90, "#19283a", "#8090a8"),
      line(46, 5, 46, 55), line(4, 55, 96, 55), line(66, 55, 66, 95),
      label(9, 10, "Storage", muted), label(52, 10, "Utility", muted),
      label(9, 60, "Work area", muted), label(70, 60, "Entry", muted)
    ];
  }

  const maintenanceExample = [
    "Utility | Replace sample filter | 2026-08-14 | 90 | 66 | 35 | Filter size 400 × 500 mm",
    "Storage | Check door hardware | 2026-09-26 | 60 | 27 | 34 | Check latch and hinge fasteners",
    "Work area | Inspect bench fasteners | 2026-11-10 | 180 | 28 | 76 | Refer to assembly sheet",
    "Entry | Inspect floor mat | 2026-11-01 | 14 | 80 | 78 | Replace if surface layers separate"
  ].join("\n");

  function maintenanceRows(input) {
    return nonemptyRows(input).slice(0, 80).flatMap((row, index) => {
      const [area, task, previous, interval, px, py, detail = ""] = cols(row);
      const last = parseDay(previous || "");
      const every = measurement(interval);
      const x = measurement(px), y = measurement(py);
      return area && task && Number.isFinite(last) && every > 0 && every <= 3650 && x >= 0 && x <= 100 && y >= 0 && y <= 100
        ? [{ index, area, task, last, every, x, y, detail }] : [];
    });
  }

  projects.push({
    number: 33,
    id: "home-maintenance-map",
    title: "Home maintenance map",
    summary: "Put recurring maintenance tasks on a floor plan and see what is overdue or due soon.",
    guide: "Import a local floor plan or use the sample plan. Coordinates are 0–100 from the upper left of the scene. Task intervals are days. To log a service, replace the previous service date in the task record.",
    fields: [
      text("asOf", "Review date (YYYY-MM-DD)", "2026-11-16"),
      range("soon", "Upcoming window", 14, 1, 90, 1, "days"),
      select("show", "Show tasks", ["All tasks", "Due or overdue", "Due soon", "Later"]),
      text("tasks", "Area | task | last serviced | interval days | x | y | service note", maintenanceExample, "textarea")
    ],
    run(values, sources) {
      const asOf = parseDay(values.asOf);
      if (!Number.isFinite(asOf)) return invalid("Enter a review date.", "Use YYYY-MM-DD.");
      const tasks = maintenanceRows(readText(sources, values.tasks));
      if (!tasks.length) return invalid("Add a maintenance task.", "Use a last-service date, a repeat interval and a plan position.");
      const dates = tasks.map(task => {
        const due = task.last + task.every * day;
        const remaining = Math.ceil((due - asOf) / day);
        const status = remaining <= 0 ? "Due or overdue" : remaining <= values.soon ? "Due soon" : "Later";
        return { ...task, due, remaining, status };
      }).sort((a, b) => a.due - b.due);
      const visible = dates.filter(task => values.show === "All tasks" || task.status === values.show);
      const plan = localImages(sources)[0];
      const shapes = plan ? [photo(plan, 0, 0, 100, 100)] : simpleFloor();
      const note = task => "Due " + dayString(task.due) + " · " + (task.remaining < 0 ? -task.remaining + " d overdue" : task.remaining === 0 ? "due today" : task.remaining + " d away") + (task.detail ? " · " + task.detail : "");
      const colorFor = status => status === "Due or overdue" ? rose : status === "Due soon" ? gold : teal;
      const markers = visible.slice(0, 16).map(task => {
        shapes.push(dot(task.x, task.y, 1.8, colorFor(task.status)));
        return mark("maintenance-" + task.index, task.x, task.y, short(task.task), task.area + " · " + note(task));
      });
      return {
        summary: visible.length ? "Maintenance schedule as of " + values.asOf + "." : "No tasks match this filter.",
        metrics: [["Due or overdue", dates.filter(task => task.status === "Due or overdue").length], ["Due soon", dates.filter(task => task.status === "Due soon").length], ["Tasks shown", markers.length]],
        details: visible.map(task => task.area + " · " + task.task + " · " + note(task)),
        scene: board(shapes, markers)
      };
    }
  });

  const inspectionExample = [
    "Bracket gap | 2.4 | 1.1 | 1.0 | 0.2 | mm | 32 | 42 | Check under light pressure",
    "Fastener depth | 9.8 | 9.9 | 10.0 | 0.25 | mm | 64 | 59 | Measure from the front face",
    "Edge step | 0.6 | 0.5 | 0.0 | 0.25 | mm | 76 | 27 | Recheck after seating"
  ].join("\n");

  function inspectionRows(input) {
    return nonemptyRows(input).slice(0, 45).flatMap((row, index) => {
      const [name, a, b, goal, width, unit = "", px, py, note = ""] = cols(row);
      const [before, after, nominal, tolerance, x, y] = [a, b, goal, width, px, py].map(measurement);
      if (!name || ![before, after, nominal, tolerance, x, y].every(Number.isFinite) || tolerance < 0 || x < 0 || x > 100 || y < 0 || y > 100) return [];
      const afterError = after - nominal;
      const pass = Math.abs(afterError) <= tolerance + Number.EPSILON * Math.max(1, Math.abs(nominal), Math.abs(after)) * 8;
      return [{ index, name, before, after, nominal, tolerance, unit, x, y, note, pass }];
    });
  }

  function compact(value) {
    return Number(value.toPrecision(5)).toString();
  }

  function inspectionNote(point) {
    return compact(point.before) + " → " + compact(point.after) + " " + point.unit + " · target " + compact(point.nominal)
      + " ± " + compact(point.tolerance) + " · " + (point.pass ? "within tolerance" : "recheck");
  }

  function inspectionSchematic(points) {
    const shapes = [];
    for (const [index, title] of ["Before", "After"].entries()) {
      const left = 4 + 48 * index;
      shapes.push(rect(left, 6, 44, 86), label(left + 3, 10, title, index ? teal : gold), rect(left + 4, 25, 36, 52, "#29394b", border));
      shapes.push(rect(left + 8, 32, 28, 14, "#34485d", muted), rect(left + 8, 57 - index * 4, 28, 14, "#34485d", muted));
      shapes.push(line(left + 11, 47, left + 11, 57 - index * 4, index ? teal : gold));
      points.slice(0, 12).forEach(point => shapes.push(dot(left + 4 + point.x * 0.36, 25 + point.y * 0.52, 0.7, index && !point.pass ? rose : index ? teal : gold)));
    }
    return shapes;
  }

  projects.push({
    number: 34,
    id: "repair-inspection-comparison",
    title: "Repair inspection comparison",
    summary: "Compare before and after measurements against explicit tolerances and inspect the corresponding regions.",
    guide: "Import before and after photos with matching framing. The first photo is before. Measurement coordinates run from 0–100 in the comparison scene. Enter nominal values and acceptable deviations from your own inspection specification.",
    fields: [
      select("view", "Comparison", ["Side by side", "Wipe", "Pixel difference"]),
      range("wipe", "Wipe position", 50, 0, 100, 1, "%"),
      select("show", "Measurements shown", ["All points", "Outside tolerance", "Within tolerance"]),
      text("measurements", "Name | before | after | nominal | tolerance | unit | x | y | note", inspectionExample, "textarea")
    ],
    run(values, sources) {
      const points = inspectionRows(readText(sources, values.measurements));
      if (!points.length) return invalid("Add valid inspection measurements.", "Use finite before, after, nominal, and tolerance values with coordinates from 0–100.");
      const filtered = points.filter(point => values.show === "All points" || point.pass === (values.show === "Within tolerance"));
      const [left, right] = localImages(sources);
      const mode = { "Side by side": "split", Wipe: "wipe", "Pixel difference": "difference" }[values.view];
      const markers = filtered.slice(0, 16).map(point => {
        const x = mode === "split" || !left || !right ? 52 + point.x * 0.44 : point.x;
        return mark("inspection-" + point.index, x, point.y, short(point.name), inspectionNote(point) + (point.note ? "\n" + point.note : ""));
      });
      return {
        summary: points.filter(point => !point.pass).length + " of " + points.length + " measurements are outside tolerance after repair.",
        metrics: [["Measured points", points.length], ["Within tolerance", points.filter(point => point.pass).length], ["Comparable photos", left && right ? 2 : 0]],
        details: filtered.map(point => point.name + " · " + inspectionNote(point)),
        scene: left && right
          ? { kind: "compare", left: left.id, right: right.id, leftLabel: "Before", rightLabel: "After", position: values.wipe, mode, markers }
          : board(inspectionSchematic(filtered), markers)
      };
    }
  });

  const geoExample = [
    "2026-11-02 | 53 | 12 | Freight backlog rises | Fictional port bulletin | 70 | A reporting change could account for the increase.",
    "2026-11-07 | 23 | 90 | Rail shipments resume | Fictional logistics report | 55 | The resumption may cover only one terminal.",
    "2026-11-10 | -12 | -76 | Inventory estimate revised | Fictional agency note | 80 | The earlier series used a different reporting period.",
    "2026-11-14 | 38 | -122 | Backlog estimate disputed | Fictional operations update | 45 | Temporary storage capacity may be omitted."
  ].join("\n");

  const schematicLand = [
    [[-168, 66], [-142, 70], [-113, 73], [-86, 67], [-61, 53], [-80, 25], [-96, 18], [-117, 32], [-124, 49]],
    [[-82, 10], [-58, 12], [-36, -6], [-48, -26], [-68, -55], [-76, -35]],
    [[-52, 80], [-21, 77], [-37, 61], [-54, 60]],
    [[-12, 36], [0, 58], [29, 72], [59, 64], [90, 76], [155, 66], [176, 56], [141, 37], [120, 22], [102, 7], [77, 12], [61, 29], [41, 38], [22, 34]],
    [[-16, 29], [16, 36], [42, 21], [51, 8], [38, -13], [26, -35], [6, -29], [-6, -1], [-17, 15]],
    [[112, -24], [128, -13], [150, -19], [154, -35], [134, -43], [116, -34]],
    [[96, 5], [119, 3], [143, -8], [131, -12], [105, -6]]
  ];

  function geoPoint(latitude, longitude) {
    return [4 + (longitude + 180) / 360 * 92, 8 + (90 - latitude) / 180 * 82];
  }

  function geoGrid() {
    const shapes = [rect(4, 8, 92, 82, "#152537", border)];
    for (let lat = -60; lat <= 60; lat += 30) {
      const [x, y] = geoPoint(lat, -180);
      shapes.push(line(x, y, 96, y, "#344761"));
    }
    for (let lon = -120; lon <= 120; lon += 60) {
      const [x, y] = geoPoint(90, lon);
      shapes.push(line(x, y, x, 90, "#344761"));
    }
    shapes.push(...schematicLand.map(points => polygon(points.map(([lon, lat]) => geoPoint(lat, lon)), "#354558", "#66788e")));
    shapes.push(label(5, 91, "Schematic · latitude and longitude", muted, 77));
    return shapes;
  }

  projects.push({
    number: 35,
    id: "geopolitical-evidence-map",
    title: "Geopolitical evidence map",
    summary: "Review dated claims with source descriptions, confidence ratings, and alternative interpretations.",
    guide: "Enter each claim with a date, coordinates, source and an alternative account. The playback slider moves between the oldest and newest claims. The map is schematic. A local image can replace the background if its bounds align with a full-world equirectangular projection.",
    fields: [
      range("timeline", "Timeline position", 100, 0, 100, 1, "%", true),
      range("minimumConfidence", "Minimum recorded confidence", 0, 0, 100, 5, "%"),
      text("claims", "Date | latitude | longitude | claim | source | confidence | alternative", geoExample, "textarea")
    ],
    run(values, sources) {
      const claims = nonemptyRows(readText(sources, values.claims)).slice(0, 120).flatMap((row, index) => {
        const [date, lat, lon, claim, source, rating, alternative = ""] = cols(row);
        const time = parseDay(date || "");
        const latitude = measurement(lat), longitude = measurement(lon), confidence = measurement(rating);
        if (!Number.isFinite(time) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(latitude)
          || !Number.isFinite(longitude) || !claim || !source || !(confidence >= 0 && confidence <= 100)) return [];
        return [{ index, date, time, latitude, longitude, claim, source, confidence, alternative }];
      }).sort((a, b) => a.time - b.time);
      if (!claims.length) return invalid("Add a dated claim.", "Use a UTC date, latitude −90 to 90, longitude −180 to 180, source, and confidence 0–100.");
      const beginning = claims[0].time, end = claims.at(-1).time;
      const stop = beginning + (end - beginning) * values.timeline / 100;
      const available = claims.filter(claim => claim.time <= stop && claim.confidence >= values.minimumConfidence);
      const map = localImages(sources)[0];
      const shapes = map ? [{ ...photo(map, 4, 8, 92, 82), fit: "fill" }] : geoGrid();
      const details = [];
      const markers = available.slice(-20).map(claim => {
        const [x, y] = geoPoint(claim.latitude, claim.longitude);
        const color = claim.confidence >= 70 ? teal : claim.confidence >= 50 ? gold : rose;
        shapes.push(dot(x, y, 1.1, color));
        const detail = claim.date + " · " + claim.source + " · confidence " + claim.confidence + "% · "
          + (claim.alternative || "No alternative recorded");
        details.push(claim.claim + " · " + detail);
        return mark("claim-" + claim.index, x, y, short(claim.claim), detail);
      });
      return {
        summary: available.length + " claims meet the timeline and confidence filters as of " + dayString(stop) + ".",
        metrics: [["As of", dayString(stop)], ["Eligible claims", available.length], ["Map pins", markers.length]],
        details,
        scene: board(shapes, markers)
      };
    }
  });

  function cashFlow(values, discount, terminalGrowth) {
    const years = Math.round(values.years);
    const growth = values.growth / 100;
    const margin = values.margin / 100;
    const result = [];
    let revenue = values.revenue;
    let enterprise = 0;
    for (let year = 1; year <= years; year += 1) {
      revenue *= 1 + growth;
      const flow = revenue * margin;
      const present = flow / (1 + discount) ** year;
      enterprise += present;
      result.push({ year, flow, present });
    }
    if (discount <= terminalGrowth) return { result };
    const terminal = result.at(-1).flow * (1 + terminalGrowth) / (discount - terminalGrowth) / (1 + discount) ** years;
    enterprise += terminal;
    return { result, terminal, enterprise, equity: (enterprise - values.netDebt) / values.shares };
  }

  function sensitivityBoard(values, model) {
    const shapes = [label(4, 6, "Terminal growth →", muted, 40), label(4, 18, "Discount rate", muted, 30)];
    const markers = [];
    const grid = [-2, -1, 0, 1, 2];
    grid.forEach((offset, column) => shapes.push(label(27 + column * 14, 17, compact(values.terminal + offset * 0.5) + "%", muted, 13)));
    grid.forEach((offset, row) => {
      const discount = values.discount + offset;
      const y = 27 + row * 12;
      shapes.push(label(6, y + 2, compact(discount) + "%", muted));
      grid.forEach((step, column) => {
        const growth = values.terminal + step * 0.5;
        const result = discount <= 0 ? null : cashFlow(values, discount / 100, growth / 100);
        const equity = result?.equity;
        const x = 25 + column * 14;
        const fill = !Number.isFinite(equity) ? "#222c3b" : !Number.isFinite(model.equity) ? "#2b423f" : equity >= model.equity ? "#245048" : "#473c4c";
        const core = row === 2 && column === 2;
        shapes.push(rect(x, y, 13, 10, fill, core ? gold : border));
        shapes.push(label(x + 0.7, y + 1.4, Number.isFinite(equity) ? compact(equity) : "—", core ? gold : "#eef2f7", 11.6, 7));
        if (core || (row === 0 && column === 4) || (row === 4 && column === 0)) {
          const detail = "Discount " + compact(discount) + "% · terminal growth " + compact(growth) + "% · "
            + (Number.isFinite(equity) ? compact(equity) + " per share" : "invalid rate pair");
          markers.push(mark("sensitivity-" + row + "-" + column, x + 11, y + 8, core ? "Base case" : "Rate corner", detail));
        }
      });
    });
    return board(shapes, markers);
  }

  projects.push({
    number: 36,
    id: "earnings-scenario-workbench",
    title: "Earnings scenario workbench",
    summary: "Recalculate a discounted cash flow scenario and test how its inputs change the output.",
    guide: "Use synthetic trial inputs or figures you enter yourself, all in the same currency. Opening financial figures are in millions, share count is in millions, and terminal growth must be lower than the discount rate. The model uses a constant free cash flow margin and growth rate.",
    fields: [
      select("view", "View", ["Sensitivity grid", "Cash flow by year"]),
      numeric("revenue", "Opening annual revenue", 1000, 0.1, 10000000, 0.1, "millions"),
      numeric("netDebt", "Opening net debt", 80, -10000000, 10000000, 0.1, "millions"),
      numeric("shares", "Shares outstanding", 100, 0.01, 10000000, 0.01, "millions"),
      range("growth", "Annual revenue growth", 7, -60, 55, 0.5, "%"),
      range("margin", "Free cash flow margin", 13, -30, 60, 0.5, "%"),
      range("discount", "Discount rate", 10, 0.5, 35, 0.5, "%"),
      range("terminal", "Terminal growth", 2.5, -10, 15, 0.5, "%"),
      numeric("years", "Explicit forecast years", 5, 1, 15, 1, "years")
    ],
    run(values) {
      const model = cashFlow(values, values.discount / 100, values.terminal / 100);
      const metrics = [
        ["Enterprise value (millions)", Number.isFinite(model.enterprise) ? compact(model.enterprise) : "—"],
        ["Equity per share", Number.isFinite(model.equity) ? compact(model.equity) : "—"],
        ["Terminal PV (millions)", Number.isFinite(model.terminal) ? compact(model.terminal) : "—"]
      ];
      const details = model.result.map(row => "Year " + row.year + " · free cash flow " + compact(row.flow) + "m · present value " + compact(row.present) + "m");
      const scene = values.view === "Sensitivity grid" ? sensitivityBoard(values, model) : {
        kind: "plot", xLabel: "Forecast year", yLabel: "Cash flow (millions)",
        series: [
          { label: "Free cash flow", color: teal, points: model.result.map(row => [row.year, row.flow]) },
          { label: "Present value", color: gold, points: model.result.map(row => [row.year, row.present]) }
        ],
        markers: model.result.map(row => mark("year-" + row.year, row.year, row.flow, "Year " + row.year, details[row.year - 1]))
      };
      return {
        summary: Number.isFinite(model.equity) ? "Modelled equity per share under the selected assumptions is " + compact(model.equity) + "." : "Terminal value requires a discount rate greater than terminal growth.",
        metrics, details, scene
      };
    }
  });

  const dependencyExample = [
    "requirements | Confirm requirements | 3 | | 0",
    "design | Design draft | 4 | requirements | 0",
    "dataset | Prepare sample data | 5 | requirements | 0",
    "prototype | Build prototype | 6 | design | 0",
    "testing | Validate test cases | 4 | prototype,dataset | 0",
    "release | Run release review | 2 | testing | 0"
  ].join("\n");

  function taskGraph(raw) {
    const tasks = new Map();
    for (const row of nonemptyRows(raw).slice(0, 75)) {
      const [id, name, length, prerequisites = "", earliest = ""] = cols(row);
      const duration = measurement(length);
      const release = earliest ? measurement(earliest) : 0;
      if (!id || !name || !(duration > 0 && duration <= 3650) || !(release >= 0 && release <= 3650)) {
        return { error: "A task needs an ID, a name, a positive duration, and a nonnegative earliest day." };
      }
      if (tasks.has(id)) return { error: "Duplicate task ID " + id + "." };
      const after = [...new Set(prerequisites.split(",").map(item => item.trim()).filter(Boolean))];
      tasks.set(id, { id, name, duration, release, after, successors: [] });
    }
    if (!tasks.size) return { error: "Add at least one task." };
    for (const task of tasks.values()) {
      for (const predecessor of task.after) {
        if (!tasks.has(predecessor)) return { error: task.id + " refers to missing task " + predecessor + "." };
        tasks.get(predecessor).successors.push(task.id);
      }
    }
    const order = [];
    const temporary = new Set();
    const finished = new Set();
    function visit(task) {
      if (finished.has(task.id)) return true;
      if (temporary.has(task.id)) return false;
      temporary.add(task.id);
      if (!task.after.every(id => visit(tasks.get(id)))) return false;
      temporary.delete(task.id);
      finished.add(task.id);
      order.push(task);
      return true;
    }
    for (const task of tasks.values()) {
      if (!visit(task)) return { error: "A dependency cycle includes " + task.id + "." };
    }
    return { order, tasks };
  }

  function schedule(graph, delayedId, delay) {
    const scheduled = new Map();
    for (const task of graph.order) {
      const baseline = Math.max(task.release, ...task.after.map(id => scheduled.get(id).finish));
      const start = task.id === delayedId ? baseline + delay : baseline;
      scheduled.set(task.id, { ...task, start, finish: start + task.duration });
    }
    const duration = Math.max(...[...scheduled.values()].map(task => task.finish));
    for (const task of [...scheduled.values()].reverse()) {
      const latestFinish = Math.min(duration, ...task.successors.map(id => scheduled.get(id).latestStart));
      task.latestStart = latestFinish - task.duration;
      task.slack = Math.max(0, task.latestStart - task.start);
    }
    return { scheduled, duration };
  }

  function scheduleScene(scheduled, duration, affected) {
    const visible = [...scheduled.values()].slice(0, 11);
    const scale = value => 29 + 67 * value / duration;
    const rowHeight = Math.min(13, 77 / visible.length);
    const shapes = [label(4, 5, "Task", muted), label(28, 5, "Day 0", muted), label(78, 5, "Day " + compact(duration), muted, 20), line(29, 12, 96, 12)];
    const markers = [];
    const ys = new Map(visible.map((task, index) => [task.id, 20 + index * rowHeight]));
    visible.forEach(task => {
      const y = ys.get(task.id);
      for (const predecessor of task.after) {
        if (!ys.has(predecessor)) continue;
        const end = scale(scheduled.get(predecessor).finish);
        shapes.push(line(end, ys.get(predecessor) + 2, end, y + 2, "#40566e"), line(end, y + 2, scale(task.start), y + 2, "#40566e"));
      }
    });
    visible.forEach(task => {
      const y = ys.get(task.id);
      const color = affected.has(task.id) ? gold : task.slack < 1e-6 ? teal : lilac;
      shapes.push(label(4, y - 2, short(task.name, 25), "#eef2f7", 23, rowHeight), rect(scale(task.start), y - 1.5, Math.max(0.28, scale(task.finish) - scale(task.start)), 5, color, color));
      markers.push(mark("task-" + task.id, scale(task.finish), y + 1, short(task.name), "Day " + compact(task.start) + " to " + compact(task.finish) + " · " + compact(task.slack) + " days slack"));
    });
    return board(shapes, markers);
  }

  projects.push({
    number: 37,
    id: "project-dependency-rehearsal",
    title: "Project dependency rehearsal",
    summary: "Delay a task and trace which start days, slack, and project milestones move.",
    guide: "Enter one task per line. Prerequisites use task IDs separated by commas. After each change, a forward pass calculates earliest starts and a backward pass calculates slack. This model uses durations and dependencies without resource scheduling.",
    fields: [
      text("delayTask", "Task ID to delay", "dataset"),
      range("delay", "Added delay", 3, 0, 40, 0.5, "days"),
      text("tasks", "ID | task name | duration days | prerequisites | earliest day", dependencyExample, "textarea")
    ],
    run(values, sources) {
      const graph = taskGraph(readText(sources, values.tasks));
      if (graph.error) return invalid("Check the task graph.", graph.error);
      const id = values.delayTask.trim();
      const baseline = schedule(graph, "", 0);
      const scenario = schedule(graph, id, values.delay);
      const affected = new Set([...scenario.scheduled.values()].filter(task => task.start !== baseline.scheduled.get(task.id).start).map(task => task.id));
      const change = scenario.duration - baseline.duration;
      const details = [...scenario.scheduled.values()].map(task => task.id + " · day " + compact(task.start) + " to " + compact(task.finish)
        + " · slack " + compact(task.slack) + " d" + (affected.has(task.id) ? " · shifted" : ""));
      if (id && !graph.tasks.has(id)) details.unshift("No task has ID " + id + ".");
      return {
        summary: change > 0 ? "The delay moves project completion by " + compact(change) + " days." : "Project completion stays on day " + compact(scenario.duration) + " in this scenario.",
        metrics: [["Baseline completion (day)", compact(baseline.duration)], ["Scenario completion (day)", compact(scenario.duration)], ["Tasks shifted", affected.size], ["Zero-slack tasks", [...scenario.scheduled.values()].filter(task => task.slack < 1e-6).length]],
        details,
        scene: scheduleScene(scenario.scheduled, scenario.duration, affected)
      };
    }
  });

  const roomExample = [
    "Work table | 0.40 | 0.55 | 1.65 | 0.80 | Power access along back wall",
    "Storage rack | 2.80 | 0.30 | 1.10 | 0.55 | Open shelves face the room",
    "Equipment cart | 2.20 | 2.08 | 0.75 | 0.60 | Keep access on two sides",
    "Packing bench | 0.46 | 2.28 | 1.16 | 0.55 | Leave space for an operator"
  ].join("\n");

  function roomObjects(raw, moved, dx, dy) {
    return nonemptyRows(raw).slice(0, 30).flatMap((row, index) => {
      const [name, x0, y0, width, depth, note = ""] = cols(row);
      const [x, y, w, h] = [x0, y0, width, depth].map(measurement);
      if (!name || ![x, y, w, h].every(Number.isFinite) || !(w > 0 && h > 0) || Math.max(Math.abs(x), Math.abs(y), w, h) > 1000) return [];
      const selected = name.trim().toLowerCase() === moved;
      return [{ index, name, x: x + (selected ? dx : 0), y: y + (selected ? dy : 0), w, h, selected, note }];
    });
  }

  function nearWall(item, width, depth) {
    return Math.min(item.x, item.y, width - item.x - item.w, depth - item.y - item.h);
  }

  function objectGap(a, b) {
    const dx = Math.max(a.x - b.x - b.w, b.x - a.x - a.w);
    const dy = Math.max(a.y - b.y - b.h, b.y - a.y - a.h);
    if (dx < -1e-8 && dy < -1e-8) return -1;
    return Math.hypot(Math.max(0, dx), Math.max(0, dy));
  }

  projects.push({
    number: 38,
    id: "physical-workspace-planner",
    title: "Physical workspace planner",
    summary: "Lay out equipment by measurement and check overlaps, wall clearance, and spacing between objects.",
    guide: "Use meters from the upper-left room corner. Compare a what-if move by entering the object name and x/y offsets. The geometry checks axis-aligned footprints against a user-selected gap; it does not calculate a circulation path or validate building requirements.",
    fields: [
      numeric("width", "Room width", 4.5, 0.5, 100, 0.01, "m"),
      numeric("depth", "Room depth", 3.5, 0.5, 100, 0.01, "m"),
      numeric("gap", "Preferred minimum gap", 0.3, 0, 5, 0.01, "m"),
      text("move", "Object to move", "Equipment cart"),
      range("dx", "Horizontal offset", 0, -4, 4, 0.05, "m"),
      range("dy", "Vertical offset", 0, -4, 4, 0.05, "m"),
      text("items", "Name | x m | y m | width m | depth m | note", roomExample, "textarea")
    ],
    run(values, sources) {
      const objects = roomObjects(readText(sources, values.items), values.move.trim().toLowerCase(), values.dx, values.dy);
      if (!objects.length) return invalid("Add a measured footprint.", "Provide a name, position and positive width and depth.");
      const conflicts = new Map(objects.map(item => [item.index, []]));
      const { width, depth, gap } = values;
      let outsideRoom = 0;
      let pairIssues = 0;
      for (const item of objects) {
        const wall = nearWall(item, width, depth);
        if (wall < -1e-8) {
          outsideRoom += 1;
          conflicts.get(item.index).push("part of the footprint is outside the room");
        } else if (wall + 1e-8 < gap) conflicts.get(item.index).push("closest wall gap " + compact(wall) + " m");
      }
      for (let i = 0; i < objects.length; i += 1) {
        for (let j = i + 1; j < objects.length; j += 1) {
          const a = objects[i], b = objects[j], spacing = objectGap(a, b);
          if (spacing + 1e-8 >= gap) continue;
          pairIssues += 1;
          const note = name => spacing < 0 ? "overlaps " + name : "gap to " + name + " is " + compact(spacing) + " m";
          conflicts.get(a.index).push(note(b.name));
          conflicts.get(b.index).push(note(a.name));
        }
      }
      const x = meters => 6 + 88 * meters / width;
      const y = meters => 13 + 80 * meters / depth;
      const plan = localImages(sources)[0];
      const shapes = [label(6, 3, compact(width) + " m wide × " + compact(depth) + " m deep", muted, 87), rect(6, 13, 88, 80, "#172638", muted)];
      if (plan) shapes.push(photo(plan, 6, 13, 88, 80));
      const markers = [];
      const details = [];
      for (const item of objects) {
        const issues = conflicts.get(item.index);
        const color = issues.length ? rose : item.selected ? gold : teal;
        const left = x(clamp(item.x, 0, width)), right = x(clamp(item.x + item.w, 0, width));
        const top = y(clamp(item.y, 0, depth)), bottom = y(clamp(item.y + item.h, 0, depth));
        if (right > left && bottom > top) {
          shapes.push(rect(left, top, right - left, bottom - top, plan ? "transparent" : "#263e4d", color));
          if (right - left > 10 && bottom - top > 7) shapes.push(label(left + 1, top + 1, short(item.name, 22), color, right - left - 2, bottom - top - 1));
        }
        const detail = compact(item.w) + " × " + compact(item.h) + " m · " + (issues.join("; ") || "Meets the selected spacing")
          + (item.note ? " · " + item.note : "");
        markers.push(mark("room-" + item.index, clamp((left + right) / 2, 7, 93), clamp((top + bottom) / 2, 14, 92), short(item.name), detail));
        details.push(item.name + " · " + detail);
      }
      const conflictsTotal = objects.filter(item => conflicts.get(item.index).length > 0).length;
      if (values.move.trim() && objects.every(item => !item.selected)) details.unshift("No object matches " + values.move.trim() + ".");
      return {
        summary: conflictsTotal ? conflictsTotal + " objects need spacing or placement review." : "All footprints lie inside the room and meet the selected gaps.",
        metrics: [["Objects", objects.length], ["Outside the room", outsideRoom], ["Pairs below gap", pairIssues]],
        details,
        scene: board(shapes, markers)
      };
    }
  });

  const exerciseExample = [
    "18 | Compare the approach to the first visible change in direction.",
    "52 | Pause around the midpoint and compare framing and timing.",
    "87 | Check when each recording returns to its starting position."
  ].join("\n");

  function exerciseNotes(raw) {
    return nonemptyRows(raw).slice(0, 70).flatMap((row, index) => {
      const [at, ...parts] = cols(row);
      const phase = measurement(at);
      const body = parts.join(" | ");
      return phase >= 0 && phase <= 100 && body ? [{ index, phase, body }] : [];
    }).sort((a, b) => a.phase - b.phase);
  }

  function exercisePose(left, phase, alternate) {
    const width = 44;
    const sway = Math.sin(phase * Math.PI) * (alternate ? 1.45 : 1);
    const x = left + 21;
    const center = x + sway * 2;
    const shoulders = [center - sway * 4, 28 + sway * 10];
    const hips = [center + sway * 1.5, 45 + sway * 16];
    const knees = [center + sway * 7, 57 + sway * 9];
    const feet = [x + 4, 74];
    return [
      rect(left, 15, width, 65), line(left + 4, 75, left + width - 4, 75),
      dot(shoulders[0] - sway, shoulders[1] - 5, 1.65, alternate ? gold : teal),
      line(...shoulders, ...hips, "#bdced9"), line(...hips, ...knees, "#bdced9"), line(...knees, ...feet, "#bdced9"),
      line(...shoulders, shoulders[0] + 8, shoulders[1] + 6 + sway * 3, alternate ? gold : teal),
      line(feet[0], feet[1], feet[0] + 6, feet[1], "#bdced9")
    ];
  }

  projects.push({
    number: 39,
    id: "exercise-video-review",
    title: "Exercise video review journal",
    summary: "Review two local recordings at matched phases and append timestamped observations.",
    guide: "Import two clips that show the same movement. Set the start and end of the movement in each clip, then scrub the common phase. The times are your alignment points in seconds. The workbench seeks local video frames and uses schematic poses until clips are supplied.",
    fields: [
      range("phase", "Shared movement phase", 52, 0, 100, 0.5, "%", true),
      numeric("aStart", "First clip start", 0, 0, 7200, 0.05, "s"),
      numeric("aEnd", "First clip end", 8, 0.05, 7200, 0.05, "s"),
      numeric("bStart", "Second clip start", 1, 0, 7200, 0.05, "s"),
      numeric("bEnd", "Second clip end", 11, 0.05, 7200, 0.05, "s"),
      text("observation", "New observation at this phase", ""),
      text("journal", "Phase % | observation", exerciseExample, "textarea")
    ],
    actions: [
      { label: "Add observation", run(values) {
        const note = values.observation.trim();
        if (!note) return {};
        const row = compact(values.phase) + " | " + note.replace(/\r?\n/g, " ");
        return { observation: "", journal: [values.journal.trim(), row].filter(Boolean).join("\n") };
      } }
    ],
    run(values, sources) {
      if (values.aEnd <= values.aStart || values.bEnd <= values.bStart) {
        return invalid("Set each clip's end after its start.", "Enter the beginning and end of the movement in each clip, in seconds.");
      }
      const phase = values.phase / 100;
      const first = values.aStart + (values.aEnd - values.aStart) * phase;
      const second = values.bStart + (values.bEnd - values.bStart) * phase;
      const [left, right] = localMedia(sources);
      const shapes = [
        label(5, 4, "Clip A · " + compact(first) + " s", teal, 43),
        label(53, 4, "Clip B · " + compact(second) + " s", gold, 43),
        line(7, 88, 93, 88), dot(7 + phase * 86, 88, 1.55, gold)
      ];
      shapes.push(...(left ? [photo(left, 4, 15, 44, 65, first)] : exercisePose(4, phase, false)));
      shapes.push(...(right ? [photo(right, 52, 15, 44, 65, second)] : exercisePose(52, phase, true)));
      const notes = exerciseNotes(values.journal);
      notes.slice(0, 20).forEach(note => shapes.push(dot(7 + note.phase * 0.86, 88, 0.7, teal)));
      const ranked = notes.slice().sort((a, b) => Math.abs(a.phase - values.phase) - Math.abs(b.phase - values.phase));
      const markers = ranked.slice(0, 12).map(note => mark("exercise-" + note.index, 7 + 0.86 * note.phase, 88, compact(note.phase) + "%", note.body));
      const close = ranked[0];
      return {
        summary: "Matched phase " + compact(values.phase) + "% · first clip " + compact(first) + " s · second clip " + compact(second) + " s.",
        metrics: [["Local media", Number(Boolean(left)) + Number(Boolean(right))], ["Journal entries", notes.length]],
        details: [close ? "Nearest observation · " + compact(close.phase) + "% · " + close.body : "", ...notes.map(note => compact(note.phase) + "% · " + note.body)].filter(Boolean),
        scene: board(shapes, markers)
      };
    }
  });

  const fieldExample = [
    "P1 | 28 | 31 | 128 | mm | Verify | Repeat with a second measurement | 2",
    "P2 | 72 | 38 | 67 | mm | Open | Record whether the cover clears the fixture | 3",
    "P3 | 40 | 70 | 18.5 | °C | Resolved | Measurement checked against a reference | 0",
    "P4 | 81 | 76 | 2 | items | Open | Confirm quantity at the next visit | 0"
  ].join("\n");
  const fieldStatuses = ["Open", "Verify", "Resolved"];

  function fieldRows(input) {
    const keys = new Set();
    return nonemptyRows(input).slice(0, 85).flatMap(row => {
      const [id, px, py, value, unit, rawStatus, observation = "", media = "0"] = cols(row);
      const x = measurement(px), y = measurement(py), reading = measurement(value);
      const status = fieldStatuses.find(status => status.toLowerCase() === (rawStatus || "").toLowerCase());
      if (!id || keys.has(id) || !(x >= 0 && x <= 100 && y >= 0 && y <= 100) || !Number.isFinite(reading) || !unit || !status) return [];
      keys.add(id);
      return [{ id, x, y, reading, unit, status, observation, media: Math.round(Number(media) || 0) }];
    });
  }

  function fieldInput(values, sources) {
    return values.input === "Imported file" ? readText(sources, "") : values.records;
  }

  function fieldDetail(point) {
    return compact(point.reading) + " " + point.unit + " · " + point.status + (point.observation ? " · " + point.observation : "");
  }

  function fieldReport(site, point, photos) {
    const shapes = [rect(4, 5, 92, 88), label(8, 9, short(site, 55) + " · Survey record", teal, 84)];
    if (!point) {
      shapes.push(label(8, 30, "No matching survey record", muted, 84));
      return board(shapes);
    }
    const image = point.media > 0 ? photos[point.media - 1] : null;
    const textWidth = image ? 39 : 79;
    if (image) shapes.push(photo(image, 52, 21, 41, 66));
    shapes.push(label(8, 23, point.id + " · " + point.status, gold, textWidth, 12),
      label(8, 37, compact(point.reading) + " " + point.unit, "#eef2f7", textWidth, 12),
      label(8, 50, point.observation || "No observation recorded.", muted, textWidth, 30));
    return board(shapes, [mark("survey-" + point.id, 87, 86, point.id, fieldDetail(point))]);
  }

  projects.push({
    number: 40,
    id: "field-survey-report",
    title: "Field survey report builder",
    summary: "Turn a site plan or photo into a map of readings, photos, and open questions.",
    guide: "Import a plan or site photo first, followed by optional detail images. Pin positions use 0–100 scene coordinates. The photo number references the local image order and 0 means no detail photo. Use the report view for the selected point.",
    fields: [
      text("site", "Site label", "Sample study room"),
      select("view", "View", ["Survey map", "Point report"]),
      select("filter", "Status", ["All", ...fieldStatuses]),
      text("point", "Selected point ID", "P1"),
      select("input", "Measurement source", ["Editor", "Imported file"]),
      text("records", "ID | x | y | reading | unit | status | observation | photo number", fieldExample, "textarea")
    ],
    actions: [
      { label: "Mark selected point resolved", run(values, sources) {
        const raw = fieldInput(values, sources);
        const target = values.point.trim();
        if (!fieldRows(raw).some(point => point.id === target)) return {};
        const lines = raw.split(/\r?\n/).map(row => {
          const parts = cols(row);
          if (parts[0] !== target || parts.length < 6) return row;
          parts[5] = "Resolved";
          return parts.join(" | ");
        });
        return { input: "Editor", records: lines.join("\n") };
      } }
    ],
    run(values, sources) {
      const records = fieldRows(fieldInput(values, sources));
      if (!records.length) return invalid("Add a survey record.", "Enter a point ID, coordinates, a numeric reading, a unit, and a status.");
      const visible = records.filter(point => values.filter === "All" || point.status === values.filter);
      const point = visible.find(record => record.id === values.point.trim()) || visible[0];
      const photos = localImages(sources);
      const details = visible.map(record => record.id + " · " + fieldDetail(record));
      const shapes = photos[0] ? [photo(photos[0], 0, 0, 100, 100)] : simpleFloor();
      const markers = visible.slice(0, 20).map(record => {
        const color = record.status === "Resolved" ? teal : record.status === "Verify" ? gold : rose;
        shapes.push(dot(record.x, record.y, 1.3, color));
        return mark("survey-" + record.id, record.x, record.y, record.id, fieldDetail(record));
      });
      return {
        summary: values.view === "Point report" ? (point ? values.site + " · " + point.id + " · " + fieldDetail(point) : "No matching survey point.")
          : values.site + " · " + visible.length + " points match this view.",
        metrics: [["Open", records.filter(record => record.status === "Open").length], ["To verify", records.filter(record => record.status === "Verify").length], ["Resolved", records.filter(record => record.status === "Resolved").length]],
        details,
        scene: values.view === "Point report" ? fieldReport(values.site, point, photos) : board(shapes, markers)
      };
    }
  });
})();
