"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export function CancellationFlow({ slug, initialCode, initialToken }: { slug: string; initialCode: string; initialToken: string }) {
  const [message, setMessage] = useState("");
  const [cancelled, setCancelled] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setMessage("Ruším rezervaci…");
    const response = await fetch(`/api/v1/public/${encodeURIComponent(slug)}/bookings/cancel`, { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmationCode: form.get("confirmationCode"), cancellationToken: form.get("cancellationToken") }) });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error?.message ?? "Rezervaci se nepodařilo zrušit."); return; }
    setCancelled(true); setMessage("");
  }
  return <main className="booking-shell"><section className="booking-card confirmation-card">
    <p className="eyebrow">Správa rezervace</p><h1>{cancelled ? "Rezervace je zrušena." : "Potřebujete změnu?"}</h1>
    {cancelled ? <p className="lede">Termín byl uvolněn pro dalšího zákazníka.</p> : <form onSubmit={submit}>
      <label>Potvrzovací kód<input name="confirmationCode" defaultValue={initialCode} required /></label>
      <label>Bezpečnostní token<input name="cancellationToken" defaultValue={initialToken} required /></label>
      <button className="danger">Zrušit rezervaci</button><p className="message" role="status">{message}</p>
    </form>}
  </section></main>;
}
