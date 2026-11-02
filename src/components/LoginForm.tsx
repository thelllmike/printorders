"use client";

import { type FormEvent, useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = data.redirect;
        return;
      }
      setError(data.error);
    } catch {
      setError("Could not connect. Please try again.");
    }
    setBusy(false);
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={submit}>
        <h1>Print Orders</h1>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
