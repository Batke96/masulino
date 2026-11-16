# Änderungen seit dem Ursprungszustand

Bezugspunkt dieser Notiz ist der veröffentlichte Stand `6c1386d` auf `main` („Let the Inhaber create the first IT account on screen.“). Darunter liegt der Export `f853f4c` („Add the local Masulino source snapshot.“), beschrieben in `SOURCE_SNAPSHOT.md`. Der Originalcommit des Exports ist `8b493264bc309c2f3dbc8bcd9891cbe5ac71a4a2`.

## Bereits auf main

Zwischen Export und `6c1386d` liegt auf `main`:

- Lokale Einrichtung für den Cloud Agent.
- Auslieferung der Vinext-Hülle über Nitro, damit Vercel kein Next.js-Manifest erwartet.
- Zweiter Faktor für privilegierte Rollen, Schalter `MASULINO_REQUIRE_MFA`, behobene Anmeldeschleife nach dem zweiten Faktor. Beispieldaten verschwinden nach der Anmeldung.
- Produktionshärtung: Platzhalter in `.env.production.local` werden abgelehnt, `pnpm staff:add` legt ein Mitarbeiterkonto auf dem bestehenden Mandanten an, Bootstrap-Audit schreibt die Kennung im erwarteten Typ.
- Öffentliche Geburtstags-API: freie Zeiten, Formular, Speicherung der Antworten auf der Reservierung. Diese Lieferung nimmt die Routen wieder aus dem Server.
- IT-Arbeitsbereich für Einladungen und Standortstammdaten. IT legt Mitarbeiterkonten an und entfernt sie. Jede Rolle meldet sich mit E-Mail und Passwort an. Der Inhaber legt das erste IT-Konto auf dem Bildschirm an.

## Diese Lieferung

Arbeitsstand gegen `6c1386d`.

### Buchungen

- Sortierbare Listen für Geburtstage und Kita- oder Schulbesuche in `app/booking-lists.tsx`, mit Zeitraumwahl.
- Saalplan in `app/table-floor.tsx` für Gruppen und Geburtstage.
- Entfernen einer Buchung geht über die bestehende Storno-Route. Der Check-in bleibt eine Markierung in der Ansicht und wird nicht gespeichert.
- `scripts/ensure-floor-tables.ts` legt die Tische für den Standort Äppelallee an und schreibt nur in eine lokale Datenbank. Der Seed übernimmt dieselben Tischplätze.
- `GET /api/reservations/span` liefert Buchungen für einen Zeitraum an Listen, Saalplan und Auswertungen.

### Auswertungen

`components/reports/pos-dashboard.tsx` ist die Fläche Auswertungen. Reiter: Kasse, Buchungen, Besucher, Geburtstage, Ziel. Monat und Jahr, Vergleich zum vorherigen Zeitraum, leere und fehlgeschlagene Zustände. Kasse kommt von `GET /api/pos/report`, Buchungen von `GET /api/reservations/span`.

### Kasse

- Schema `packages/database/migrations/0010_pos.sql`, Modul `packages/modules/pos`.
- Import einer CSV mit `pnpm db:import-pos -- "/pfad/kassenpositionen.csv"`.
- Jahr, Monat und Wochentag werden aus dem Geschäftstag abgeleitet und nicht gespeichert.

### Standort und Zuschnitt

- Der Seed lässt nur noch den Mandanten Masulino Spielwelt und den Standort Äppelallee (Biebrich), Slug `aeppelallee-biebrich`. Beispielhalle, Berlin und Potsdam fallen weg. Kassenzeilen dieses Standorts überstehen einen erneuten Seed.
- Beispiele und Sortierung nennen Wiesbaden: `MASULINO_PUBLIC_VENUE_SLUG=masulino-wiesbaden` in den Env-Beispielen, Standortlisten ordnen den Slug `wiesbaden` nach vorn. Der Seed-Slug bleibt `aeppelallee-biebrich`. Der Kommentar in `.env.example`, der Seed nutze `masulino-wiesbaden`, trifft den Seed-Slug nicht.
- `packages/database/migrations/0011_slim.sql` löscht Kassenzeilen außer Äppelallee, den Standort Igstadt (alt) und Tabellen außerhalb von Buchung, Schicht und Kasse: Kampagnen, Einwilligungen, Treue, Checklisten, Hinweise, erwachsene Kontakte, `published_venues`, `website_booking_requests` und weitere.
- Pakete `contacts`, `loyalty`, `marketing`, `notices` und `operations` sind entfernt. Die öffentlichen Geburtstagsrouten sind aus dem Server genommen. `README.md` und `docs/birthday-form.md` behalten den bisherigen Vertrag und kennzeichnen ihn als nicht verdrahtet.

### Oberfläche

- Gemeinsame Tabelle `components/data-table.tsx` mit Sortierung über Lucide `ArrowUp` und `ArrowDown`.
- Die IT-Benutzerliste nutzt diese Tabelle. Der Hinweis zum gebuchten Betrag nennt Kinderzahl mal Paketpreis plus Erwachsenenpauschale und keine Zahlung.
- Anmeldetexte ohne abschließenden Punkt. Fehler stehen in `role="alert"`.

## Bekannte Lücken

Diese Lieferung schließt sie nicht.

- `app/booking-requests.tsx` ist nicht in `app/page.tsx` eingebunden. Der Client ruft `/api/buchungen` auf. Der Router hat diese Route nicht.
- Migration `0009_website_booking_requests.sql` legt `website_booking_requests` an. Migration `0011_slim.sql` löscht die Tabelle wieder.

## Nicht in diesem Commit

Die Impeccable-Engine unter `.cursor/skills/impeccable`, die zugehörigen Agenten, `.cursor/hooks.json` und die lokale Laufzeit unter `.impeccable` bleiben auf dem Rechner. Mitgeliefert sind `DESIGN.md`, `PRODUCT.md` und die Icon-Regel `.cursor/rules/icons.mdc`.
