"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "next/navigation";

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const [message, setMessage] = useState("");
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("Přijímám pozvánku…");
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/v1/invitations/${encodeURIComponent(token)}/accept`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ email: data.get("email"), displayName: data.get("displayName"), password: data.get("password") })
    });
    const body = await response.json();
    setMessage(response.ok ? "Pozvánka byla přijata. Můžete se přihlásit." : body.error?.message ?? "Pozvánku se nepodařilo přijmout.");
  }
  return <main className="shell"><section className="auth-grid"><div><p className="eyebrow">Slotly Pro</p><h1>Přidejte se k týmu.</h1></div><div className="card"><form onSubmit={accept}><h2>Přijmout pozvánku</h2><label>Jméno<input name="displayName" required /></label><label>E-mail<input name="email" type="email" required /></label><label>Nové heslo<input name="password" type="password" minLength={12} required /></label><button className="primary">Dokončit přístup</button></form><p className="message" role="status">{message}</p></div></section></main>;
}
