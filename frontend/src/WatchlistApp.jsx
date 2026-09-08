import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import * as db from "./db";
import { resolveSymbols, getUniverse } from "./universe";
import { fetchQuotes } from "./api";

export default function WatchlistApp({ user }) {
  const [watchlists, setWatchlists] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [newName, setNewName] = useState("");
  const [newExchange, setNewExchange] = useState("NSE");

  useEffect(() => {
    db.listWatchlists().then((ws) => {
      setWatchlists(ws);
      if (ws.length && !activeId) setActiveId(ws[0].id);
    });
  }, []);

  const active = watchlists.find((w) => w.id === activeId) || null;

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const w = await db.createWatchlist(newName.trim(), newExchange);
    setWatchlists([...watchlists, w]);
    setActiveId(w.id);
    setNewName("");
  }

  async function handleDelete(id) {
    await db.deleteWatchlist(id);
    const remaining = watchlists.filter((w) => w.id !== id);
    setWatchlists(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id ?? null);
  }

  return (
    <div style={{ display: "flex", fontFamily: "sans-serif", minHeight: "100vh" }}>
      <aside style={{ width: 260, borderRight: "1px solid #ddd", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>My Watchlists</h3>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
        {watchlists.map((w) => (
          <div
            key={w.id}
            onClick={() => setActiveId(w.id)}
            style={{
              padding: 8,
              marginBottom: 6,
              borderRadius: 6,
              cursor: "pointer",
              background: w.id === activeId ? "#e7f1ff" : "transparent",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>
              {w.name} <small style={{ color: "#888" }}>({w.exchange})</small>
            </span>
            <span onClick={(e) => { e.stopPropagation(); handleDelete(w.id); }} style={{ color: "#b02a37" }}>
              ✕
            </span>
          </div>
        ))}
        <form onSubmit={handleCreate} style={{ marginTop: 16 }}>
          <input
            placeholder="New watchlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ width: "100%", padding: 6, marginBottom: 6 }}
          />
          <select
            value={newExchange}
            onChange={(e) => setNewExchange(e.target.value)}
            style={{ width: "100%", padding: 6, marginBottom: 6 }}
          >
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>
          <button type="submit" style={{ width: "100%", padding: 8 }}>
            ➕ Create Watchlist
          </button>
        </form>
      </aside>

      <main style={{ flex: 1, padding: 24 }}>
        {!active ? (
          <p>Create a watchlist on the left to get started.</p>
        ) : (
          <ActiveWatchlist watchlist={active} />
        )}
      </main>
    </div>
  );
}

function ActiveWatchlist({ watchlist }) {
  const [items, setItems] = useState([]);
  const [quotesByYf, setQuotesByYf] = useState({});
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [method, setMethod] = useState("upload");

  useEffect(() => {
    setItems([]);
    setQuotesByYf({});
    setLastRefreshed(null);
    db.listItems(watchlist.id).then(setItems);
  }, [watchlist.id]);

  async function addRecords(records) {
    const added = await db.addItems(watchlist.id, records);
    if (added.length) setItems([...items, ...added]);
    return added.length;
  }

  async function handleRemove(ids) {
    await db.removeItems(ids);
    setItems(items.filter((it) => !ids.includes(it.id)));
  }

  async function handleRefresh() {
    if (!items.length) return;
    setRefreshing(true);
    try {
      const quotes = await fetchQuotes(items.map((it) => it.yf_symbol));
      const byYf = Object.fromEntries(quotes.map((q) => [q.yf_symbol, q]));
      setQuotesByYf(byYf);
      setLastRefreshed(new Date());
    } catch (e) {
      alert(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <h2>
        {watchlist.name} <small style={{ color: "#888" }}>({watchlist.exchange})</small>
      </h2>

      <AddStocks exchange={watchlist.exchange} onAdd={addRecords} method={method} setMethod={setMethod} />

      <hr />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button onClick={handleRefresh} disabled={refreshing || !items.length}>
          {refreshing ? "Fetching..." : "🔄 Refresh Prices"}
        </button>
        <span style={{ color: "#888" }}>
          Last refreshed: {lastRefreshed ? lastRefreshed.toLocaleTimeString() : "never"} — prices are
          fetched only when you click Refresh.
        </span>
      </div>

      {!items.length ? (
        <p>No stocks yet — add some above.</p>
      ) : (
        <WatchlistTable items={items} quotesByYf={quotesByYf} onRemove={handleRemove} />
      )}
    </div>
  );
}

function AddStocks({ exchange, onAdd, method, setMethod }) {
  const [manualText, setManualText] = useState("");
  const [manualResult, setManualResult] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [universe, setUniverse] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    getUniverse(exchange).then(setUniverse);
    setManualResult(null);
    setUploadResult(null);
    setSelected([]);
  }, [exchange]);

  const label = exchange === "NSE" ? "NSE Ticker" : "BSE Code";

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const rawValues = rows.map((r) => r[0]).filter((v) => v !== undefined && v !== "");
    const { matched, unmatched } = await resolveSymbols(exchange, rawValues);
    setUploadResult({ matched, unmatched });
  }

  async function checkManual() {
    const rawValues = manualText.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
    const { matched, unmatched } = await resolveSymbols(exchange, rawValues);
    setManualResult({ matched, unmatched });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[
          ["upload", "📄 Excel/CSV Upload"],
          ["manual", "⌨️ Manual Entry"],
          ["browse", "🔽 Browse & Select"],
        ].map(([key, lbl]) => (
          <button key={key} onClick={() => setMethod(key)} disabled={method === key}>
            {lbl}
          </button>
        ))}
      </div>

      {method === "upload" && (
        <div>
          <p>Upload a file with one {label} per row, in the first column.</p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
          {uploadResult && (
            <div style={{ marginTop: 8 }}>
              <p>
                ✅ Recognised {uploadResult.matched.length} valid {exchange} symbol(s).
                {uploadResult.unmatched.length > 0 &&
                  ` ⚠️ Not recognised: ${uploadResult.unmatched.join(", ")}`}
              </p>
              {uploadResult.matched.length > 0 && (
                <button onClick={async () => setUploadResult({ ...uploadResult, added: await onAdd(uploadResult.matched) })}>
                  ➕ Add {uploadResult.matched.length} to Watchlist
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {method === "manual" && (
        <div>
          <p>Paste {label}s, one per line or comma-separated.</p>
          <textarea
            rows={4}
            style={{ width: "100%" }}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={exchange === "NSE" ? "RELIANCE, TCS, INFY" : "500325, 532540"}
          />
          <div style={{ marginTop: 6 }}>
            <button onClick={checkManual}>🔎 Check symbols</button>
          </div>
          {manualResult && (
            <div style={{ marginTop: 8 }}>
              <p>
                ✅ Recognised: {manualResult.matched.map((m) => m.symbol).join(", ") || "none"}
                {manualResult.unmatched.length > 0 &&
                  ` — ⚠️ Not recognised: ${manualResult.unmatched.join(", ")}`}
              </p>
              {manualResult.matched.length > 0 && (
                <button onClick={() => { onAdd(manualResult.matched); setManualResult(null); setManualText(""); }}>
                  ➕ Add {manualResult.matched.length} to Watchlist
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {method === "browse" && (
        <div>
          <p>Search and select {exchange} companies.</p>
          <select
            multiple
            size={10}
            style={{ width: "100%" }}
            value={selected}
            onChange={(e) => setSelected(Array.from(e.target.selectedOptions, (o) => o.value))}
          >
            {universe.map((r) => (
              <option key={r.symbol} value={r.symbol}>
                {r.symbol} — {r.name}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6 }}>
            <button
              disabled={!selected.length}
              onClick={async () => {
                const { matched } = await resolveSymbols(exchange, selected);
                await onAdd(matched);
                setSelected([]);
              }}
            >
              ➕ Add {selected.length} to Watchlist
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WatchlistTable({ items, quotesByYf, onRemove }) {
  const [checked, setChecked] = useState([]);

  function toggle(id) {
    setChecked(checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id]);
  }

  function fmt(v, digits = 2) {
    return v === null || v === undefined ? "—" : Number(v).toFixed(digits);
  }

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #ddd", textAlign: "left" }}>
            <th></th>
            <th>Symbol</th>
            <th>Name</th>
            <th>Price</th>
            <th>Change</th>
            <th>Change %</th>
            <th>Day High</th>
            <th>Day Low</th>
            <th>Volume</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const q = quotesByYf[it.yf_symbol];
            const changeColor = q?.change > 0 ? "#1a7f37" : q?.change < 0 ? "#b02a37" : "inherit";
            return (
              <tr key={it.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>
                  <input type="checkbox" checked={checked.includes(it.id)} onChange={() => toggle(it.id)} />
                </td>
                <td>{it.symbol}</td>
                <td>{it.name}</td>
                <td>₹{fmt(q?.price)}</td>
                <td style={{ color: changeColor }}>{fmt(q?.change)}</td>
                <td style={{ color: changeColor }}>{fmt(q?.change_pct)}%</td>
                <td>₹{fmt(q?.day_high)}</td>
                <td>₹{fmt(q?.day_low)}</td>
                <td>{q?.volume ? Number(q.volume).toLocaleString() : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button disabled={!checked.length} onClick={() => { onRemove(checked); setChecked([]); }} style={{ marginTop: 12 }}>
        🗑️ Remove Selected
      </button>
    </div>
  );
}
