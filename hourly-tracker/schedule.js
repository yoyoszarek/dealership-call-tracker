(function(){
  const els = {
    datePicker: document.getElementById('datePicker'),
    dateLabel: document.getElementById('dateLabel'),
    form: document.getElementById('scheduleForm'),
    time: document.getElementById('timeInput'),
    zip: document.getElementById('zipInput'),
    name: document.getElementById('nameInput'),
    clearToday: document.getElementById('clearToday'),
    exportCsv: document.getElementById('exportCsv'),
    tableBody: document.querySelector('#schedTable tbody'),
  };

  const KEYS = {
    // map: { 'YYYY-MM-DD': [ {time:"HH:MM", zip, mode, name, createdAt}, ... ] }
    SCHED_ENTRIES: 'htt_sched_entries_v1'
  };

  const pad2 = n => String(n).padStart(2,'0');
  const todayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  };
  const timeToMinutes = (hhmm) => {
    if(!/^\d{2}:\d{2}$/.test(hhmm||"")) return 24*60+1; // sort unknown to bottom
    const [h,m] = hhmm.split(':').map(Number);
    return h*60+m;
  };
  const formatTimeAdded = (ms) => {
    const when = new Date(ms);
    return when.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  };

  let editing = null; // {dateKey, index} or null

  function loadStore(){
    try { return JSON.parse(localStorage.getItem(KEYS.SCHED_ENTRIES)) || {}; }
    catch { return {}; }
  }
  function saveStore(obj){
    localStorage.setItem(KEYS.SCHED_ENTRIES, JSON.stringify(obj));
  }

  function setDateToToday(){
    const t = todayKey();
    els.datePicker.value = t;
    els.dateLabel.textContent = t;
  }
  function getActiveDate(){
    return els.datePicker.value || todayKey();
  }

  function getEntriesFor(dateKey){
    const store = loadStore();
    return (store[dateKey] || []).slice(); // copy
  }
  function saveEntriesFor(dateKey, list){
    // Always keep sorted by time ascending (unknown times at bottom)
    list.sort((a,b)=>{
      const ta = timeToMinutes(a.time), tb = timeToMinutes(b.time);
      if(ta !== tb) return ta - tb;
      return (a.createdAt||0) - (b.createdAt||0);
    });
    const store = loadStore();
    store[dateKey] = list;
    saveStore(store);
  }

  // ----- Add Entry -----
  els.form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const dateKey = getActiveDate();
    const time = (els.time.value || '').trim();
    const zip = els.zip.value.trim();
    const name = els.name.value.trim();
    const mode = (els.form.querySelector('input[name="mode"]:checked') || {}).value || 'Mobile';

    if(!/^\d{2}:\d{2}$/.test(time)){
      alert("Time is required (HH:MM).");
      els.time.focus();
      return;
    }

    if(!name){
      alert("Name is required.");
      els.name.focus();
      return;
    }

    // Zip required only for Mobile
    if(mode === "Mobile"){
      if(!zip){
        alert("Zip code is required for Mobile appointments.");
        els.zip.focus();
        return;
      }
      if(!/^\d{5}$/.test(zip)){
        alert("Zip must be a 5-digit number.");
        els.zip.focus();
        return;
      }
    }

    const finalZip = mode === "Mobile" ? zip : "";

    const list = getEntriesFor(dateKey);
    list.push({ time, zip: finalZip, mode, name, createdAt: Date.now() });
    saveEntriesFor(dateKey, list);

    // clear inputs (keep mode)
    // keep last time? UX: keep the last time is often helpful → we keep it
    els.zip.value = "";
    els.name.value = "";
    renderTable();
    els.name.focus();
  });

  // Enable/disable zip input when switching mode in the add form
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const mode = (els.form.querySelector('input[name="mode"]:checked') || {}).value || 'Mobile';
      if(mode === "Office"){
        els.zip.value = "";
        els.zip.disabled = true;
      } else {
        els.zip.disabled = false;
      }
    });
  });
  // Initialize once
  (function initZipDisabled(){
    const mode = (els.form.querySelector('input[name="mode"]:checked') || {}).value || 'Mobile';
    els.zip.disabled = (mode === 'Office');
  })();

  // ----- Table Rendering -----
  function renderTable(){
    const dateKey = getActiveDate();
    els.dateLabel.textContent = dateKey;
    const rows = getEntriesFor(dateKey);
    // sort in case external edits happened
    rows.sort((a,b)=>{
      const ta = timeToMinutes(a.time), tb = timeToMinutes(b.time);
      if(ta !== tb) return ta - tb;
      return (a.createdAt||0) - (b.createdAt||0);
    });
    els.tableBody.innerHTML = "";

    rows.forEach((row, i)=>{
      // editing row?
      if(editing && editing.dateKey === dateKey && editing.index === i){
        const tr = document.createElement('tr');
        tr.className = row.mode === 'Mobile' ? 'row-mobile' : 'row-office';
        tr.innerHTML = `
          <td>${i+1}</td>
          <td>
            <input type="time" class="inrow time" value="${row.time || ''}" required>
          </td>
          <td>
            <input type="number" class="inrow zip" value="${row.mode==='Mobile' ? (row.zip||'') : ''}" ${row.mode==='Office' ? 'disabled' : ''} placeholder="zip">
          </td>
          <td>
            <label class="tag-radio"><input type="radio" name="edit_mode_${i}" value="Mobile" ${row.mode==='Mobile'?'checked':''}> Mobile</label>
            <label class="tag-radio"><input type="radio" name="edit_mode_${i}" value="Office" ${row.mode==='Office'?'checked':''}> Office</label>
          </td>
          <td>
            <input type="text" class="inrow name" value="${escapeHtml(row.name)}" placeholder="name">
          </td>
          <td>${formatTimeAdded(row.createdAt)}</td>
          <td>
            <button class="btn small primary" data-save="${i}">Save</button>
            <button class="btn small ghost" data-cancel="${i}">Cancel</button>
          </td>
        `;
        els.tableBody.appendChild(tr);

        // enable/disable zip on mode change in edit row
        tr.querySelectorAll(`input[name="edit_mode_${i}"]`).forEach(r=>{
          r.addEventListener('change', ()=>{
            const mode = tr.querySelector(`input[name="edit_mode_${i}"]:checked`).value;
            const zipInput = tr.querySelector('.inrow.zip');
            if(mode === 'Office'){
              zipInput.value = '';
              zipInput.disabled = true;
              tr.className = 'row-office';
            } else {
              zipInput.disabled = false;
              tr.className = 'row-mobile';
            }
          });
        });

      } else {
        // normal display row
        const tr = document.createElement('tr');
        tr.className = row.mode === 'Mobile' ? 'row-mobile' : 'row-office';
        tr.innerHTML = `
          <td>${i+1}</td>
          <td>${row.time || ''}</td>
          <td>${row.zip ? row.zip : ''}</td>
          <td><span class="chip ${row.mode==='Mobile'?'chip-mobile':'chip-office'}">${row.mode}</span></td>
          <td>${escapeHtml(row.name)}</td>
          <td>${formatTimeAdded(row.createdAt)}</td>
          <td>
            <button class="btn small ghost" data-edit="${i}">Edit</button>
            <button class="btn small warn" data-del="${i}">Delete</button>
          </td>
        `;
        els.tableBody.appendChild(tr);
      }
    });

    // fix editing out-of-range after deletes
    if(editing && editing.index >= rows.length){
      editing = null;
      renderTable();
    }
  }

  function escapeHtml(s){
    return String(s||'').replace(/&/g,'&amp;')
      .replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  // ----- Row actions -----
  document.addEventListener('click', (e)=>{
    // delete
    const del = e.target.getAttribute('data-del');
    if(del != null){
      const index = Number(del);
      const dateKey = getActiveDate();
      const list = getEntriesFor(dateKey);
      list.splice(index, 1);
      saveEntriesFor(dateKey, list);
      if(editing && editing.index === index) editing = null;
      renderTable();
      return;
    }

    // edit
    const ed = e.target.getAttribute('data-edit');
    if(ed != null){
      editing = { dateKey: getActiveDate(), index: Number(ed) };
      renderTable();
      return;
    }

    // cancel
    const cancel = e.target.getAttribute('data-cancel');
    if(cancel != null){
      editing = null;
      renderTable();
      return;
    }

    // save
    const save = e.target.getAttribute('data-save');
    if(save != null){
      const index = Number(save);
      const dateKey = getActiveDate();
      const list = getEntriesFor(dateKey);
      const row = list[index];

      const tr = e.target.closest('tr');
      const time = (tr.querySelector('.inrow.time') || {}).value.trim();
      const name = (tr.querySelector('.inrow.name') || {}).value.trim();
      const mode = (tr.querySelector(`input[name="edit_mode_${index}"]:checked`) || {}).value || row.mode;
      const zipInput = tr.querySelector('.inrow.zip');
      const zip = zipInput ? zipInput.value.trim() : '';

      if(!/^\d{2}:\d{2}$/.test(time)){
        alert("Time is required (HH:MM).");
        return;
      }
      if(!name){
        alert("Name is required.");
        return;
      }
      if(mode === 'Mobile'){
        if(!zip){
          alert("Zip code is required for Mobile appointments.");
          return;
        }
        if(!/^\d{5}$/.test(zip)){
          alert("Zip must be a 5-digit number.");
          return;
        }
      }

      row.time = time;
      row.mode = mode;
      row.name = name;
      row.zip = (mode === 'Mobile') ? zip : '';
      // keep createdAt

      list[index] = row;
      saveEntriesFor(dateKey, list); // saves sorted by time
      editing = null;
      renderTable();
    }
  });

  // ----- Utility actions -----
  els.clearToday.addEventListener('click', ()=>{
    const dateKey = getActiveDate();
    if(getEntriesFor(dateKey).length === 0) return;
    if(!confirm(`Clear all entries for ${dateKey}?`)) return;
    saveEntriesFor(dateKey, []);
    editing = null;
    renderTable();
  });

  els.exportCsv.addEventListener('click', ()=>{
    const store = loadStore();
    const all = [];
    Object.keys(store).sort().forEach(date=>{
      // ensure sort within day
      const rows = (store[date] || []).slice().sort((a,b)=>{
        const ta = timeToMinutes(a.time), tb = timeToMinutes(b.time);
        if(ta !== tb) return ta - tb;
        return (a.createdAt||0) - (b.createdAt||0);
      });
      rows.forEach(r=>{
        const added = formatTimeAdded(r.createdAt);
        all.push([date, r.time||"", r.zip||"", r.mode||"", r.name||"", added]);
      });
    });
    let csv = "Date,Time,Zip,Mode,Name,Time Added\n";
    all.forEach(row=>{
      const esc = s => `"${String(s).replace(/"/g,'""')}"`;
      csv += row.map(esc).join(",") + "\n";
    });
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "schedule.csv"; a.click();
    URL.revokeObjectURL(url);
  });

  els.datePicker.addEventListener('change', ()=>{
    editing = null; // cancel any edit when switching days
    renderTable();
  });

  // ----- Init -----
  setDateToToday();
  renderTable();
})();