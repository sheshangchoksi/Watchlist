import { supabase } from "./supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export async function fetchQuotes(yfSymbols) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  const res = await fetch(`${API_BASE}/quotes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ yf_symbols: yfSymbols }),
  });
  if (!res.ok) throw new Error(`Price fetch failed (${res.status})`);
  const { quotes } = await res.json();
  return quotes; // array of {yf_symbol, price, change, change_pct, ...}
}
