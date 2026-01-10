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

function mergeRanges(slots){
  // slots: [{start_time,end_time}] -> unisci contigui
  const toMin = (t)=>{ const [h,m]=t.slice(0,5).split(":").map(Number); return h*60+m; };
  const toTime = (m)=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
  const arr = slots.map(s=>({a:toMin(s.start_time), b:toMin(s.end_time)})).sort((x,y)=>x.a-y.a);
  const out = [];
  for(const r of arr){
    if(out.length===0 || r.a>out[out.length-1].b){
      out.push({...r});
    } else {
      out[out.length-1].b = Math.max(out[out.length-1].b, r.b);
    }
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

  const { data, error } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, instructor:profiles(full_name)")
    .eq("day", day)
    .eq("status", "OPEN")
    .order("start_time");

  if(error) return showToast(availToast, error.message, "bad");
  if(!data || data.length === 0) return showToast(availToast, "Nessuna disponibilità per questo giorno.", "");

  // raggruppa per istruttore e unisci fasce
  const by = new Map();
  for(const s of data){
    const name = s.instructor?.full_name ?? "Istruttore";
    if(!by.has(name)) by.set(name, []);
    by.get(name).push(s);
  }

  for(const [name, slots] of by.entries()){
    const ranges = mergeRanges(slots);
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${name}</strong>
        <div class="meta">${fmtDateIT(day)} — ${ranges.join(", ")}</div>
      </div>
      <span class="badge">${slots.length} slot</span>
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
    .select("id, day, start_time, end_time, status, instructor:profiles(full_name)")
    .eq("day", day)
    .eq("status", "OPEN")
    .order("start_time");

  if(e1) return showToast(slotToast, e1.message, "bad");
  if(!slots || slots.length === 0){
    return showToast(slotToast, "Nessuno slot disponibile per questo giorno.", "");
  }

  const slotIds = slots.map(s => s.id);
  const { data: bookings, error: e2 } = await supabase
    .from("bookings")
    .select("slot_id, status")
    .in("slot_id", slotIds)
    .eq("status", "CONFIRMED");

  if(e2) return showToast(slotToast, e2.message, "bad");

  const booked = new Set((bookings || []).map(b => b.slot_id));
  const free = slots.filter(s => !booked.has(s.id));

  if(free.length === 0) return showToast(slotToast, "Tutti gli slot sono già prenotati.", "");

  free.forEach(s => {
    const instr = s.instructor?.full_name ?? "Istruttore";
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
      else {
        showToast(slotToast, "Prenotazione confermata ✅", "ok");
        await refreshAll();
      }
    });

    slotList.appendChild(div);
  });
}

async function loadMyBookings(){
  hideToast(myToast);
  myList.innerHTML = "";

  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, created_at, slot:slots(day, start_time, end_time, instructor:profiles(full_name))")
    .eq("volunteer_id", currentUser.id)
    .order("created_at", { ascending:false });

  if(error) return showToast(myToast, error.message, "bad");
  if(!data || data.length === 0) return showToast(myToast, "Nessuna prenotazione.", "");

  data.forEach(r => {
    const slot = r.slot || {};
    const instr = slot.instructor?.full_name ?? "Istruttore";
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${fmtDateIT(slot.day)} • ${fmtTime(slot.start_time)}–${fmtTime(slot.end_time)}</strong>
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

  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, slot:slots(day, start_time, end_time, instructor_id), volunteer:profiles(full_name, phone)")
    .eq("status", "CONFIRMED")
    .eq("slot.instructor_id", currentUser.id)
    .eq("slot.day", day)
    .order("created_at", { ascending:true });

  if(error) return showToast(instrToast, error.message, "bad");
  if(!data || data.length === 0) return showToast(instrToast, "Nessun iscritto per questo giorno.", "");

  data.forEach(b => {
    const s = b.slot || {};
    const v = b.volunteer || {};
    const name = v.full_name ?? "—";
    const phone = v.phone ?? "—";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${fmtTime(s.start_time)}–${fmtTime(s.end_time)} • ${name}</strong>
        <div class="meta">Telefono: ${phone}</div>
      </div>
      <span class="badge">${fmtDateIT(s.day)}</span>
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
dayEl?.addEventListener("change", refreshAll);

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
  roleBadge.textContent = `Ruolo: ${role}`;
  logoutBtn.style.display = "inline-flex";

  loginCard.style.display = "none";
  appWrap.style.display = "block";

  dayEl.value = todayISO();

  // link e box istruttore
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
