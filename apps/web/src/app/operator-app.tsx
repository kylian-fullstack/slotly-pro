"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Session = { userId: string; organizationId: string; membershipId: string; role: "OWNER" | "ADMIN" | "STAFF"; csrfToken: string };
type OrganizationData = { organization: { displayName: string; slug: string; defaultTimezone: string }; members: Array<{ id: string; displayName: string; email: string; role: string; status: string }> };
type AuditEvent = { id: string; action: string; targetType: string; occurredAt: string };

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? "Požadavek se nepodařil.");
  return body.data as T;
}

export function OperatorApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [mode, setMode] = useState<"login" | "registration">("login");
  const [message, setMessage] = useState("Načítám zabezpečenou relaci…");

  const load = useCallback(async () => {
    try {
      const current = await json<Session>(await fetch("/api/v1/session", { cache: "no-store" }));
      const currentOrganization = await json<OrganizationData>(await fetch("/api/v1/organizations/current", { cache: "no-store" }));
      setOrganization(currentOrganization);
      setSession(current);
      if (current.role !== "STAFF") {
        const events = await json<{ events: AuditEvent[] }>(await fetch("/api/v1/audit?limit=8", { cache: "no-store" }));
        setAudit(events.events);
      }
      setMessage("");
    } catch { setSession(null); setOrganization(null); setAudit([]); setMessage(""); }
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
        {session.role !== "STAFF" && <div className="panel"><h2>Bezpečnostní audit</h2>{audit.length === 0 ? <p>Zatím nebyla zaznamenána žádná bezpečnostní událost.</p> : <ol className="audit">{audit.map(item => <li key={item.id}><strong>{item.action}</strong><span>{new Date(item.occurredAt).toLocaleString("cs-CZ")}</span></li>)}</ol>}</div>}
        <p className="message" role="status">{message}</p>
      </section>}
    </main>
  </>;
}
