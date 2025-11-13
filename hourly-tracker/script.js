(function(){
  const els = {
    nowDate: document.getElementById('nowDate'),
    nowHour: document.getElementById('nowHour'),
    calls: document.getElementById('count-calls'),
    contacts: document.getElementById('count-contacts'),
    appointments: document.getElementById('count-appointments'),
    chart: document.getElementById('chart'),
    tableBody: document.querySelector('#dataTable tbody'),
    exportCsv: document.getElementById('exportCsv'),
    exportHistoryCsv: document.getElementById('exportHistoryCsv'),
    manualHourClose: document.getElementById('manualHourClose'),
    addDayToHistory: document.getElementById('addDayToHistory'),
    clearAll: document.getElementById('clearAll'),
    notesBox: document.getElementById('notesBox'),
    scheduleBox: document.getElementById('scheduleBox'),
    historyTableBody: document.querySelector('#historyTable tbody'),
    lastDayTitle: document.getElementById('lastDayTitle'),
    lastSchedule: document.getElementById('lastSchedule'),
    lastNotes: document.getElementById('lastNotes'),
    backupAll: document.getElementById('backupAll'),
    restoreFile: document.getElementById('restoreFile')
  };

  const KEYS = {
    CURRENT: 'htt_current',      // open hour id
    DATA: 'htt_data_v2',         // hourly data map
    NOTES: 'htt_notes_v1',       // daily notes map
    SCHEDULE: 'htt_schedule_v1', // daily schedule map
    DAYS: 'htt_days_v1'          // saved-by-day history
  };

  // ---- one-time migration: merge v1 hourly data into v2 if needed ----
(function migrateFromV1IfNeeded(){
  try {
    const rawV2 = localStorage.getItem('htt_data_v2');
    const rawV1 = localStorage.getItem('htt_data_v1') || localStorage.getItem('htt_data'); // extra fallback
    const v2 = rawV2 ? JSON.parse(rawV2) : {};
    const v1 = rawV1 ? JSON.parse(rawV1) : null;

    if (v1 && typeof v1 === 'object') {
      // only merge if v2 is empty OR missing those hours
      let merged = {...v1, ...v2}; // v2 values win if same hour exists
      localStorage.setItem('htt_data_v2', JSON.stringify(merged));
      console.log(`Migrated ${Object.keys(v1).length} hour(s) from v1 → v2`);
    } else {
      console.log('No v1 hourly data detected to migrate.');
    }
  } catch(e) {
    console.warn('Migration failed:', e);
  }
})();

  /* ---------- helpers ---------- */
  const pad2 = n => String(n).padStart(2,'0');
  const fmtHour = dt => dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  const todayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  };
  const hourIdFromDate = dt => `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}`;
  const parseHourId = id => {
    const [datePart, hourPart] = id.split('T');
    const [y,m,d] = datePart.split('-').map(Number);
    return new Date(y, m-1, d, Number(hourPart));
  };
  const loadMap = (k, fallback={}) => {
    try { return JSON.parse(localStorage.getItem(k)) || fallback; }
    catch { return fallback; }
  };
  const saveMap = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ---------- hourly core ---------- */
  const loadData = () => loadMap(KEYS.DATA, {});
  const saveData = (m) => saveMap(KEYS.DATA, m);
  const getCurrentId = () => hourIdFromDate(new Date());

  function ensureCurrentHour(){
    const map = loadData();
    const id = getCurrentId();
    const open = localStorage.getItem(KEYS.CURRENT);

    if(open && open !== id){ closeHour(open); }

    if(!map[id]){
      map[id] = { calls:0, contacts:0, appointments:0, openedAt: Date.now() };
      saveData(map);
    }
    localStorage.setItem(KEYS.CURRENT, id);
    return id;
  }

  function closeHour(id){
    const map = loadData();
    if(map[id] && !map[id].closedAt){
      map[id].closedAt = Date.now();
      saveData(map);
    }
  }

  function bump(metric, delta){
    const id = ensureCurrentHour();
    const map = loadData();
    map[id][metric] = Math.max(0, (map[id][metric]||0) + delta);
    saveData(map);
    render();
  }

  function resetMetric(metric){
    const id = ensureCurrentHour();
    const map = loadData();
    map[id][metric] = 0;
    saveData(map);
    render();
  }

  function renderCounts(){
    const id = ensureCurrentHour();
    const m = loadData()[id];
    els.calls.textContent = m.calls || 0;
    els.contacts.textContent = m.contacts || 0;
    els.appointments.textContent = m.appointments || 0;
  }

  function getTodayIds(){
    const prefix = todayKey();
    return Object.keys(loadData()).filter(id => id.startsWith(prefix)).sort();
  }

  function renderChart(){
    const map = loadData();
    const ids = getTodayIds();
    let maxTotal = 0;

    ids.forEach(id=>{
      const m = map[id];
      const total = (m.calls||0)+(m.contacts||0)+(m.appointments||0);
      if(total > maxTotal) maxTotal = total;
    });

    const scale = maxTotal ? 180/maxTotal : 0;
    els.chart.innerHTML = "";

    ids.forEach(id=>{
      const m = map[id];
      const bar = document.createElement("div");
      bar.className = "bar";
      const stack = document.createElement("div");
      stack.className = "stack";

      ['calls','contacts','appointments'].forEach(k=>{
        const seg = document.createElement("div");
        seg.className = "segment " + k;
        seg.style.height = `${(m[k]||0)*scale}px`;
        seg.title = `${k}: ${m[k]||0}`;
        stack.appendChild(seg);
      });

      const lbl = document.createElement("div");
      lbl.className = "label";
      lbl.textContent = fmtHour(parseHourId(id));

      bar.appendChild(stack);
      bar.appendChild(lbl);
      els.chart.appendChild(bar);
    });
  }

  function renderTable(){
    const map = loadData();
    const ids = getTodayIds();
    els.tableBody.innerHTML = "";
    ids.forEach(id=>{
      const m = map[id];
      const c = m.calls||0, n = m.contacts||0, a = m.appointments||0;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${fmtHour(parseHourId(id))}</td>
        <td>${c}</td>
        <td>${n}</td>
        <td>${a}</td>
        <td><strong>${c+n+a}</strong></td>`;
      els.tableBody.appendChild(tr);
    });
  }

  function getTodayTotals(){
    const map = loadData();
    const ids = getTodayIds();
    let calls=0, contacts=0, appointments=0;
    ids.forEach(id=>{
      const m = map[id];
      calls += m.calls||0;
      contacts += m.contacts||0;
      appointments += m.appointments||0;
    });
    return { calls, contacts, appointments, total:calls+contacts+appointments };
  }

  /* ---------- notes & schedule (per-day) ---------- */
  function loadDailyTextBoxes(){
    const notes = loadMap(KEYS.NOTES, {});
    const sched = loadMap(KEYS.SCHEDULE, {});
    const key = todayKey();
    els.notesBox.value = notes[key] || "";
    els.scheduleBox.value = sched[key] || "";
  }
  function saveDailyNotes(){
    const notes = loadMap(KEYS.NOTES, {});
    notes[todayKey()] = els.notesBox.value;
    saveMap(KEYS.NOTES, notes);
  }
  function saveDailySchedule(){
    const sched = loadMap(KEYS.SCHEDULE, {});
    sched[todayKey()] = els.scheduleBox.value;
    saveMap(KEYS.SCHEDULE, sched);
  }
  setInterval(()=>{ saveDailyNotes(); saveDailySchedule(); }, 1000);

  /* ---------- history (by day) ---------- */
  function loadDays(){ return loadMap(KEYS.DAYS, {}); }
  function saveDays(obj){ saveMap(KEYS.DAYS, obj); }

  function addDayToHistory(){
    const dateKey = todayKey();
    const totals = getTodayTotals();
    const notes = loadMap(KEYS.NOTES, {})[dateKey] || "";
    const schedule = loadMap(KEYS.SCHEDULE, {})[dateKey] || "";
    const days = loadDays();
    if(days[dateKey]){
      const ok = confirm("A day entry already exists for today. Overwrite it?");
      if(!ok) return;
    }
    days[dateKey] = { date: dateKey, ...totals, notes, schedule, savedAt: Date.now() };
    saveDays(days);
    renderHistory();
    showLastSavedDay(dateKey);
    alert("Saved today to history!");
  }

  function renderHistory(){
    const days = loadDays();
    const rows = Object.values(days).sort((a,b)=> a.date < b.date ? 1 : -1);
    els.historyTableBody.innerHTML = "";
    rows.forEach(d=>{
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

  function showLastSavedDay(dateKey){
    const days = loadDays();
    const dk = dateKey || Object.keys(days).sort().pop();
    if(!dk){
      els.lastDayTitle.textContent = "No day saved yet";
      els.lastSchedule.textContent = "";
      els.lastNotes.textContent = "";
      return;
    }
    const d = days[dk];
    els.lastDayTitle.textContent = `Saved Day: ${dk}`;
    els.lastSchedule.textContent = d.schedule || "";
    els.lastNotes.textContent = d.notes || "";
  }

  /* ---------- export/import (backup/restore) ---------- */
  function downloadFile(name, text, type="application/json"){
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function backupAll(){
    const payload = {
      _tracker: "hourly-team-tracker",
      _version: 1,
      savedAt: new Date().toISOString(),
      CURRENT: localStorage.getItem(KEYS.CURRENT) || null,
      DATA: loadMap(KEYS.DATA, {}),
      NOTES: loadMap(KEYS.NOTES, {}),
      SCHEDULE: loadMap(KEYS.SCHEDULE, {}),
      DAYS: loadMap(KEYS.DAYS, {})
    };
    downloadFile(`tracker-backup-${todayKey()}.json`, JSON.stringify(payload,null,2));
  }

  function restoreAll(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(reader.result);
        if(obj._tracker !== "hourly-team-tracker"){
          alert("This file doesn't look like a tracker backup.");
          return;
        }
        if(!confirm("Restore backup? This will overwrite current data.")) return;

        if(obj.CURRENT) localStorage.setItem(KEYS.CURRENT, obj.CURRENT);
        saveMap(KEYS.DATA, obj.DATA || {});
        saveMap(KEYS.NOTES, obj.NOTES || {});
        saveMap(KEYS.SCHEDULE, obj.SCHEDULE || {});
        saveMap(KEYS.DAYS, obj.DAYS || {});

        loadDailyTextBoxes();
        render();
        renderHistory();
        showLastSavedDay();
        alert("Backup restored!");
      }catch(e){
        alert("Could not read backup file.");
      }
    };
    reader.readAsText(file);
  }

  /* ---------- export CSV helpers ---------- */
  function exportHourlyCsv(){
    const map = loadData();
    const ids = getTodayIds();
    let csv = "Hour,Calls,Contacts,Appointments,Total\n";
    ids.forEach(id=>{
      const m = map[id]; const c=m.calls||0, n=m.contacts||0, a=m.appointments||0;
      csv += `${fmtHour(parseHourId(id))},${c},${n},${a},${c+n+a}\n`;
    });
    downloadFile(`hourly_${todayKey()}.csv`, csv, "text/csv");
  }

  function exportHistoryCsv(){
    const days = loadDays();
    const list = Object.values(days).sort((a,b)=> a.date.localeCompare(b.date));
    let csv = "Date,Calls,Contacts,Appointments,Total,Notes,Schedule\n";
    list.forEach(d=>{
      const esc = s => `"${String(s||"").replace(/"/g,'""').replace(/\r?\n/g,' ')}"`;
      csv += `${d.date},${d.calls},${d.contacts},${d.appointments},${d.total},${esc(d.notes)},${esc(d.schedule)}\n`;
    });
    downloadFile("history.csv", csv, "text/csv");
  }

  /* ---------- clock & render ---------- */
  function updateClock(){
    const now = new Date();
    els.nowDate.textContent = now.toDateString();
    els.nowHour.textContent = fmtHour(now);
  }

  function render(){
    renderCounts();
    renderChart();
    renderTable();
  }

  /* ---------- events ---------- */
  document.addEventListener("click", e=>{
    const t = e.target;
    if(t.dataset?.inc) bump(t.dataset.inc, 1);
    if(t.dataset?.dec) bump(t.dataset.dec, -1);
    if(t.dataset?.clr) resetMetric(t.dataset.clr);
  });

  els.manualHourClose.addEventListener("click", ()=>{
    closeHour(getCurrentId());
    render();
  });

  els.addDayToHistory.addEventListener("click", addDayToHistory);
  els.exportCsv.addEventListener("click", exportHourlyCsv);
  els.exportHistoryCsv?.addEventListener("click", exportHistoryCsv);
  els.backupAll?.addEventListener("click", backupAll);
  els.restoreFile?.addEventListener("change", e=>{
    if(e.target.files && e.target.files[0]) restoreAll(e.target.files[0]);
    e.target.value = "";
  });

  els.clearAll.addEventListener("click", ()=>{
    if(confirm("Clear ALL hourly data, notes, schedule, and history?")){
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

  // Hourly rollover check
  let lastId = ensureCurrentHour();
  setInterval(()=>{
    const id = getCurrentId();
    if(id !== lastId){
      closeHour(lastId);
      ensureCurrentHour();
      lastId = id;
      render();
    }
  }, 30000);

  setInterval(updateClock, 10000);

  /* ---------- init ---------- */
  ensureCurrentHour();
  loadDailyTextBoxes();
  render();
  renderHistory();
  showLastSavedDay();
  updateClock();
})();