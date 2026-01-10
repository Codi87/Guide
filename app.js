import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const SUPABASE_URL = "https://nxlxsjluohhxljeaqosl.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ehlGQkGpo18gxWYheS1CRA_9QIdDX_J";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function qs(sel){ return document.querySelector(sel); }
export function fmtTime(t){ return (t || "").slice(0,5); }
export function fmtDateIT(iso){ // YYYY-MM-DD -> DD/MM/YYYY
  if(!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function logout(){
  await supabase.auth.signOut();
  window.location.href = "/";
}

export async function ensureProfile(){
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if(!user) return null;

  // leggi profilo
  const { data: existing } = await supabase
    .from("profiles")
    .select("role, full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  if(!existing){
    // crea solo se non esiste
    await supabase.from("profiles").insert({
      user_id: user.id,
      full_name: user.email,
      phone: null,
      role: "volunteer",
    });
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("role, full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, role: prof?.role ?? "volunteer", full_name: prof?.full_name ?? user.email, phone: prof?.phone ?? "" };
}
