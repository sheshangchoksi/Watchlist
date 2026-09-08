import { supabase } from "./supabaseClient";

export async function listWatchlists() {
  const { data, error } = await supabase
    .from("watchlists")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createWatchlist(name, exchange) {
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("watchlists")
    .insert({ name, exchange, user_id: userRes.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWatchlist(id) {
  const { error } = await supabase.from("watchlists").delete().eq("id", id);
  if (error) throw error;
}

export async function listItems(watchlistId) {
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("watchlist_id", watchlistId)
    .order("added_at", { ascending: true });
  if (error) throw error;
  return data;
}

// Adds records ({symbol, name, yf_symbol}); duplicates (same symbol in
// the same watchlist) are silently ignored via the DB's unique constraint.
export async function addItems(watchlistId, records) {
  if (!records.length) return [];
  const rows = records.map((r) => ({
    watchlist_id: watchlistId,
    symbol: r.symbol,
    name: r.name,
    yf_symbol: r.yf_symbol,
  }));
  const { data, error } = await supabase
    .from("watchlist_items")
    .upsert(rows, { onConflict: "watchlist_id,symbol", ignoreDuplicates: true })
    .select();
  if (error) throw error;
  return data;
}

export async function removeItems(itemIds) {
  const { error } = await supabase.from("watchlist_items").delete().in("id", itemIds);
  if (error) throw error;
}
