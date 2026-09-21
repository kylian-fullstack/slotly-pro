"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Session = { userId: string; organizationId: string; membershipId: string; role: "OWNER" | "ADMIN" | "STAFF"; csrfToken: string };
type OrganizationData = { organization: { displayName: string; slug: string; defaultTimezone: string }; members: Array<{ id: string; displayName: string; email: string; role: string; status: string }> };
type AuditEvent = { id: string; action: string; targetType: string; occurredAt: string };
type BookingData = {
  services: Array<{ id: string; name: string; durationMinutes: number; priceCents: number; active: boolean; providerMembershipIds: string[] }>;
  availability: Array<{ id: string; membershipId: string; weekday: number; startMinute: number; endMinute: number }>;
  bookings: Array<{ id: string; startsAt: string; endsAt: string; status: string; customerName: string; customerEmail: string; customerPhone?: string; notes: string; confirmationCode: string; serviceName: string; providerName: string }>;
};

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Požadavek se nepodařil.");
  return body.data as T;
}

export function OperatorApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [bookingData, setBookingData] = useState<BookingData>({ services: [], availability: [], bookings: [] });
  const [mode, setMode] = useState<"login" | "registration">("login");
  const [message, setMessage] = useState("Načítám zabezpečenou relaci…");

  const load = useCallback(async () => {
    try {
      const current = await json<Session>(await fetch("/api/v1/session", { cache: "no-store" }));
      const currentOrganization = await json<OrganizationData>(await fetch("/api/v1/organizations/current", { cache: "no-store" }));
      setOrganization(currentOrganization);
      setSession(current);
      setBookingData(await json<BookingData>(await fetch("/api/v1/booking/admin", { cache: "no-store" })));
      if (current.role !== "STAFF") {
        const events = await json<{ events: AuditEvent[] }>(await fetch("/api/v1/audit?limit=8", { cache: "no-store" }));
        setAudit(events.events);
      }
      setMessage("");
    } catch { setSession(null); setOrganization(null); setAudit([]); setBookingData({ services: [], availability: [], bookings: [] }); setMessage(""); }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("Přihlašuji…");
    const data = new FormData(event.currentTarget);
    try {
      await json(await fetch("/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }) }));
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Přihlášení se nepodařilo."); }
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("Zakládám bezpečný účet…");
    const data = new FormData(event.currentTarget);
    try {
      await json(await fetch("/api/v1/registration", { method: "POST", headers: {
        "content-type": "application/json", "idempotency-key": crypto.randomUUID()
      }, body: JSON.stringify({ email: data.get("email"), password: data.get("password"),
        displayName: data.get("displayName"), organizationName: data.get("organizationName"),
        organizationSlug: data.get("organizationSlug"), timezone: "Europe/Prague" }) }));
      setMode("login"); setMessage("Účet je vytvořený. Teď se přihlaste.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Registrace se nepodařila."); }
  }

  async function mutate(path: string, method: string, body?: unknown) {
    if (!session) return;
    return json(await fetch(path, { method, headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken },
      ...(body ? { body: JSON.stringify(body) } : {}) }));
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try {
      const result = await mutate("/api/v1/members/invitations", "POST", { email: data.get("email"), role: data.get("role"), expiresInHours: 48 }) as { token: string };
      const link = `${location.origin}/pozvanka/${encodeURIComponent(result.token)}`;
      let copied = false;
      try { await navigator.clipboard?.writeText(link); copied = true; } catch { /* The link remains visible for manual copying. */ }
      setMessage(`Pozvánka je vytvořená. ${copied ? "Odkaz byl zkopírován" : "Zkopírujte odkaz"}: ${link}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pozvánku se nepodařilo vytvořit."); }
  }

  async function logout() {
    try { await mutate("/api/v1/auth/logout", "POST"); } finally { setSession(null); setOrganization(null); setMessage("Byli jste odhlášeni."); }
  }

  async function updateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { await mutate("/api/v1/organizations/current", "PATCH", { displayName: data.get("displayName") }); await load(); setMessage("Název firmy byl uložen."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Změnu se nepodařilo uložit."); }
  }

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    try {
      await mutate("/api/v1/booking/services", "POST", { name: data.get("name"), description: data.get("description") ?? "",
        durationMinutes: Number(data.get("durationMinutes")), priceCents: Math.round(Number(data.get("price")) * 100),
        providerMembershipIds: [String(data.get("providerMembershipId"))] });
      form.reset(); await load(); setMessage("Služba byla zveřejněna v rezervačním formuláři.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Službu se nepodařilo vytvořit."); }
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const rules = [];
    for (let weekday = 1; weekday <= 7; weekday += 1) {
      if (!data.get(`enabled-${weekday}`)) continue;
      const start = String(data.get(`start-${weekday}`) ?? "09:00").split(":").map(Number);
      const end = String(data.get(`end-${weekday}`) ?? "17:00").split(":").map(Number);
      rules.push({ weekday: weekday % 7, startMinute: (start[0] ?? 0) * 60 + (start[1] ?? 0), endMinute: (end[0] ?? 0) * 60 + (end[1] ?? 0) });
    }
    try {
      await mutate("/api/v1/booking/availability", "PUT", { membershipId: data.get("membershipId"), rules });
      await load(); setMessage("Pracovní doba byla uložena.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Pracovní dobu se nepodařilo uložit."); }
  }

  async function updateBooking(bookingId: string, status: "CANCELLED" | "COMPLETED" | "NO_SHOW") {
    try { await mutate(`/api/v1/booking/bookings/${bookingId}`, "PATCH", { status }); await load(); setMessage("Stav rezervace byl změněn."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Rezervaci se nepodařilo změnit."); }
  }

  async function changeMember(memberId: string, action: "suspend" | "remove") {
    try {
      await mutate(`/api/v1/members/${memberId}`, action === "remove" ? "DELETE" : "PATCH", action === "suspend" ? { status: "SUSPENDED" } : undefined);
      await load(); setMessage(action === "remove" ? "Člen byl odebrán." : "Přístup člena byl pozastaven.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Změnu člena se nepodařilo provést."); }
  }

  return <>
    <a className="skip-link" href="#obsah">Přeskočit na obsah</a>
    <header className="topbar"><a className="brand" href="/">Slotly <span>Pro</span></a>{session && <button className="quiet" onClick={logout}>Odhlásit</button>}</header>
    <main id="obsah" className="shell">
      {!session ? <section className="auth-grid">
        <div><p className="eyebrow">Provoz bez chaosu</p><h1>Rezervace pod kontrolou.</h1><p className="lede">Bezpečné účty, role a auditní stopa jako základ profesionálního rezervačního systému.</p></div>
        <div className="card"><div className="tabs" aria-label="Přístup k účtu">
          <button aria-pressed={mode === "login"} onClick={() => setMode("login")}>Přihlášení</button>
          <button aria-pressed={mode === "registration"} onClick={() => setMode("registration")}>Založit firmu</button>
        </div>
        {mode === "login" ? <form onSubmit={login}><h2>Vítejte zpět</h2><label>E-mail<input name="email" type="email" autoComplete="email" required /></label><label>Heslo<input name="password" type="password" autoComplete="current-password" required /></label><button className="primary">Přihlásit se</button></form>
          : <form onSubmit={register}><h2>Nová firma</h2><label>Vaše jméno<input name="displayName" required minLength={2} /></label><label>Název firmy<input name="organizationName" required minLength={2} /></label><label>Adresa firmy<input name="organizationSlug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="moje-firma" required /></label><label>E-mail<input name="email" type="email" required /></label><label>Heslo (min. 12 znaků)<input name="password" type="password" minLength={12} required /></label><button className="primary">Vytvořit účet majitele</button></form>}
        <p className="message" role="status">{message}</p></div>
      </section> : <section className="dashboard">
        <div className="hero"><p className="eyebrow">Pracovní prostor</p><h1>{organization?.organization.displayName}</h1><p>{organization?.organization.slug} · {session.role}</p></div>
        {session.role !== "STAFF" && <div className="panel"><h2>Profil firmy</h2><form className="inline-form" onSubmit={updateOrganization}><label>Název firmy<input key={organization?.organization.displayName ?? "organization"} name="displayName" defaultValue={organization?.organization.displayName ?? ""} required /></label><label>Časová zóna<input key={organization?.organization.defaultTimezone ?? "timezone"} defaultValue={organization?.organization.defaultTimezone ?? ""} readOnly /></label><button className="primary">Uložit</button></form></div>}
        <div className="panel"><div className="panel-title"><h2>Tým</h2><span>{organization?.members.length ?? 0} členů</span></div>
          <div className="members">{organization?.members.map(member => <article key={member.id}><span className="avatar">{member.displayName.slice(0, 1).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email}</small></div><div className="member-actions"><span className="pill">{member.role}</span>{member.id !== session.membershipId && (session.role === "OWNER" || (session.role === "ADMIN" && member.role === "STAFF")) && <><button className="quiet" onClick={() => changeMember(member.id, "suspend")}>Pozastavit</button><button className="danger" onClick={() => changeMember(member.id, "remove")}>Odebrat</button></>}</div></article>)}</div>
        </div>
        {session.role !== "STAFF" && <div className="panel"><h2>Pozvat kolegu</h2><form className="inline-form" onSubmit={invite}><label>E-mail<input name="email" type="email" required /></label><label>Role<select name="role"><option value="STAFF">Pracovník</option>{session.role === "OWNER" && <option value="ADMIN">Správce</option>}</select></label><button className="primary">Vytvořit odkaz</button></form></div>}
        <div className="panel"><div className="panel-title"><h2>Rezervace</h2><a href={`/rezervace/${organization?.organization.slug}`} target="_blank" rel="noreferrer">Otevřít veřejnou stránku</a></div>
          {bookingData.bookings.length === 0 ? <p>Zatím nemáte žádné rezervace.</p> : <div className="booking-list">{bookingData.bookings.map((booking) => <article key={booking.id}>
            <time>{new Date(booking.startsAt).toLocaleString("cs-CZ", { timeZone: organization?.organization.defaultTimezone })}</time>
            <div><strong>{booking.customerName} · {booking.serviceName}</strong><small>{booking.providerName} · {booking.customerEmail} · kód {booking.confirmationCode}</small></div>
            <span className="pill">{booking.status}</span>{booking.status === "CONFIRMED" && <div className="booking-actions"><button className="quiet" onClick={() => updateBooking(booking.id, "COMPLETED")}>Dokončeno</button><button className="quiet" onClick={() => updateBooking(booking.id, "NO_SHOW")}>Nedorazil</button><button className="danger" onClick={() => updateBooking(booking.id, "CANCELLED")}>Zrušit</button></div>}
          </article>)}</div>}
        </div>
        {session.role !== "STAFF" && <div className="panel"><h2>Služby</h2><form className="service-form" onSubmit={createService}>
          <label>Název<input name="name" minLength={2} maxLength={120} required /></label><label>Popis<input name="description" maxLength={1000} /></label>
          <label>Délka (minuty)<input name="durationMinutes" type="number" min={5} max={720} step={5} defaultValue={60} required /></label>
          <label>Cena (Kč)<input name="price" type="number" min={0} max={1000000} step="0.01" defaultValue={0} required /></label>
          <label>Pracovník<select name="providerMembershipId" required>{organization?.members.filter((member) => member.status === "ACTIVE").map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
          <button className="primary">Přidat službu</button></form>
          <ul className="service-list">{bookingData.services.map((item) => <li key={item.id}><strong>{item.name}</strong><span>{item.durationMinutes} min · {(item.priceCents / 100).toLocaleString("cs-CZ")} Kč</span></li>)}</ul>
        </div>}
        {session.role !== "STAFF" && <div className="panel"><h2>Pracovní doba</h2><form onSubmit={saveAvailability}>
          <label>Pracovník<select name="membershipId" required>{organization?.members.filter((member) => member.status === "ACTIVE").map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
          <div className="hours-grid">{["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"].map((day, index) => <div key={day}>
            <label className="check-label"><input type="checkbox" name={`enabled-${index + 1}`} defaultChecked={index < 5} />{day}</label>
            <input aria-label={`${day} od`} name={`start-${index + 1}`} type="time" defaultValue="09:00" /><input aria-label={`${day} do`} name={`end-${index + 1}`} type="time" defaultValue="17:00" />
          </div>)}</div><button className="primary">Uložit pracovní dobu</button></form>
        </div>}
        {session.role !== "STAFF" && <div className="panel"><h2>Bezpečnostní audit</h2>{audit.length === 0 ? <p>Zatím nebyla zaznamenána žádná bezpečnostní událost.</p> : <ol className="audit">{audit.map(item => <li key={item.id}><strong>{item.action}</strong><span>{new Date(item.occurredAt).toLocaleString("cs-CZ")}</span></li>)}</ol>}</div>}
        <p className="message" role="status">{message}</p>
      </section>}
    </main>
  </>;
}
