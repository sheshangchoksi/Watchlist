import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const fn =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error } = await fn;
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === "signup") setMessage("Check your email to confirm your account, then sign in.");
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h2>📈 Watchlist Builder</h2>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 10 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <button type="submit" disabled={busy} style={{ width: "100%", padding: 10 }}>
          {mode === "signin" ? "Sign In" : "Sign Up"}
        </button>
      </form>
      <p style={{ marginTop: 12 }}>
        {mode === "signin" ? "No account yet? " : "Already have an account? "}
        <a href="#" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Sign up" : "Sign in"}
        </a>
      </p>
      {message && <p style={{ color: "#b02a37" }}>{message}</p>}
    </div>
  );
}
