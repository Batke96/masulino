"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createStaffAccount,
  fetchStaffDirectory,
  removeStaffAccount,
  staffAccountMessage,
  type IssuedAccess,
  type StaffDirectory,
  type StaffPerson,
} from "@/lib/workspace/staff-directory";

export function ItUsers() {
  const [directory, setDirectory] = useState<StaffDirectory | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [locationId, setLocationId] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<IssuedAccess | null>(null);
  const [removeTarget, setRemoveTarget] = useState<StaffPerson | null>(null);

  async function reload() {
    const next = await fetchStaffDirectory();
    setDirectory(next);
    if (next && !roleKey && next.roles[0]) setRoleKey(next.roles[0].roleKey);
    if (next && !locationId && next.locations[0]) setLocationId(next.locations[0].id);
  }

  useEffect(() => {
    void reload();
  }, []);

  const selectedRole = directory?.roles.find((role) => role.roleKey === roleKey) ?? directory?.roles[0];
  const needsLocation = selectedRole?.needsLocation ?? false;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!selectedRole || pending) return;
    setPending(true);
    setError("");
    const result = await createStaffAccount({
      name,
      email,
      roleKey: selectedRole.roleKey,
      locationId: needsLocation ? locationId || null : null,
      password,
    });
    setPending(false);
    if (!result.ok) {
      setError(staffAccountMessage(result.details));
      return;
    }
    setIssued(result.access);
    setName("");
    setEmail("");
    setPassword("");
    await reload();
  }

  async function onRemove() {
    if (!removeTarget || pending) return;
    setPending(true);
    setError("");
    const result = await removeStaffAccount(removeTarget.membershipId);
    setPending(false);
    if (!result.ok) {
      setError(staffAccountMessage(result.details));
      setRemoveTarget(null);
      return;
    }
    setRemoveTarget(null);
    await reload();
  }

  return (
    <Tabs value="benutzer">
      <TabsList>
        <TabsTrigger value="benutzer">Benutzer</TabsTrigger>
      </TabsList>
      <TabsContent value="benutzer">
        <div className="it-directory">
          {directory === undefined ? <div className="empty-state surface"><h3>Benutzer werden geladen.</h3></div> : null}
          {directory === null ? <div className="empty-state surface"><h3>Die Benutzerliste ist nicht erreichbar.</h3><p>Prüfe die Anmeldung und versuche es erneut.</p></div> : null}
          {directory ? (
            <div className="it-directory-grid">
              <section className="surface">
                <div className="section-head"><h2>Konto anlegen</h2></div>
                <p className="fine-print">Name, E-Mail, Rolle und Passwort. Es wird keine E-Mail gesendet.</p>
                {error ? <p className="staff-gate-error">{error}</p> : null}
                {issued ? (
                  <div className="it-credential" role="status">
                    <strong>Zugang angelegt</strong>
                    <p>Diese Angaben werden nur jetzt angezeigt. Gib sie der Person persönlich. Es wird keine E-Mail gesendet.</p>
                    <dl>
                      <div><dt>E-Mail</dt><dd className="staff-gate-secret">{issued.email}</dd></div>
                      <div><dt>Passwort</dt><dd className="staff-gate-secret">{issued.password}</dd></div>
                    </dl>
                    <button className="button soft" type="button" onClick={() => setIssued(null)}>Verstanden, ausblenden</button>
                  </div>
                ) : null}
                <form className="it-form" onSubmit={(event) => void onCreate(event)}>
                  <label className="field-label">Name
                    <input required maxLength={120} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                  <label className="field-label">E-Mail
                    <input required type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                  <label className="field-label">Rolle
                    <select required value={selectedRole?.roleKey ?? ""} onChange={(event) => setRoleKey(event.target.value)}>
                      {directory.roles.map((role) => <option key={role.roleKey} value={role.roleKey}>{role.label}</option>)}
                    </select>
                  </label>
                  {needsLocation ? (
                    <label className="field-label">Standort
                      <select required value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                        {directory.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <label className="field-label">Passwort
                    <input required type="password" minLength={12} maxLength={200} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  </label>
                  <p className="fine-print">Mindestens 12 Zeichen. Das Passwort wird einmal angezeigt und nicht per E-Mail gesendet.</p>
                  <button className="button dark" type="submit" disabled={pending || directory.roles.length === 0 || (needsLocation && directory.locations.length === 0)}>
                    {pending ? "Wird gespeichert …" : "Konto anlegen"}
                  </button>
                </form>
              </section>
              <section className="surface table-surface">
                <div className="section-head"><h2>Aktive Benutzer</h2></div>
                {directory.people.length === 0 ? <div className="empty-state"><h3>Noch niemand mit einem aktiven Zugang.</h3></div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>E-Mail</TableHead>
                        <TableHead>Rolle</TableHead>
                        <TableHead>Standort</TableHead>
                        <TableHead>Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {directory.people.map((person) => (
                        <TableRow key={person.membershipId}>
                          <TableCell><strong>{person.name}</strong></TableCell>
                          <TableCell>{person.email}</TableCell>
                          <TableCell>{person.roleLabel}</TableCell>
                          <TableCell>{person.locationName ?? "Gesamter Betrieb"}</TableCell>
                          <TableCell>
                            {person.removable ? (
                              <button className="button soft" type="button" onClick={() => setRemoveTarget(person)}>Entfernen</button>
                            ) : (
                              <span className="fine-print">Geschützt</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </TabsContent>
      <Dialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent className="article-dialog" showCloseButton={false}>
          <DialogTitle>Zugang entfernen?</DialogTitle>
          <DialogDescription>
            {removeTarget ? `${removeTarget.name} kann sich danach nicht mehr anmelden und erscheint nicht mehr als aktiver Benutzer.` : ""}
          </DialogDescription>
          <div className="callout blue"><ShieldCheck size={20} /><p>Buchungen, Schließungen, Pakete und das Protokoll bleiben erhalten.</p></div>
          <div className="it-row-actions">
            <button className="button soft" type="button" onClick={() => setRemoveTarget(null)}>Abbrechen</button>
            <button className="button dark" type="button" disabled={pending} onClick={() => void onRemove()}>{pending ? "Wird entfernt …" : "Entfernen"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
