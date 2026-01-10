import { supabase, qs, fmtTime, ensureProfile, requireAuth, logout } from "./app.js";

const who = qs("#who");
const roleBadge = qs("#roleBadge");
const instrLink = qs("#instrLink");
const logoutBtn = qs("#logoutBtn");

const dayEl = qs("#day");
const refreshBtn = qs("#refreshBtn");
const slotList = qs("#slotList");
const slotToast = qs("#slotToast");

const myList = qs("#myList");
const myToast = qs("#myToast");

function showToast(el, msg, type){
  el.style.display = "block";
  el.className = `toast ${type||""}`;
  el.textContent = msg;
}
function hideToast(el){ el.style.display = "none"; }

function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

logoutBtn.addEventListener("click", logout);

let currentUser = null;
let role = "volunteer";

async function loadSlots(){
  hideToast(slotToast);
  slotList.innerHTML = "";

  const day = dayEl.value;

  // 1) slot OPEN del giorno
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

  // 2) prenotazioni confermate per quegli slot (filtriamo client-side)
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

(async () => {
  currentUser = await requireAuth();
  const prof = await ensureProfile();

  role = prof?.role ?? "volunteer";
  who.textContent = `Loggato come ${currentUser.email}`;
  roleBadge.textContent = `Ruolo: ${role}`;

  if(role === "instructor" || role === "admin"){
    instrLink.style.display = "inline-flex";
  }

  dayEl.value = todayISO();
  await loadSlots();
  await loadMyBookings();
})();

refreshBtn.addEventListener("click", async () => {
  await loadSlots();
});
