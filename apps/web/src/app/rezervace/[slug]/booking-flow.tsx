"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Provider = { membershipId: string; displayName: string };
type Service = { id: string; name: string; description: string; durationMinutes: number; priceCents: number; providers: Provider[] };
type Catalog = { organization: { displayName: string; slug: string; timezone: string }; services: Service[] };
type Slot = { startsAt: string; endsAt: string };
type Confirmation = { booking: { confirmationCode: string; startsAt: string; endsAt: string }; cancellationToken: string };

async function data<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Požadavek se nepodařil.");
  return body.data as T;
}

function nextDate(): string {
  const date = new Date(Date.now() + 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function BookingFlow({ slug }: { slug: string }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [date, setDate] = useState(nextDate);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [message, setMessage] = useState("Načítám služby…");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const service = useMemo(() => catalog?.services.find((item) => item.id === serviceId), [catalog, serviceId]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/public/${encodeURIComponent(slug)}/catalog`).then((response) => data<Catalog>(response))
      .then((result) => {
        if (!active) return;
        setCatalog(result);
        const first = result.services[0];
        if (first) { setServiceId(first.id); setProviderId(first.providers[0]?.membershipId ?? ""); }
        setMessage(first ? "" : "Firma zatím nenabízí žádnou aktivní službu.");
      })
      .catch((error: unknown) => active && setMessage(error instanceof Error ? error.message : "Stránku nelze načíst."));
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!serviceId || !providerId || !date) return;
    let active = true;
    const query = new URLSearchParams({ serviceId, providerMembershipId: providerId, date });
    void fetch(`/api/v1/public/${encodeURIComponent(slug)}/availability?${query}`).then((response) => data<{ slots: Slot[] }>(response))
      .then((result) => { if (active) { setSlots(result.slots); setSelectedSlot(""); setMessage(result.slots.length ? "" : "Pro tento den nejsou volné termíny."); } })
      .catch((error: unknown) => active && setMessage(error instanceof Error ? error.message : "Termíny nelze načíst."));
    return () => { active = false; };
  }, [date, providerId, serviceId, slug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot) { setMessage("Nejdříve vyberte volný termín."); return; }
    const form = new FormData(event.currentTarget);
    setMessage("Potvrzuji rezervaci…");
    try {
      const result = await data<Confirmation>(await fetch(`/api/v1/public/${encodeURIComponent(slug)}/bookings`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ serviceId, providerMembershipId: providerId, startsAt: selectedSlot,
          customerName: form.get("customerName"), customerEmail: form.get("customerEmail"),
          ...(form.get("customerPhone") ? { customerPhone: form.get("customerPhone") } : {}),
          notes: form.get("notes") ?? "" })
      }));
      setConfirmation(result); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Rezervaci se nepodařilo vytvořit."); }
  }

  if (confirmation) {
    const cancelQuery = new URLSearchParams({ code: confirmation.booking.confirmationCode, token: confirmation.cancellationToken });
    return <main className="booking-shell"><section className="booking-card confirmation-card">
    <p className="eyebrow">Rezervace potvrzena</p><h1>Termín je váš.</h1>
    <p className="lede">{new Date(confirmation.booking.startsAt).toLocaleString("cs-CZ", { timeZone: catalog?.organization.timezone })}</p>
    <dl><div><dt>Potvrzovací kód</dt><dd>{confirmation.booking.confirmationCode}</dd></div></dl>
    <p>Uložte si potvrzovací kód. Firma rezervaci okamžitě vidí ve svém kalendáři.</p>
    <a className="quiet action-link" href={`/rezervace/${encodeURIComponent(slug)}/zrusit?${cancelQuery}`}>Odkaz pro zrušení rezervace</a>
    <button className="primary" onClick={() => location.reload()}>Vytvořit další rezervaci</button>
  </section></main>;
  }

  return <main className="booking-shell"><section className="booking-intro">
    <a className="brand" href="/">Slotly <span>Pro</span></a>
    <p className="eyebrow">Online rezervace</p><h1>{catalog?.organization.displayName ?? "Rezervujte si termín"}</h1>
    <p className="lede">Vyberte službu, pracovníka a volný čas. Potvrzení vznikne okamžitě.</p>
  </section><section className="booking-card">
    <form onSubmit={submit}>
      <label>Služba<select value={serviceId} onChange={(event) => {
        const nextService = catalog?.services.find((item) => item.id === event.target.value);
        setServiceId(event.target.value); setProviderId(nextService?.providers[0]?.membershipId ?? "");
        setSlots([]); setSelectedSlot("");
      }} required>
        {catalog?.services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes} min · {(item.priceCents / 100).toLocaleString("cs-CZ")} Kč</option>)}
      </select></label>
      {service?.description && <p className="service-description">{service.description}</p>}
      <label>Pracovník<select value={providerId} onChange={(event) => setProviderId(event.target.value)} required>
        {service?.providers.map((provider) => <option key={provider.membershipId} value={provider.membershipId}>{provider.displayName}</option>)}
      </select></label>
      <label>Datum<input type="date" value={date} min={nextDate()} onChange={(event) => setDate(event.target.value)} required /></label>
      <fieldset className="slot-picker"><legend>Volný čas</legend><div>
        {slots.map((slot) => <button type="button" key={slot.startsAt} aria-pressed={selectedSlot === slot.startsAt}
          onClick={() => setSelectedSlot(slot.startsAt)}>{new Date(slot.startsAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: catalog?.organization.timezone })}</button>)}
      </div></fieldset>
      <div className="form-grid"><label>Jméno<input name="customerName" minLength={2} maxLength={120} required /></label>
        <label>E-mail<input name="customerEmail" type="email" maxLength={254} required /></label>
        <label>Telefon<input name="customerPhone" type="tel" maxLength={40} /></label>
        <label>Poznámka<input name="notes" maxLength={1000} /></label></div>
      <button className="primary" disabled={!selectedSlot}>Závazně rezervovat</button>
      <p className="message" role="status">{message}</p>
    </form>
  </section></main>;
}
