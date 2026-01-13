import {
  supabase, qs, fmtTime, fmtDateIT, ensureProfile, logout,
  roleLabel, slotStartDateTime, SITE_ORIGIN
} from "/app.js";

const instrLink = qs("#instrLink");
const logoutBtn = qs("#logoutBtn");
const who = qs("#who");
const roleBadge = qs("#roleBadge");

const loginCard = qs("#loginCard");
const loginEmail = qs("#loginEmail");
const loginBtn = qs("#loginBtn");
const loginToast = qs("#loginToast");

const appWrap = qs("#appWrap");

const fullNameEl = qs("#fullName");
const phoneEl = qs("#phone");
const saveProfileBtn = qs("#saveProfileBtn");
const profileToast = qs("#profileToast");

const refreshBtn = qs("#refreshBtn");

const availList = qs("#availList");
const availToast = qs("#availToast");

const myBox = qs("#myBox");
const myList = qs("#myList");
const myToast = qs("#myToast");

const instrBox = qs("#instrBox");
const instrList = qs("#instrList");
const instrToast = qs("#instrToast");

// Checklist (solo istruttori)
const checklistBox = qs("#checklistBox");
const volSearch = qs("#volSearch");
const checkToast = qs("#checkToast");
const volList = qs("#volList");

logoutBtn.addEventListener("click", logout);

function showToast(el, msg, type){
  el.style.display = "block";
  el.className = `toast ${type||""}`;
  el.textContent = msg;
}
function hideToast(el){ el.style.display = "none"; }

async function sendOtp(email){
  loginBtn.disabled = true;
  showToast(loginToast, "Invio link…", "");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE_ORIGIN}/dashboard.html` }
  });
  loginBtn.disabled = false;
  if(error) showToast(loginToast, error.message, "bad");
  else showToast(loginToast, "Link inviato ✅ Controlla email e clicca per entrare.", "ok");
}

loginBtn.addEventListener("click", async () => {
  const email = (loginEmail.value || "").trim();
  if(!email) return showToast(loginToast, "Inserisci un’email valida.", "bad");
  localStorage.setItem("last_email", email);
  await sendOtp(email);
});

let currentUser = null;
let role = "volunteer";

async function fetchProfilesMap(userIds){
  const map = new Map();
  if(!userIds || userIds.length === 0) return map;

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, phone, role")
    .in("user_id", userIds);

  if(error) return map;
  (data || []).forEach(p => map.set(p.user_id, p));
  return map;
}

function isFutureSlot(s){
  return slotStartDateTime(s.day, s.start_time).getTime() >= Date.now();
}

async function loadProfileToUI(){
  hideToast(profileToast);
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if(!error && data){
    fullNameEl.value = data.full_name ?? "";
    phoneEl.value = data.phone ?? "";
  }
}

saveProfileBtn.addEventListener("click", async () => {
  hideToast(profileToast);
  const full_name = (fullNameEl.value || "").trim();
  const phone = (phoneEl.value || "").trim();
  if(!full_name) return showToast(profileToast, "Inserisci Nome e Cognome.", "bad");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, phone: phone || null })
    .eq("user_id", currentUser.id);

  if(error) showToast(profileToast, error.message, "bad");
  else showToast(profileToast, "Salvato ✅", "ok");
});

/**
 * Accordion disponibilità:
 * - prende slot OPEN futuri
 * - rimuove quelli già prenotati (bookings CONFIRMED)
 * - raggruppa per istruttore+giorno
 * - da lì prenoti
 */
async function loadAvailabilityAccordion(){
  hideToast(availToast);
  availList.innerHTML = "";

  const { data: openSlots, error: e1 } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, instructor_id, status")
    .eq("status", "OPEN")
    .order("day", { ascending:true })
    .order("start_time", { ascending:true });

  if(e1) return showToast(availToast, e1.message, "bad");

  const futureOpen = (openSlots || []).filter(isFutureSlot);
  if(futureOpen.length === 0) return;

  const slotIds = futureOpen.map(s => s.id);
  const { data: bookedRows, error: e2 } = await supabase
    .from("bookings")
    .select("slot_id")
    .in("slot_id", slotIds)
    .eq("status", "CONFIRMED");

  if(e2) return showToast(availToast, e2.message, "bad");

  const booked = new Set((bookedRows || []).map(b => b.slot_id));
  const freeSlots = futureOpen.filter(s => !booked.has(s.id));
  if(freeSlots.length === 0) return;

  const instructorIds = [...new Set(freeSlots.map(s => s.instructor_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(instructorIds);

  const groups = new Map();
  for(const s of freeSlots){
    const p = profMap.get(s.instructor_id);
    const name = p?.full_name || "Istruttore";
    const key = `${s.instructor_id}||${s.day}`;
    if(!groups.has(key)) groups.set(key, { instructor_id: s.instructor_id, name, day: s.day, slots: [] });
    groups.get(key).slots.push(s);
  }

  [...groups.values()].forEach(g => {
    const header = document.createElement("div");
    header.className = "item";
    header.style.cursor = "pointer";
    header.dataset.open = "0";

    const caret = document.createElement("span");
    caret.className = "badge";
    caret.textContent = "Apri ▾";

    header.innerHTML = `
      <div>
        <strong>${g.name}</strong>
        <div class="meta">${fmtDateIT(g.day)} • ${g.slots.length} slot disponibili</div>
      </div>
    `;
    header.appendChild(caret);

    const panel = document.createElement("div");
    panel.style.display = "none";
    panel.style.marginTop = "10px";

    const panelList = document.createElement("div");
    panelList.className = "list";
    panelList.style.marginTop = "0";

    g.slots.sort((a,b) => (a.start_time||"").localeCompare(b.start_time||""));

    g.slots.forEach(s => {
      const row = document.createElement("div");
      row.className = "item";
      row.style.background = "rgba(255,255,255,.02)";
      row.innerHTML = `
        <div>
          <strong>${fmtTime(s.start_time)}–${fmtTime(s.end_time)}</strong>
          <div class="meta">${fmtDateIT(s.day)}</div>
        </div>
        <button class="btn primary">Prenota</button>
      `;
      row.querySelector("button").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const { error } = await supabase.from("bookings").insert({
          slot_id: s.id,
          volunteer_id: currentUser.id,
          status: "CONFIRMED"
        });
        if(error) showToast(availToast, error.message, "bad");
        else {
          showToast(availToast, "Prenotazione confermata ✅", "ok");
          await refreshAll();
        }
      });
      panelList.appendChild(row);
    });

    panel.appendChild(panelList);

    const container = document.createElement("div");
    container.style.width = "100%";
    container.appendChild(header);
    container.appendChild(panel);

    header.addEventListener("click", () => {
      const open = header.dataset.open === "1";
      header.dataset.open = open ? "0" : "1";
      panel.style.display = open ? "none" : "block";
      caret.textContent = open ? "Apri ▾" : "Chiudi ▴";
    });

    availList.appendChild(container);
  });
}

async function loadMyBookingsFuture(){
  hideToast(myToast);
  myList.innerHTML = "";

  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id, status, created_at, slot_id")
    .eq("volunteer_id", currentUser.id)
    .eq("status", "CONFIRMED")
    .order("created_at", { ascending:false });

  if(error) return showToast(myToast, error.message, "bad");
  if(!rows || rows.length === 0) return;

  const slotIds = [...new Set(rows.map(r => r.slot_id))];
  const { data: slots, error: sErr } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, instructor_id")
    .in("id", slotIds);

  if(sErr) return showToast(myToast, sErr.message, "bad");

  const slotById = new Map((slots || []).map(s => [s.id, s]));
  const future = rows.filter(r => {
    const s = slotById.get(r.slot_id);
    return s && isFutureSlot(s);
  });
  if(future.length === 0) return;

  const instructorIds = [...new Set(future.map(r => slotById.get(r.slot_id).instructor_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(instructorIds);

  future.forEach(r => {
    const s = slotById.get(r.slot_id);
    const instr = profMap.get(s.instructor_id)?.full_name || "Istruttore";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${fmtDateIT(s.day)} • ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}</strong>
        <div class="meta">${instr}</div>
      </div>
      <button class="btn danger">Annulla</button>
    `;
    div.querySelector("button").addEventListener("click", async () => {
      const { error } = await supabase.from("bookings").update({ status:"CANCELLED" }).eq("id", r.id);
      if(error) showToast(myToast, error.message, "bad");
      else {
        showToast(myToast, "Prenotazione annullata.", "");
        await refreshAll();
      }
    });
    myList.appendChild(div);
  });
}

async function loadInstructorBookingsFuture(){
  hideToast(instrToast);
  instrList.innerHTML = "";

  const { data: slots, error: sErr } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time")
    .eq("instructor_id", currentUser.id)
    .order("day", { ascending:true })
    .order("start_time", { ascending:true });

  if(sErr) return showToast(instrToast, sErr.message, "bad");

  const futureSlots = (slots || []).filter(isFutureSlot);
  if(futureSlots.length === 0) return;

  const slotById = new Map(futureSlots.map(s => [s.id, s]));
  const slotIds = futureSlots.map(s => s.id);

  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("id, slot_id, volunteer_id, status, created_at")
    .in("slot_id", slotIds)
    .eq("status", "CONFIRMED")
    .order("created_at", { ascending:true });

  if(bErr) return showToast(instrToast, bErr.message, "bad");
  if(!bookings || bookings.length === 0) return;

  const volunteerIds = [...new Set(bookings.map(b => b.volunteer_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(volunteerIds);

  bookings.forEach(b => {
    const s = slotById.get(b.slot_id);
    if(!s) return;
    const p = profMap.get(b.volunteer_id);
    const name = p?.full_name || "—";
    const phone = p?.phone || "—";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${fmtDateIT(s.day)} • ${fmtTime(s.start_time)}–${fmtTime(s.end_time)} — ${name}</strong>
        <div class="meta">Telefono: ${phone}</div>
      </div>
      <span class="badge">Iscritto</span>
    `;
    instrList.appendChild(div);
  });
}

// ===== Checklist (solo istruttori/admin) =====
function show(el, msg, type){
  el.style.display = "block";
  el.className = `toast ${type||""}`;
  el.textContent = msg;
}

let trainingItems = [];
let volunteers = [];
let progressMap = new Map();
function k(vid, iid){ return `${vid}|${iid}`; }

async function loadTrainingData(){
  hideToast(checkToast);

  const { data: items, error: e1 } = await supabase
    .from("training_items")
    .select("id,label,sort")
    .order("sort", { ascending:true });

  if(e1) { show(checkToast, e1.message, "bad"); return; }
  trainingItems = items || [];

  const { data: vols, error: e2 } = await supabase
    .from("profiles")
    .select("user_id, full_name, phone")
    .eq("role", "volunteer")
    .order("full_name", { ascending:true });

  if(e2) { show(checkToast, e2.message, "bad"); return; }
  volunteers = vols || [];

  const { data: prog, error: e3 } = await supabase
    .from("training_progress")
    .select("volunteer_id,item_id,checked");

  if(e3) { show(checkToast, e3.message, "bad"); return; }

  progressMap = new Map();
  (prog || []).forEach(r => progressMap.set(k(r.volunteer_id, r.item_id), !!r.checked));
}

function renderVolunteers(filterText=""){
  volList.innerHTML = "";
  const f = (filterText || "").trim().toLowerCase();

  const list = volunteers.filter(v => {
    const name = (v.full_name || "").toLowerCase();
    return !f || name.includes(f);
  });

  if(list.length === 0){
    const empty = document.createElement("div");
    empty.className = "item";
    empty.innerHTML = `<div><strong>Nessun volontario trovato</strong><div class="meta">Prova a cambiare ricerca.</div></div>`;
    volList.appendChild(empty);
    return;
  }

  list.forEach(v => {
    const wrap = document.createElement("div");
    wrap.style.width = "100%";

    const header = document.createElement("div");
    header.className = "item";
    header.style.cursor = "pointer";
    header.dataset.open = "0";

    const caret = document.createElement("span");
    caret.className = "badge";
    caret.textContent = "Apri ▾";

    const name = v.full_name || "Volontario";
    const phone = v.phone || "—";

    header.innerHTML = `
      <div>
        <strong>${name}</strong>
        <div class="meta">Telefono: ${phone}</div>
      </div>
    `;
    header.appendChild(caret);

    const panel = document.createElement("div");
    panel.style.display = "none";
    panel.style.marginTop = "10px";

    const card = document.createElement("div");
    card.className = "card";
    card.style.background = "rgba(17,27,46,.28)";

    const grid = document.createElement("div");
    grid.className = "grid";
    grid.style.gap = "10px";

    trainingItems.forEach(item => {
      const row = document.createElement("label");
      row.className = "item";
      row.style.justifyContent = "flex-start";
      row.style.gap = "12px";
      row.style.cursor = "pointer";

      const checked = progressMap.get(k(v.user_id, item.id)) === true;

      row.innerHTML = `
        <input type="checkbox" ${checked ? "checked": ""} style="transform:scale(1.2); margin-right:6px;">
        <div>
          <strong>${item.label}</strong>
          <div class="meta">Spunta quando completato</div>
        </div>
      `;

      const cb = row.querySelector("input");
      cb.addEventListener("change", async () => {
        const newVal = cb.checked;
        progressMap.set(k(v.user_id, item.id), newVal);

        const { error } = await supabase
          .from("training_progress")
          .upsert({
            volunteer_id: v.user_id,
            item_id: item.id,
            checked: newVal,
            updated_by: currentUser.id
          }, { onConflict: "volunteer_id,item_id" });

        if(error){
          progressMap.set(k(v.user_id, item.id), !newVal);
          cb.checked = !newVal;
          show(checkToast, error.message, "bad");
        } else {
          show(checkToast, "Salvato ✅", "ok");
          setTimeout(() => { checkToast.style.display = "none"; }, 900);
        }
      });

      grid.appendChild(row);
    });

    card.appendChild(grid);
    panel.appendChild(card);

    header.addEventListener("click", () => {
      const open = header.dataset.open === "1";
      header.dataset.open = open ? "0" : "1";
      panel.style.display = open ? "none" : "block";
      caret.textContent = open ? "Apri ▾" : "Chiudi ▴";
    });

    wrap.appendChild(header);
    wrap.appendChild(panel);
    volList.appendChild(wrap);
  });
}

if(volSearch){
  volSearch.addEventListener("input", () => {
    renderVolunteers(volSearch.value || "");
  });
}

// ===== Refresh =====
async function refreshAll(){
  await loadAvailabilityAccordion();

  if(role === "instructor" || role === "admin"){
    myBox.style.display = "none";
    instrBox.style.display = "block";
    await loadInstructorBookingsFuture();

    checklistBox.style.display = "block";
    await loadTrainingData();
    renderVolunteers(volSearch?.value || "");
  } else {
    instrBox.style.display = "none";
    myBox.style.display = "block";
    await loadMyBookingsFuture();

    checklistBox.style.display = "none";
  }
}

refreshBtn.addEventListener("click", refreshAll);

// ===== Init =====
(async () => {
  const last = localStorage.getItem("last_email");
  if(last) loginEmail.value = last;

  const { data } = await supabase.auth.getSession();
  if(!data.session){
    who.textContent = "Non sei loggato.";
    loginCard.style.display = "block";
    appWrap.style.display = "none";
    roleBadge.style.display = "none";
    logoutBtn.style.display = "none";
    instrLink.style.display = "none";
    return;
  }

  currentUser = data.session.user;

  const prof = await ensureProfile();
  role = prof?.role ?? "volunteer";

  who.textContent = `Loggato come ${currentUser.email}`;
  roleBadge.style.display = "inline-flex";
  roleBadge.textContent = `Ruolo: ${roleLabel(role)}`;
  logoutBtn.style.display = "inline-flex";

  loginCard.style.display = "none";
  appWrap.style.display = "block";

  instrLink.style.display = (role === "instructor" || role === "admin") ? "inline-flex" : "none";

  await loadProfileToUI();
  await refreshAll();
})();
