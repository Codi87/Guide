import { supabase, qs, fmtTime, ensureProfile, logout } from "./app.js";

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
const saveNameBtn = qs("#saveNameBtn");
const profileToast = qs("#profileToast");

const dayEl = qs("#day");
const refreshBtn = qs("#refreshBtn");
const slotList = qs("#slotList");
const slotToast = qs("#slotToast");

const myList = qs("#myList");
const myToast = qs("#myToast");

logoutBtn.addEventListener("click", logout);

function showToast(el, msg, type){
  el.style.display = "block";
  el.className = `toast ${type||""}`;
  el.textContent = msg;
}
function hideToast(el){ el.style.display = "none"; }

function todayISO(){
  return new Date().toISOString().slice(0,10);
}

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

async function loadProfileToUI(){
  hideToast(profileToast);
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if(!error && data?.full_name){
    fullNameEl.value = data.full_name;
  }
}

saveNameBtn.addEventListener("click", async () => {
  hideToast(profileToast);
  const full_name = (fullNameEl.value || "").trim();
  if(!full_name) return showToast(profileToast, "Inserisci Nome e Cognome.", "bad");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name })
    .eq("user_id", currentUser.id);

  if(error) showToast(profileToast, error.message, "bad");
  else showToast(profileToast, "Salvato ✅", "ok");
});

async function loadSlots(){
  hideToast(slotToast);
  slotList.innerHTML = "";

  const day = dayEl.value;

  const { data: slots, error: e1 } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, status")
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
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${fmtTime(s.start_time)}–${fmtTime(s.end_time)}</strong>
        <div class="meta">${s.day}</div>
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
        await loadSlots();
        await loadMyBookings();
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
    .select("id, status, created_at, slot:slots(day, start_time, end_time)")
    .eq("volunteer_id", currentUser.id)
    .order("created_at", { ascending:false });

  if(error) return showToast(myToast, error.message, "bad");
  if(!data || data.length === 0) return showToast(myToast, "Nessuna prenotazione.", "");

  data.forEach(r => {
    const slot = r.slot || {};
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${slot.day ?? ""} • ${fmtTime(slot.start_time)}–${fmtTime(slot.end_time)}</strong>
        <div class="meta">Stato: ${r.status}</div>
      </div>
      <button class="btn danger" ${r.status !== "CONFIRMED" ? "disabled" : ""}>Annulla</button>
    `;

    div.querySelector("button").addEventListener("click", async () => {
      const { error } = await supabase.from("bookings").update({ status:"CANCELLED" }).eq("id", r.id);
      if(error) showToast(myToast, error.message, "bad");
      else {
        showToast(myToast, "Prenotazione annullata.", "");
        await loadMyBookings();
        await loadSlots();
      }
    });

    myList.appendChild(div);
  });
}

refreshBtn.addEventListener("click", loadSlots);

(async () => {
  // precompila email login
  const last = localStorage.getItem("last_email");
  if(last) loginEmail.value = last;

  // sessione?
  const { data } = await supabase.auth.getSession();

  if(!data.session){
    // NON loggato
    who.textContent = "Non sei loggato.";
    loginCard.style.display = "block";
    appWrap.style.display = "none";
    roleBadge.style.display = "none";
    logoutBtn.style.display = "none";
    return;
  }

  // LOGGATO
  currentUser = data.session.user;

  const prof = await ensureProfile();
  role = prof?.role ?? "volunteer";

  who.textContent = `Loggato come ${currentUser.email}`;
  roleBadge.style.display = "inline-flex";
  roleBadge.textContent = `Ruolo: ${role}`;
  logoutBtn.style.display = "inline-flex";

  loginCard.style.display = "none";
  appWrap.style.display = "block";

  if(role === "instructor" || role === "admin"){
    instrLink.style.display = "inline-flex";
  } else {
    instrLink.style.display = "none";
  }

  dayEl.value = todayISO();

  await loadProfileToUI();
  await loadSlots();
  await loadMyBookings();
})();
