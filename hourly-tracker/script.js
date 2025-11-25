// Wrap EVERYTHING in an IIFE so we don't leak variables into global scope
(function(){

  // Central place to cache DOM elements so we don't keep calling getElementById
  const els = {
    nowDate: document.getElementById('nowDate'),
    nowHour: document.getElementById('nowHour'),

    // Live counters in the header cards
    calls: document.getElementById('count-calls'),
    contacts: document.getElementById('count-contacts'),
    appointments: document.getElementById('count-appointments'),

    // Chart + hourly table
    chart: document.getElementById('chart'),
    tableBody: document.querySelector('#dataTable tbody'),

    // Top buttons
    exportCsv: document.getElementById('exportCsv'),
    exportHistoryCsv: document.getElementById('exportHistoryCsv'),
    manualHourClose: document.getElementById('manualHourClose'),
    addDayToHistory: document.getElementById('addDayToHistory'),
    clearAll: document.getElementById('clearAll'),

    // Text areas
    notesBox: document.getElementById('notesBox'),
    scheduleBox: document.getElementById('scheduleBox'),

    // History section
    historyTableBody: document.querySelector('#historyTable tbody'),
    lastDayTitle: document.getElementById('lastDayTitle'),
    lastSchedule: document.getElementById('lastSchedule'),
    lastNotes: document.getElementById('lastNotes'),

    // Backup/restore controls
    backupAll: document.getElementById('backupAll'),
    restoreFile: document.getElementById('restoreFile')
  };

  // All localStorage keys grouped here so they're easy to change/version
  const KEYS = {
    CURRENT: 'htt_current',      // currently open hour id (e.g. 2025-11-24T15)
    DATA: 'htt_data_v2',         // map of hourId → {calls, contacts, appointments, ...}
    NOTES: 'htt_notes_v1',       // map of dateKey → notes string
    SCHEDULE: 'htt_schedule_v1', // map of dateKey → schedule string
    DAYS: 'htt_days_v1'          // map of dateKey → daily history summary
  };

  // ------------------------------------------------------------------
  //  ONE-TIME MIGRATION: old hourly keys (v1) → new data map (v2)
  // ------------------------------------------------------------------
  (function migrateFromV1IfNeeded(){
    try {
      const rawV2 = localStorage.getItem('htt_data_v2');
      const rawV1 =
        localStorage.getItem('htt_data_v1') ||
        localStorage.getItem('htt_data'); // super old fallback

      const v2 = rawV2 ? JSON.parse(rawV2) : {};
      const v1 = rawV1 ? JSON.parse(rawV1) : null;

      if (v1 && typeof v1 === 'object') {
        // Merge v1 into v2 (v2 wins if both have the same hourId)
        const merged = { ...v1, ...v2 };
        localStorage.setItem('htt_data_v2', JSON.stringify(merged));
        console.log(`Migrated ${Object.keys(v1).length} hour(s) from v1 → v2`);
      } else {
        console.log('No v1 hourly data detected to migrate.');
      }
    } catch(e) {
      console.warn('Migration failed:', e);
    }
  })();

  // ------------------------------------------------------------------
  //  SMALL UTILITY HELPERS
  // ------------------------------------------------------------------

  // Zero-pad a number to 2 digits (3 → "03")
  const pad2 = n => String(n).padStart(2,'0');

  // Format a date as HH:MM using the user's locale (e.g. "3:15 PM")
  const fmtHour = dt =>
    dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

  // Date key for "today" in YYYY-MM-DD format (used for notes/history)
  const todayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  };

  // Build an hourId from a Date: e.g. "2025-11-24T15"
  const hourIdFromDate = dt =>
    `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}`;

  // Reverse of hourIdFromDate: "2025-11-24T15" → Date object at that hour
  const parseHourId = id => {
    const [datePart, hourPart] = id.split('T');
    const [y,m,d] = datePart.split('-').map(Number);
    return new Date(y, m-1, d, Number(hourPart));
  };

  /**
   * Load a JSON object from localStorage.
   * If key is missing or broken JSON, returns the fallback (default {}).
   */
  const loadMap = (k, fallback={}) => {
    try { return JSON.parse(localStorage.getItem(k)) || fallback; }
    catch { return fallback; }
  };

  /**
   * Save a JS value to localStorage as JSON.
   * Used for all "maps" (DATA, NOTES, SCHEDULE, DAYS).
   */
  const saveMap = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // ------------------------------------------------------------------
  //  HOURLY CORE: per-hour buckets in DATA map
  // ------------------------------------------------------------------

  // Read the full hourly data map from localStorage (hourId → metrics object)
  const loadData = () => loadMap(KEYS.DATA, {});

  // Persist a new hourly map back to localStorage
  const saveData = (m) => saveMap(KEYS.DATA, m);

  // Convenience: get the current hour's ID for "now"
  const getCurrentId = () => hourIdFromDate(new Date());

  /**
   * Make sure there's a "current hour" bucket to write into.
   * - If the "open" hour (KEYS.CURRENT) is a different hour than now,
   *   we auto-close that old hour.
   * - If the current hour doesn't exist in DATA yet, we create it.
   * - We then set KEYS.CURRENT to this hourId and return it.
   */
  function ensureCurrentHour(){
    const map = loadData();
    const id = getCurrentId();
    const open = localStorage.getItem(KEYS.CURRENT);

    // If there's a different hour open, close it before switching
    if (open && open !== id) {
      closeHour(open);
    }

    // If this hour doesn't exist yet, initialize counters at 0
    if (!map[id]) {
      map[id] = {
        calls: 0,
        contacts: 0,
        appointments: 0,
        openedAt: Date.now() // metadata if you ever want to use it
      };
      saveData(map);
    }

    // Remember which hour is considered "current"
    localStorage.setItem(KEYS.CURRENT, id);
    return id;
  }

  /**
   * Mark an hour as "closed" by adding a closedAt timestamp.
   * This doesn't affect counts, just metadata.
   */
  function closeHour(id){
    const map = loadData();
    if (map[id] && !map[id].closedAt) {
      map[id].closedAt = Date.now();
      saveData(map);
    }
  }

  /**
   * Increment or decrement a metric (calls, contacts, appointments)
   * for the current hour, then re-render the UI.
   *
   * @param {string} metric - "calls" | "contacts" | "appointments"
   * @param {number} delta  - +1 or -1
   */
  function bump(metric, delta){
    const id = ensureCurrentHour();   // make sure we have an hour
    const map = loadData();          // load all data
    // ensure non-negative & default 0 if missing
    map[id][metric] = Math.max(0, (map[id][metric] || 0) + delta);
    saveData(map);                   // persist change
    render();                        // re-draw counters, chart, table
  }

  /**
   * Reset one metric for the current hour back to 0.
   */
  function resetMetric(metric){
    const id = ensureCurrentHour();
    const map = loadData();
    map[id][metric] = 0;
    saveData(map);
    render();
  }

  /**
   * Update the three visible count elements using the current hour data.
   */
  function renderCounts(){
    const id = ensureCurrentHour();
    const m = loadData()[id];
    els.calls.textContent        = m.calls || 0;
    els.contacts.textContent     = m.contacts || 0;
    els.appointments.textContent = m.appointments || 0;
  }

  /**
   * Get all hourIds that belong to "today".
   * Returns a sorted array of hourIds for the current date.
   */
  function getTodayIds(){
    const prefix = todayKey(); // e.g. "2025-11-24"
    return Object.keys(loadData())
      .filter(id => id.startsWith(prefix))
      .sort(); // lexicographic sort works because of YYYY-MM-DDT HH format
  }

  /**
   * Build the mini stacked bar chart for today's hours.
   * Each hour is one column, with segments for calls/contacts/appointments.
   */
  function renderChart(){
    const map = loadData();
    const ids = getTodayIds();

    let maxTotal = 0;

    // First pass: find the max total to scale bar heights
    ids.forEach(id => {
      const m = map[id];
      const total =
        (m.calls || 0) +
        (m.contacts || 0) +
        (m.appointments || 0);
      if (total > maxTotal) maxTotal = total;
    });

    // Scale factor: max bar height = 180px (defined by you in CSS)
    const scale = maxTotal ? 180 / maxTotal : 0;

    // Clear old chart before rebuilding
    els.chart.innerHTML = "";

    // Second pass: build each bar
    ids.forEach(id => {
      const m = map[id];

      const bar = document.createElement("div");
      bar.className = "bar";

      const stack = document.createElement("div");
      stack.className = "stack";

      // Build stacked segments in the order you want them to appear
      ['calls','contacts','appointments'].forEach(k => {
        const seg = document.createElement("div");
        seg.className = "segment " + k; // e.g. "segment calls"
        seg.style.height = `${(m[k] || 0) * scale}px`; // convert to pixels
        seg.title = `${k}: ${m[k] || 0}`; // tooltip on hover
        stack.appendChild(seg);
      });

      const lbl = document.createElement("div");
      lbl.className = "label";
      lbl.textContent = fmtHour(parseHourId(id)); // "3:00 PM", etc.

      bar.appendChild(stack);
      bar.appendChild(lbl);
      els.chart.appendChild(bar);
    });
  }

  /**
   * Rebuild the "Today’s Hourly Table" rows from scratch.
   */
  function renderTable(){
    const map = loadData();
    const ids = getTodayIds();

    // Clear existing rows
    els.tableBody.innerHTML = "";

    ids.forEach(id => {
      const m = map[id];

      const c = m.calls || 0;
      const n = m.contacts || 0;
      const a = m.appointments || 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtHour(parseHourId(id))}</td>
        <td>${c}</td>
        <td>${n}</td>
        <td>${a}</td>
        <td><strong>${c + n + a}</strong></td>`;
      els.tableBody.appendChild(tr);
    });
  }

  /**
   * Combine all of today's hours into one totals object.
   * Used when saving a day into history.
   */
  function getTodayTotals(){
    const map = loadData();
    const ids = getTodayIds();

    let calls = 0, contacts = 0, appointments = 0;

    ids.forEach(id => {
      const m = map[id];
      calls        += m.calls        || 0;
      contacts     += m.contacts     || 0;
      appointments += m.appointments || 0;
    });

    return {
      calls,
      contacts,
      appointments,
      total: calls + contacts + appointments
    };
  }

  // ------------------------------------------------------------------
  //  NOTES & SCHEDULE (PER-DAY TEXT STORAGE)
  // ------------------------------------------------------------------

  /**
   * Load today's notes and schedule text into the textareas.
   * Uses KEYS.NOTES and KEYS.SCHEDULE maps keyed by date.
   */
  function loadDailyTextBoxes(){
    const notes = loadMap(KEYS.NOTES, {});
    const sched = loadMap(KEYS.SCHEDULE, {});
    const key = todayKey();

    els.notesBox.value    = notes[key]  || "";
    els.scheduleBox.value = sched[key]  || "";
  }

  /**
   * Persist the current notesBox value into the NOTES map under today's key.
   */
  function saveDailyNotes(){
    const notes = loadMap(KEYS.NOTES, {});
    notes[todayKey()] = els.notesBox.value;
    saveMap(KEYS.NOTES, notes);
  }

  /**
   * Persist the current scheduleBox value into the SCHEDULE map under today's key.
   */
  function saveDailySchedule(){
    const sched = loadMap(KEYS.SCHEDULE, {});
    sched[todayKey()] = els.scheduleBox.value;
    saveMap(KEYS.SCHEDULE, sched);
  }

  // Autosave both textareas once every second
  setInterval(() => {
    saveDailyNotes();
    saveDailySchedule();
  }, 1000);

  // ------------------------------------------------------------------
  //  HISTORY (BY DAY) – SAVED SNAPSHOTS
  // ------------------------------------------------------------------

  // Shortcut helpers for the DAYS map
  function loadDays(){ return loadMap(KEYS.DAYS, {}); }
  function saveDays(obj){ saveMap(KEYS.DAYS, obj); }

  /**
   * Save "today" to the history map (DAYS):
   *  - dateKey: today's date
   *  - totals: from getTodayTotals()
   *  - notes + schedule from daily maps
   * If entry already exists, asks for confirmation to overwrite.
   */
  function addDayToHistory(){
    const dateKey = todayKey();
    const totals  = getTodayTotals();

    const notesMap = loadMap(KEYS.NOTES, {});
    const schedMap = loadMap(KEYS.SCHEDULE, {});

    const notes    = notesMap[dateKey] || "";
    const schedule = schedMap[dateKey] || "";

    const days = loadDays();

    // If we already saved this date, confirm overwrite
    if (days[dateKey]) {
      const ok = confirm("A day entry already exists for today. Overwrite it?");
      if (!ok) return;
    }

    // Compose history entry
    days[dateKey] = {
      date: dateKey,
      ...totals,       // calls, contacts, appointments, total
      notes,
      schedule,
      savedAt: Date.now()
    };

    saveDays(days);
    renderHistory();
    showLastSavedDay(dateKey);
    alert("Saved today to history!");
  }

  /**
   * Rebuild the "History (by Day)" table.
   * Shows all saved days in descending date order.
   */
  function renderHistory(){
    const days = loadDays();

    // Convert map to array and sort newest → oldest
    const rows = Object.values(days).sort((a,b) => a.date < b.date ? 1 : -1);

    els.historyTableBody.innerHTML = "";

    rows.forEach(d => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.date}</td>
        <td>${d.calls}</td>
        <td>${d.contacts}</td>
        <td>${d.appointments}</td>
        <td><strong>${d.total}</strong></td>`;
      els.historyTableBody.appendChild(tr);
    });
  }

  /**
   * Populate the "Last saved day's notes & schedule" section.
   * If dateKey is passed, use that; otherwise, pick the most recent date.
   */
  function showLastSavedDay(dateKey){
    const days = loadDays();
    const dk = dateKey || Object.keys(days).sort().pop(); // last (max) date

    if (!dk) {
      // No history entries at all
      els.lastDayTitle.textContent = "No day saved yet";
      els.lastSchedule.textContent = "";
      els.lastNotes.textContent    = "";
      return;
    }

    const d = days[dk];
    els.lastDayTitle.textContent = `Saved Day: ${dk}`;
    els.lastSchedule.textContent = d.schedule || "";
    els.lastNotes.textContent    = d.notes    || "";
  }

  // ------------------------------------------------------------------
  //  BACKUP / RESTORE (FULL JSON EXPORT)
  // ------------------------------------------------------------------

  /**
   * Helper to quickly download a file (JSON/CSV/etc) from a string.
   */
  function downloadFile(name, text, type="application/json"){
    const blob = new Blob([text], {type});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");

    a.href = url;
    a.download = name;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Build a "full backup" JSON object and download it.
   * Includes:
   *  - CURRENT, DATA, NOTES, SCHEDULE, DAYS
   *  plus metadata: _tracker, _version, savedAt
   */
  function backupAll(){
    const payload = {
      _tracker: "hourly-team-tracker", // sanity check flag
      _version: 1,
      savedAt: new Date().toISOString(),

      CURRENT: localStorage.getItem(KEYS.CURRENT) || null,
      DATA: loadMap(KEYS.DATA, {}),
      NOTES: loadMap(KEYS.NOTES, {}),
      SCHEDULE: loadMap(KEYS.SCHEDULE, {}),
      DAYS: loadMap(KEYS.DAYS, {})
    };

    downloadFile(
      `tracker-backup-${todayKey()}.json`,
      JSON.stringify(payload, null, 2) // pretty-print JSON
    );
  }

  /**
   * Restore from a backup JSON file selected from disk.
   * Overwrites current localStorage keys with the backup contents.
   */
  function restoreAll(file){
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);

        // Quick sanity check that this is actually one of our backups
        if (obj._tracker !== "hourly-team-tracker") {
          alert("This file doesn't look like a tracker backup.");
          return;
        }

        if (!confirm("Restore backup? This will overwrite current data.")) {
          return;
        }

        // Put everything back into localStorage, using safe defaults
        if (obj.CURRENT) localStorage.setItem(KEYS.CURRENT, obj.CURRENT);
        saveMap(KEYS.DATA,     obj.DATA     || {});
        saveMap(KEYS.NOTES,    obj.NOTES    || {});
        saveMap(KEYS.SCHEDULE, obj.SCHEDULE || {});
        saveMap(KEYS.DAYS,     obj.DAYS     || {});

        // Reload per-day text areas and visuals
        loadDailyTextBoxes();
        render();
        renderHistory();
        showLastSavedDay();
        alert("Backup restored!");
      } catch(e) {
        alert("Could not read backup file.");
      }
    };

    reader.readAsText(file);
  }

  // ------------------------------------------------------------------
  //  CSV EXPORT HELPERS (HOURLY + HISTORY)
  // ------------------------------------------------------------------

  /**
   * Export today's hourly breakdown as CSV.
   */
  function exportHourlyCsv(){
    const map = loadData();
    const ids = getTodayIds();

    let csv = "Hour,Calls,Contacts,Appointments,Total\n";

    ids.forEach(id => {
      const m = map[id];
      const c = m.calls        || 0;
      const n = m.contacts     || 0;
      const a = m.appointments || 0;
      csv += `${fmtHour(parseHourId(id))},${c},${n},${a},${c + n + a}\n`;
    });

    downloadFile(`hourly_${todayKey()}.csv`, csv, "text/csv");
  }

  /**
   * Export all saved days (history) as CSV.
   * Note: Notes/Schedule columns are quoted & escaped.
   */
  function exportHistoryCsv(){
    const days = loadDays();

    // Sort ascending by date so CSV reads in chronological order
    const list = Object.values(days).sort((a,b) => a.date.localeCompare(b.date));

    let csv = "Date,Calls,Contacts,Appointments,Total,Notes,Schedule\n";

    list.forEach(d => {
      // Escape quotes + newlines for safe CSV
      const esc = s =>
        `"${String(s || "")
          .replace(/"/g,'""')   // " → ""
          .replace(/\r?\n/g,' ') // newlines → space
        }"`;

      csv += `${d.date},${d.calls},${d.contacts},${d.appointments},${d.total},${esc(d.notes)},${esc(d.schedule)}\n`;
    });

    downloadFile("history.csv", csv, "text/csv");
  }

  // ------------------------------------------------------------------
  //  CLOCK + GLOBAL RENDER
  // ------------------------------------------------------------------

  /**
   * Update the top-right date/time display in the header.
   */
  function updateClock(){
    const now = new Date();
    els.nowDate.textContent = now.toDateString(); // "Mon Nov 24 2025"
    els.nowHour.textContent = fmtHour(now);
  }

  /**
   * Central render function:
   * - counters
   * - chart
   * - hourly table
   */
  function render(){
    renderCounts();
    renderChart();
    renderTable();
  }

  // ------------------------------------------------------------------
  //  EVENT LISTENERS
  // ------------------------------------------------------------------

  // Delegate clicks for all metric buttons using data-* attributes
  document.addEventListener("click", e => {
    const t = e.target;
    if (t.dataset?.inc) bump(t.dataset.inc, 1);     // +1
    if (t.dataset?.dec) bump(t.dataset.dec, -1);    // -1
    if (t.dataset?.clr) resetMetric(t.dataset.clr); // reset
  });

  // Manual "Close Hour" button – closes current hour and re-renders
  els.manualHourClose.addEventListener("click", () => {
    closeHour(getCurrentId());
    render();
  });

  // Add today to history
  els.addDayToHistory.addEventListener("click", addDayToHistory);

  // Export hourly CSV
  els.exportCsv.addEventListener("click", exportHourlyCsv);

  // Export full history CSV (optional chaining in case button doesn’t exist)
  els.exportHistoryCsv?.addEventListener("click", exportHistoryCsv);

  // Full backup download
  els.backupAll?.addEventListener("click", backupAll);

  // Restore from selected backup file
  els.restoreFile?.addEventListener("change", e => {
    if (e.target.files && e.target.files[0]) {
      restoreAll(e.target.files[0]);
    }
    // Reset value so selecting the same file again will still fire change
    e.target.value = "";
  });

  // Clear ALL stored data and reset app
  els.clearAll.addEventListener("click", () => {
    if (confirm("Clear ALL hourly data, notes, schedule, and history?")) {
      localStorage.removeItem(KEYS.DATA);
      localStorage.removeItem(KEYS.CURRENT);
      localStorage.removeItem(KEYS.NOTES);
      localStorage.removeItem(KEYS.SCHEDULE);
      localStorage.removeItem(KEYS.DAYS);

      ensureCurrentHour();
      loadDailyTextBoxes();
      render();
      renderHistory();
      showLastSavedDay();
    }
  });

  // ------------------------------------------------------------------
  //  AUTOMATIC HOURLY ROLLOVER
  // ------------------------------------------------------------------

  // Track the last known hour; if hour changes, close old bucket
  let lastId = ensureCurrentHour();

  // Check every 30s whether a new hour started; if so, close & flip
  setInterval(() => {
    const id = getCurrentId();
    if (id !== lastId) {
      closeHour(lastId);
      ensureCurrentHour();
      lastId = id;
      render();
    }
  }, 30000);

  // Update the header clock every 10s (doesn't need to be per-second precise)
  setInterval(updateClock, 10000);

  // ------------------------------------------------------------------
  //  INITIAL APP BOOTSTRAP
  // ------------------------------------------------------------------
  ensureCurrentHour();       // make sure we have a bucket for this hour
  loadDailyTextBoxes();      // load today's notes/schedule into textareas
  render();                  // draw counts, chart, hourly table
  renderHistory();           // build history table
  showLastSavedDay();        // show last saved day preview
  updateClock();             // initial time display

})();
