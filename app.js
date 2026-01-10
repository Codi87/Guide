import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const SUPABASE_URL = "https://nxlxsjluohhxljeaqosl.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_ehlGQkGpo18gxWYheS1CRA_9QIdDX_J";

// dominio fisso (per redirect OTP stabile su Vercel)
export const SITE_ORIGIN = "https://guide-rouge.vercel.app";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function qs(sel){ return document.querySelector(sel); }
export function fmtTime(t){ return (t || "").slice(0,5); }
export function fmtDateIT(iso){
  if(!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
export function roleLabel(role){
  if(role === "instructor") return "istruttore";
  if(role === "volunteer") return "volontario";
  if(role === "admin") return "admin";
  return role || "";
}
export function slotStartDateTime(day, startTime){
  const t = (startTime || "").slice(0,5);
  return new Date(`${day}T${t}:00`);
}
export async function logout(){
  await supabase.auth.signOut();
  window.location.href = "/";
}
export async function ensureProfile(){
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if(!user) return null;

  const { data: existing } = await supabase
    .from("profiles")
    .select("role, full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  if(!existing){
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

  return {
    user,
    role: prof?.role ?? "volunteer",
    full_name: prof?.full_name ?? user.email,
    phone: prof?.phone ?? ""
  };
}
