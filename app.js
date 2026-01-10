// app.js (module)
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const SUPABASE_URL = "https://nxlxsjluohhxljeaqosl.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ehlGQkGpo18gxWYheS1CRA_9QIdDX_J";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function qs(sel){ return document.querySelector(sel); }
export function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }
export function fmtTime(t){ return (t || "").slice(0,5); }

export async function getUser(){
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function logout(){
  await supabase.auth.signOut();
  window.location.href = "/";
}

export async function ensureProfile(){
  const user = await getUser();
  if(!user) return null;

  // crea profilo se non esiste (default volunteer)
  await supabase.from("profiles").upsert({
    user_id: user.id,
    full_name: user.email, // verrà sovrascritto dall’utente con Nome Cognome
    role: "volunteer"
  });

  const { data } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return { user, role: data?.role ?? "volunteer", full_name: data?.full_name ?? user.email };
}
