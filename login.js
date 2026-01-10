import { supabase, qs, ensureProfile } from "./app.js";

const emailEl = qs("#email");
const btn = qs("#btn");
const toast = qs("#toast");

function show(msg, type){
  toast.style.display = "block";
  toast.className = `toast ${type||""}`;
  toast.textContent = msg;
}

(async () => {
  // se già loggato, vai in dashboard
  const { data } = await supabase.auth.getSession();
  if(data.session){
    await ensureProfile();
    window.location.href = "/dashboard.html";
  }
})();

btn.addEventListener("click", async () => {
  const email = (emailEl.value || "").trim();
  if(!email) return show("Inserisci un’email valida.", "bad");

  btn.disabled = true;
  show("Invio link…", "");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/dashboard.html`
    }
  });

  btn.disabled = false;

  if(error) show(error.message, "bad");
  else show("Link inviato ✅ Controlla email (anche Spam) e clicca per entrare.", "ok");
});
