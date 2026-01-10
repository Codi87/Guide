import { supabase, qs, fmtTime, fmtDateIT, ensureProfile, logout, roleLabel, slotStartDateTime } from "./app.js";

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

const slotList = qs("#slotList");
const slotToast = qs("#slotToast");

const myBox = qs("#myBox");
const myList = qs("#myList");
const myToast = qs("#myToast");

const instrBox = qs("#instrBox");
const instrList = qs("#instrList");
const instrToast = qs("#instrToast");

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
    options: { emailRedirectTo: `${window.location.origin}/dashboard.html` }
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

function mergeRanges(slots){
  const toMin = (t)=>{ const [h,m]=t.slice(0,5).split(":").map(Number); return h*60+m; };
  const toTime = (m)=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
  const arr = slots.map(s=>({a:toMin(s.start_time), b:toMin(s.end_time)})).sort((x,y)=>x.a-y.a);
  const out = [];
  for(const r of arr){
    if(out.length===0 || r.a>out[out.length-1].b) out.push({...r});
    else out[out.length-1].b = Math.max(out[out.length-1].b, r.b);
  }
  return out.map(r=>`${toTime(r.a)}–${toTime(r.b)}`);
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

function isFutureSlot(s){
  const dt = slotStartDateTime(s.day, s.start_time);
  return dt.getTime() >= Date.now();
}

async function loadInstructorAvailabilityFuture(){
  hideToast(availToast);
  availList.innerHTML = "";

  // prendo tutti gli slot OPEN e filtro i passati lato JS
  const { data: slots, error } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, instructor_id, status")
    .eq("status", "OPEN")
    .order("day", { ascending:true })
    .order("start_time", { ascending:true });

  if(error) return showToast(availToast, error.message, "bad");

  const future = (slots || []).filter(isFutureSlot);
  if(future.length === 0) return; // niente testo “nessuna disponibilità”

  const instructorIds = [...new Set(future.map(s => s.instructor_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(instructorIds);

  // group by instructor + day
  const groups = new Map();
  for(const s of future){
    const p = profMap.get(s.instructor_id);
    const name = p?.full_name || "Istruttore";
    const key = `${name}||${s.day}`;
    if(!groups.has(key)) groups.set(key, { name, day: s.day, slots: [] });
    groups.get(key).slots.push(s);
  }

  // render
  [...groups.values()].forEach(g => {
    const ranges = mergeRanges(g.slots);
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${g.name}</strong>
        <div class="meta">${fmtDateIT(g.day)} — ${ranges.join(", ")}</div>
      </div>
      <span class="badge">${g.slots.length} slot</span>
    `;
    availList.appendChild(div);
  });
}

async function loadFreeSlotsFuture(){
  hideToast(slotToast);
  slotList.innerHTML = "";

  const { data: slots, error: e1 } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, instructor_id, status")
    .eq("status", "OPEN")
    .order("day", { ascending:true })
    .order("start_time", { ascending:true });

  if(e1) return showToast(slotToast, e1.message, "bad");

  const futureOpen = (slots || []).filter(isFutureSlot);
  if(futureOpen.length === 0) return;

  // booked?
  const slotIds = futureOpen.map(s => s.id);
  const { data: bookedRows, error: e2 } = await supabase
    .from("bookings")
    .select("slot_id")
    .in("slot_id", slotIds)
    .eq("status", "CONFIRMED");

  if(e2) return showToast(slotToast, e2.message, "bad");

  const booked = new Set((bookedRows || []).map(b => b.slot_id));
  const free = futureOpen.filter(s => !booked.has(s.id));
  if(free.length === 0) return;

  const instructorIds = [...new Set(free.map(s => s.instructor_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(instructorIds);

  free.forEach(s => {
    const instr = profMap.get(s.instructor_id)?.full_name || "Istruttore";
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${fmtDateIT(s.day)} • ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}</strong>
        <div class="meta">${instr}</div>
      </div>
      <button class="btn primary">Prenota</button>
    `;

    div.querySelector("button").addEventListener("click", async () => {
      hideToast(slotToast);
      const { error } = await supabase.from("bookings").insert({
        slot_id: s.id,
        volunteer_id: currentUser.id,
        status: "CONFIRMED"
      });
      if(error) showToast(slotToast, error.message, "bad");
      else { showToast(slotToast, "Prenotazione confermata ✅", "ok"); await refreshAll(); }
    });

    slotList.appendChild(div);
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
    if(!s) return false;
    return isFutureSlot(s);
  });

  if(future.length === 0) return;

  const instructorIds = [...new Set(future.map(r => slotById.get(r.slot_id)?.instructor_id).filter(Boolean))];
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
      else { showToast(myToast, "Prenotazione annullata.", ""); await refreshAll(); }
    });

    myList.appendChild(div);
  });
}

async function loadInstructorBookingsFuture(){
  hideToast(instrToast);
  instrList.innerHTML = "";

  // slot istruttore (tutti), filtro futuri
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

  // render: per slot, chi prenotato
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

async function refreshAll(){
  await loadInstructorAvailabilityFuture();
  await loadFreeSlotsFuture();

  // volontari: vedono le proprie prenotazioni future
  if(role !== "instructor" && role !== "admin"){
    myBox.style.display = "block";
    await loadMyBookingsFuture();
  } else {
    myBox.style.display = "none";
  }

  // istruttori: vedono iscritti futuri
  if(role === "instructor" || role === "admin"){
    instrBox.style.display = "block";
    await loadInstructorBookingsFuture();
  } else {
    instrBox.style.display = "none";
  }
}

refreshBtn.addEventListener("click", refreshAll);

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

  if(role === "instructor" || role === "admin"){
    instrLink.style.display = "inline-flex";
  } else {
    instrLink.style.display = "none";
  }

  await loadProfileToUI();
  await refreshAll();
})();
