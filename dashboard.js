import { supabase, qs, fmtTime, fmtDateIT, ensureProfile, logout } from "./app.js";

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

const dayEl = qs("#day");
const refreshBtn = qs("#refreshBtn");
const slotList = qs("#slotList");
const slotToast = qs("#slotToast");

const myList = qs("#myList");
const myToast = qs("#myToast");

const availList = qs("#availList");
const availToast = qs("#availToast");

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
function todayISO(){ return new Date().toISOString().slice(0,10); }

async function sendOtp(email){
  loginBtn.disabled = true;
  showToast(loginToast, "Invio link…", "");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/dashboard.html` }
  });
  loginBtn.disabled = false;
  if(error) showToast(loginToast, error.message, "bad");
  else showToast(loginToast, "Link inviato ✅ Controlla email (anche Spam) e clicca per entrare.", "ok");
}

loginBtn.addEventListener("click", async () => {
  const email = (loginEmail.value || "").trim();
  if(!email) return showToast(loginToast, "Inserisci un’email valida.", "bad");
  localStorage.setItem("last_email", email);
  await sendOtp(email);
});

let currentUser = null;
let role = "volunteer";

// Helpers: carica nomi istruttori per un set di ids
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

async function loadInstructorAvailability(){
  hideToast(availToast);
  availList.innerHTML = "";
  const day = dayEl.value;

  const { data: slots, error } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, instructor_id, status")
    .eq("day", day)
    .eq("status", "OPEN")
    .order("start_time");

  if(error) return showToast(availToast, error.message, "bad");
  if(!slots || slots.length === 0) return showToast(availToast, "Nessuna disponibilità per questo giorno.", "");

  const instructorIds = [...new Set(slots.map(s => s.instructor_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(instructorIds);

  const byName = new Map();
  for(const s of slots){
    const p = profMap.get(s.instructor_id);
    const name = p?.full_name || "Istruttore";
    if(!byName.has(name)) byName.set(name, []);
    byName.get(name).push(s);
  }

  for(const [name, group] of byName.entries()){
    const ranges = mergeRanges(group);
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${name}</strong>
        <div class="meta">${fmtDateIT(day)} — ${ranges.join(", ")}</div>
      </div>
      <span class="badge">${group.length} slot</span>
    `;
    availList.appendChild(div);
  }
}

async function loadSlots(){
  hideToast(slotToast);
  slotList.innerHTML = "";
  const day = dayEl.value;

  const { data: slots, error: e1 } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, instructor_id, status")
    .eq("day", day)
    .eq("status", "OPEN")
    .order("start_time");

  if(e1) return showToast(slotToast, e1.message, "bad");
  if(!slots || slots.length === 0) return showToast(slotToast, "Nessuno slot disponibile per questo giorno.", "");

  // quali sono già prenotati
  const slotIds = slots.map(s => s.id);
  const { data: bookedRows, error: e2 } = await supabase
    .from("bookings")
    .select("slot_id")
    .in("slot_id", slotIds)
    .eq("status", "CONFIRMED");

  if(e2) return showToast(slotToast, e2.message, "bad");
  const booked = new Set((bookedRows || []).map(b => b.slot_id));

  const free = slots.filter(s => !booked.has(s.id));
  if(free.length === 0) return showToast(slotToast, "Tutti gli slot sono già prenotati.", "");

  const instructorIds = [...new Set(free.map(s => s.instructor_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(instructorIds);

  free.forEach(s => {
    const instr = profMap.get(s.instructor_id)?.full_name || "Istruttore";
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${fmtTime(s.start_time)}–${fmtTime(s.end_time)}</strong>
        <div class="meta">${fmtDateIT(s.day)} • ${instr}</div>
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

async function loadMyBookings(){
  hideToast(myToast);
  myList.innerHTML = "";

  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id, status, created_at, slot_id")
    .eq("volunteer_id", currentUser.id)
    .order("created_at", { ascending:false });

  if(error) return showToast(myToast, error.message, "bad");
  if(!rows || rows.length === 0) return showToast(myToast, "Nessuna prenotazione.", "");

  const slotIds = [...new Set(rows.map(r => r.slot_id))];
  const { data: slots, error: sErr } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, instructor_id")
    .in("id", slotIds);

  if(sErr) return showToast(myToast, sErr.message, "bad");

  const slotById = new Map((slots || []).map(s => [s.id, s]));
  const instructorIds = [...new Set((slots || []).map(s => s.instructor_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(instructorIds);

  rows.forEach(r => {
    const s = slotById.get(r.slot_id);
    const instr = s ? (profMap.get(s.instructor_id)?.full_name || "Istruttore") : "—";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${s ? `${fmtDateIT(s.day)} • ${fmtTime(s.start_time)}–${fmtTime(s.end_time)}` : "Slot"}</strong>
        <div class="meta">${instr} • Stato: ${r.status}</div>
      </div>
      <button class="btn danger" ${r.status !== "CONFIRMED" ? "disabled" : ""}>Annulla</button>
    `;

    div.querySelector("button").addEventListener("click", async () => {
      const { error } = await supabase.from("bookings").update({ status:"CANCELLED" }).eq("id", r.id);
      if(error) showToast(myToast, error.message, "bad");
      else { showToast(myToast, "Prenotazione annullata.", ""); await refreshAll(); }
    });

    myList.appendChild(div);
  });
}

async function loadInstructorBookings(){
  // solo istruttori
  hideToast(instrToast);
  instrList.innerHTML = "";

  const day = dayEl.value;

  // 1) prendo slot dell’istruttore nel giorno
  const { data: slots, error: sErr } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time")
    .eq("instructor_id", currentUser.id)
    .eq("day", day)
    .order("start_time");

  if(sErr) return showToast(instrToast, sErr.message, "bad");
  if(!slots || slots.length === 0) return showToast(instrToast, "Nessuno slot in questo giorno.", "");

  const slotById = new Map(slots.map(s => [s.id, s]));
  const slotIds = slots.map(s => s.id);

  // 2) prenotazioni confermate su quei slot
  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select("id, slot_id, volunteer_id, status, created_at")
    .in("slot_id", slotIds)
    .eq("status", "CONFIRMED")
    .order("created_at", { ascending:true });

  if(bErr) return showToast(instrToast, bErr.message, "bad");
  if(!bookings || bookings.length === 0) return showToast(instrToast, "Nessun iscritto per questo giorno.", "");

  // 3) profili volontari (nome+telefono) — permessi dalla policy
  const volunteerIds = [...new Set(bookings.map(b => b.volunteer_id).filter(Boolean))];
  const profMap = await fetchProfilesMap(volunteerIds);

  // 4) render
  bookings.forEach(b => {
    const s = slotById.get(b.slot_id);
    const p = profMap.get(b.volunteer_id);
    const name = p?.full_name || "—";
    const phone = p?.phone || "—";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${s ? `${fmtTime(s.start_time)}–${fmtTime(s.end_time)}` : "Slot"} • ${name}</strong>
        <div class="meta">Telefono: ${phone}</div>
      </div>
      <span class="badge">${fmtDateIT(day)}</span>
    `;
    instrList.appendChild(div);
  });
}

async function refreshAll(){
  await loadInstructorAvailability();
  await loadSlots();
  await loadMyBookings();
  if(role === "instructor" || role === "admin"){
    await loadInstructorBookings();
  }
}

refreshBtn.addEventListener("click", refreshAll);
dayEl.addEventListener("change", refreshAll);

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
    instrBox.style.display = "none";
    return;
  }

  currentUser = data.session.user;

  const prof = await ensureProfile();
  role = prof?.role ?? "volunteer";

  who.textContent = `Loggato come ${currentUser.email}`;
  roleBadge.style.display = "inline-flex";
  roleBadge.textContent = `Ruolo: ${role}`;
  logoutBtn.style.display = "inline-flex";

  loginCard.style.display = "none";
  appWrap.style.display = "block";

  dayEl.value = todayISO();

  if(role === "instructor" || role === "admin"){
    instrLink.style.display = "inline-flex";
    instrBox.style.display = "block";
  } else {
    instrLink.style.display = "none";
    instrBox.style.display = "none";
  }

  await loadProfileToUI();
  await refreshAll();
})();
