// Wrap in an IIFE so nothing leaks into global scope
(function(){

  // All the DOM elements this page needs, grabbed once up front
  const els = {
    datePicker: document.getElementById('datePicker'),   // <input type="date">
    dateLabel: document.getElementById('dateLabel'),     // label showing active date
    form: document.getElementById('scheduleForm'),       // main add-entry form
    time: document.getElementById('timeInput'),          // time input (HH:MM)
    zip: document.getElementById('zipInput'),            // zip input (only for Mobile)
    name: document.getElementById('nameInput'),          // customer name
    clearToday: document.getElementById('clearToday'),   // clear all rows for active date
    exportCsv: document.getElementById('exportCsv'),     // export full schedule as CSV
    tableBody: document.querySelector('#schedTable tbody'), // table body for entries
  };

  // Single localStorage key for schedule entries
  const KEYS = {
    // SCHED_ENTRIES is a big object:
    // {
    //   'YYYY-MM-DD': [
    //      { time: "HH:MM", zip, mode, name, createdAt },
    //      ...
    //   ],
    //   ...
    // }
    SCHED_ENTRIES: 'htt_sched_entries_v1'
  };

  // ------------------------
  //   SMALL UTILITY HELPERS
  // ------------------------

  // Zero-pad to two digits (3 → "03")
  const pad2 = n => String(n).padStart(2,'0');

  // Today's date as "YYYY-MM-DD" (used as the per-day key)
  const todayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  };

  /**
   * Convert "HH:MM" time string to minutes since midnight.
   * - Used for sorting rows by time.
   * - If invalid or missing, return a large value so it sorts to bottom.
   */
  const timeToMinutes = (hhmm) => {
    if(!/^\d{2}:\d{2}$/.test(hhmm||"")) return 24*60+1; // sort unknown to bottom
    const [h,m] = hhmm.split(':').map(Number);
    return h*60+m;
  };

  /**
   * Display-friendly string for when a row was added
   * (from stored ms timestamp).
   */
  const formatTimeAdded = (ms) => {
    const when = new Date(ms);
    return when.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  };

  // Tracks which row is currently in "edit" mode (or null if none)
  // Shape: { dateKey, index }
  let editing = null;

  // ------------------------
  //   STORAGE HELPERS
  // ------------------------

  /**
   * Load the entire schedule store from localStorage.
   * Returns an object of shape { 'YYYY-MM-DD': [entries...] }.
   */
  function loadStore(){
    try {
      return JSON.parse(localStorage.getItem(KEYS.SCHED_ENTRIES)) || {};
    } catch {
      return {};
    }
  }

  /**
   * Save the whole schedule store back to localStorage.
   */
  function saveStore(obj){
    localStorage.setItem(KEYS.SCHED_ENTRIES, JSON.stringify(obj));
  }

  // ------------------------
  //   ACTIVE DATE HANDLING
  // ------------------------

  /**
   * Set the date picker (and its label) to today's date.
   */
  function setDateToToday(){
    const t = todayKey();
    els.datePicker.value = t;
    els.dateLabel.textContent = t;
  }

  /**
   * Get the currently "active" date:
   * - if the picker has a value, use that
   * - else default to today's date
   */
  function getActiveDate(){
    return els.datePicker.value || todayKey();
  }

  // ------------------------
  //   ENTRY GET/SAVE HELPERS
  // ------------------------

  /**
   * Get a **copy** of the entries array for a given dateKey.
   * (We clone via slice so edits don't mutate the store directly.)
   */
  function getEntriesFor(dateKey){
    const store = loadStore();
    return (store[dateKey] || []).slice();
  }

  /**
   * Save an array of entries for a given dateKey.
   * - Always sorts the list by time (then by createdAt) to keep order clean.
   */
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

  // ------------------------
  //   ADD ENTRY VIA FORM
  // ------------------------

  /**
   * Main "Add" form submit:
   * - Validates fields
   * - Handles mode-specific zip logic
   * - Pushes entry into the store for the active date
   * - Re-renders table
   */
  els.form.addEventListener('submit', (e)=>{
    e.preventDefault();

    const dateKey = getActiveDate();
    const time = (els.time.value || '').trim();
    const zip = els.zip.value.trim();
    const name = els.name.value.trim();

    // Selected mode (Mobile or Office)
    const mode = (els.form.querySelector('input[name="mode"]:checked') || {}).value || 'Mobile';

    // --- Basic validation ---

    // Time required in HH:MM format
    if(!/^\d{2}:\d{2}$/.test(time)){
      alert("Time is required (HH:MM).");
      els.time.focus();
      return;
    }

    // Name required
    if(!name){
      alert("Name is required.");
      els.name.focus();
      return;
    }

    // Zip is required only if mode is Mobile
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

    // If Office, we ignore zip and store "" so column is blank
    const finalZip = mode === "Mobile" ? zip : "";

    // Add new row to existing list for that date
    const list = getEntriesFor(dateKey);
    list.push({ time, zip: finalZip, mode, name, createdAt: Date.now() });
    saveEntriesFor(dateKey, list);

    // Reset inputs after add:
    // - clear zip & name
    // - keep time + mode (handy if you're inputting a lot in a row)
    els.zip.value = "";
    els.name.value = "";

    renderTable();
    els.name.focus(); // focus name so it's quick to add the next one
  });

  // ------------------------
  //   MODE SWITCH: FORM ZIP ENABLE/DISABLE
  // ------------------------

  // When toggling between Mobile / Office radio buttons for new entry:
  // - Office => disable zip + clear value
  // - Mobile => enable zip
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

  // Initialize zip disabled state on load, based on default selected mode
  (function initZipDisabled(){
    // 🔧 FIXED: removed stray quote that was breaking the script
    const mode = (els.form.querySelector('input[name="mode"]:checked') || {}).value || 'Mobile';
    els.zip.disabled = (mode === 'Office');
  })();

  // ------------------------
  //   TABLE RENDERING
  // ------------------------

  /**
   * Rebuild the schedule table for the active date.
   * - Handles both normal view rows and "editing" row.
   */
  function renderTable(){
    const dateKey = getActiveDate();
    els.dateLabel.textContent = dateKey;

    const rows = getEntriesFor(dateKey);

    // Ensure sorted before rendering (in case external edits happen)
    rows.sort((a,b)=>{
      const ta = timeToMinutes(a.time), tb = timeToMinutes(b.time);
      if(ta !== tb) return ta - tb;
      return (a.createdAt||0) - (b.createdAt||0);
    });

    els.tableBody.innerHTML = "";

    rows.forEach((row, i)=>{
      // If this row is the one being edited, render inline-edit controls
      if(editing && editing.dateKey === dateKey && editing.index === i){
        const tr = document.createElement('tr');
        tr.className = row.mode === 'Mobile' ? 'row-mobile' : 'row-office';

        tr.innerHTML = `
          <td>${i+1}</td>
          <td>
            <input type="time" class="inrow time" value="${row.time || ''}" required>
          </td>
          <td>
            <input type="number" class="inrow zip"
              value="${row.mode==='Mobile' ? (row.zip||'') : ''}"
              ${row.mode==='Office' ? 'disabled' : ''}
              placeholder="zip">
          </td>
          <td>
            <label class="tag-radio">
              <input type="radio" name="edit_mode_${i}" value="Mobile" ${row.mode==='Mobile'?'checked':''}> Mobile
            </label>
            <label class="tag-radio">
              <input type="radio" name="edit_mode_${i}" value="Office" ${row.mode==='Office'?'checked':''}> Office
            </label>
          </td>
          <td>
            <input type="text" class="inrow name"
              value="${escapeHtml(row.name)}"
              placeholder="name">
          </td>
          <td>${formatTimeAdded(row.createdAt)}</td>
          <td>
            <button class="btn small primary" data-save="${i}">Save</button>
            <button class="btn small ghost" data-cancel="${i}">Cancel</button>
          </td>
        `;
        els.tableBody.appendChild(tr);

        // When editing mode switches in the row, update zip enable/disable + row style
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
        // Normal display row (not currently being edited)
        const tr = document.createElement('tr');
        tr.className = row.mode === 'Mobile' ? 'row-mobile' : 'row-office';

        tr.innerHTML = `
          <td>${i+1}</td>
          <td>${row.time || ''}</td>
          <td>${row.zip ? row.zip : ''}</td>
          <td>
            <span class="chip ${row.mode==='Mobile'?'chip-mobile':'chip-office'}">${row.mode}</span>
          </td>
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

    // If we deleted the last row that was being edited, clear editing state
    if(editing && editing.index >= rows.length){
      editing = null;
      renderTable();
    }
  }

  /**
   * Escape HTML characters so user-entered names don't break the table.
   */
  function escapeHtml(s){
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  // ------------------------
  //   ROW ACTIONS (EDIT/DELETE/SAVE/CANCEL)
  // ------------------------

  // Use event delegation: one listener for all table buttons
  document.addEventListener('click', (e)=>{
    // DELETE row
    const del = e.target.getAttribute('data-del');
    if(del != null){
      const index = Number(del);
      const dateKey = getActiveDate();
      const list = getEntriesFor(dateKey);

      list.splice(index, 1);            // remove entry
      saveEntriesFor(dateKey, list);    // save updated list

      if(editing && editing.index === index) editing = null;
      renderTable();
      return;
    }

    // EDIT row → put that row into inline edit mode
    const ed = e.target.getAttribute('data-edit');
    if(ed != null){
      editing = { dateKey: getActiveDate(), index: Number(ed) };
      renderTable();
      return;
    }

    // CANCEL edit → reset editing state and re-render row normally
    const cancel = e.target.getAttribute('data-cancel');
    if(cancel != null){
      editing = null;
      renderTable();
      return;
    }

    // SAVE edit → validate + write changes back to store
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

      // Same validations as "Add" flow
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

      // Apply edits back to the row object
      row.time = time;
      row.mode = mode;
      row.name = name;
      row.zip  = (mode === 'Mobile') ? zip : '';
      // Keep row.createdAt as-is

      list[index] = row;
      saveEntriesFor(dateKey, list); // ensures re-sorted by time
      editing = null;
      renderTable();
    }
  });

  // ------------------------
  //   CLEAR TODAY
  // ------------------------

  els.clearToday.addEventListener('click', ()=>{
    const dateKey = getActiveDate();
    if(getEntriesFor(dateKey).length === 0) return;  // nothing to clear

    if(!confirm(`Clear all entries for ${dateKey}?`)) return;

    saveEntriesFor(dateKey, []);  // store empty array for that date
    editing = null;
    renderTable();
  });

  // ------------------------
  //   EXPORT CSV
  // ------------------------

  /**
   * Export all schedule data (for all days) as CSV:
   * Columns: Date, Time, Zip, Mode, Name, Time Added
   */
  els.exportCsv.addEventListener('click', ()=>{
    const store = loadStore();
    const all = [];

    // Sort by date (ascending), then by time within each date
    Object.keys(store).sort().forEach(date=>{
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

    // Build CSV string
    let csv = "Date,Time,Zip,Mode,Name,Time Added\n";
    all.forEach(row=>{
      const esc = s => `"${String(s).replace(/"/g,'""')}"`; // escape quotes
      csv += row.map(esc).join(",") + "\n";
    });

    // Trigger download
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  // ------------------------
  //   DATE SWITCHING
  // ------------------------

  // When user changes the date picker:
  // - cancel any active editing
  // - re-render table for the new date
  els.datePicker.addEventListener('change', ()=>{
    editing = null; // cancel any edit when switching days
    renderTable();
  });

  // ------------------------
  //   INITIAL PAGE BOOTSTRAP
  // ------------------------

  setDateToToday(); // default active date is today
  renderTable();    // draw initial (possibly empty) table

})();
