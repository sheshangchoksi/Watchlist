const _cache = {};

async function loadUniverse(exchange) {
  if (_cache[exchange]) return _cache[exchange];
  const file = exchange === "NSE" ? "/nse_tickers.json" : "/bse_codes.json";
  const res = await fetch(file);
  const rows = await res.json();
  const byKey = new Map(rows.map((r) => [normalize(exchange, r.symbol), r]));
  _cache[exchange] = { rows, byKey };
  return _cache[exchange];
}

function normalize(exchange, value) {
  const v = String(value ?? "").trim();
  return exchange === "NSE" ? v.toUpperCase() : v;
}

export async function getUniverse(exchange) {
  const { rows } = await loadUniverse(exchange);
  return rows;
}

// Matches free-form input (Excel upload / manual entry / dropdown value)
// against the real universe. Returns { matched: [...], unmatched: [...] } --
// never throws, never silently drops an unrecognised value.
export async function resolveSymbols(exchange, rawValues) {
  const { byKey } = await loadUniverse(exchange);
  const matched = [];
  const unmatched = [];
  for (const raw of rawValues) {
    const key = normalize(exchange, raw);
    if (!key || key.toLowerCase() === "nan") continue;
    const rec = byKey.get(key);
    if (rec) matched.push(rec);
    else unmatched.push(String(raw));
  }
  return { matched, unmatched };
}
