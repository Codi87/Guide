import { supabase, qs, fmtTime, ensureProfile, logout } from "./app.js";

const logoutBtn = qs("#logoutBtn");
logoutBtn.addEventListener("click", logout);

const guard = qs("#guard");
const dayEl = qs("#day");
const startEl = qs("#start");
const endEl = qs("#end");
const durationEl = qs("#duration");
const createBtn = qs("#createBtn");
const toast = qs("#toast");

const listToast = qs("#listToast");
const slotList = qs("#slotList");

function show(el, msg, type){
  el.style.display = "block";
  el.className = `toast ${type||""}`;
  el.textContent = msg;
}
function hide(el){ el.style.display = "none"; }
function todayISO(){ return new Date().toISOString().slice(0,10); }

function timeToMinutes(t){ const [h,m]=t.split(":").map(Number); return h*60+m; }
function minutesToTime(min){
  const h=Math.floor(min/60), m=min%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

let user = null;

async function loadMySlots(){
  hide(listToast);
  slotList.innerHTML = "";

  const day = dayEl.value;

  const { data, error } = await supabase
    .from("slots")
    .select("id, day, start_time, end_time, status")
    .eq("instructor_id", user.id)
    .eq("day", day)
    .order("start_time");

  if(error) return show(listToast, error.message, "bad");
  if(!data || data.length === 0) return show(listToast, "Nessuno slot creato per questo giorno.", "");

  data.forEach(s => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div>
        <strong>${fmtTime(s.start_time)}–${fmtTime(s.end_time)}</strong>
        <div class="meta">${s.day} • Stato: ${s.status}</div>
      </div>
      <div class="row">
        <button class="btn">${s.status === "OPEN" ? "Chiudi" : "Apri"}</button>
        <button class="btn danger">Elimina</button>
      </div>
    `;

    const [toggleBtn, delBtn] = div.querySelectorAll("button");

    toggleBtn.addEventListener("click", async () => {
      const next = s.status === "OPEN" ? "CLOSED" : "OPEN";
      const { error } = await supabase.from("slots").update({ status: next }).eq("id", s.id);
      if(error) show(listToast, error.message, "bad");
      else { show(listToast, "Aggiornato ✅", "ok"); await loadMySlots(); }
    });

    delBtn.addEventListener("click", async () => {
      const { error } = await supabase.from("slots").delete().eq("id", s.id);
      if(error) show(listToast, error.message, "bad");
      else { show(listToast, "Eliminato.", ""); await loadMySlots(); }
    });

    slotList.appendChild(div);
  });
}

createBtn.addEventListener("click", async () => {
  hide(toast);

  const day = dayEl.value;
  const start = startEl.value;
  const end = endEl.value;
  const dur = Number(durationEl.value);

  if(!day || !start || !end) return show(toast, "Compila giorno/inizio/fine.", "bad");
  const a = timeToMinutes(start), b = timeToMinutes(end);
  if(b <= a) return show(toast, "La fine deve essere dopo l’inizio.", "bad");

  const rows = [];
  for(let t = a; t + dur <= b; t += dur){
    rows.push({
      instructor_id: user.id,
      day,
      start_time: minutesToTime(t),
      end_time: minutesToTime(t + dur),
      status: "OPEN",
      location_id: null
    });
  }
  if(rows.length === 0) return show(toast, "Nessuno slot creato: controlla durata/fascia.", "bad");

  const { error } = await supabase.from("slots").insert(rows);
  if(error) show(toast, error.message, "bad");
  else { show(toast, `Creati ${rows.length} slot ✅`, "ok"); await loadMySlots(); }
});

(async () => {
  const { data } = await supabase.auth.getSession();
  if(!data.session){ window.location.href = "/dashboard.html"; return; }

  user = data.session.user;
  const prof = await ensureProfile();
  const role = prof?.role ?? "volunteer";

  dayEl.value = todayISO();

  if(role !== "instructor" && role !== "admin"){
    guard.style.display = "block";
    guard.textContent = "Solo istruttori. Imposta role=instructor su Supabase (profiles).";
    createBtn.disabled = true;
    return;
  }

  await loadMySlots();
})();

dayEl.addEventListener("change", loadMySlots);
