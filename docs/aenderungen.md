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

Arbeitsstand gegen `9c9fcec` („Merge remote-tracking branch 'origin/main' into cursor/sidebar-sections-d36a“). `main` hat danach den Feedback-Knopf, der eine GitHub-Meldung anlegt (`da6a7ac`). Diese Lieferung lässt ihn stehen. Der Abschnitt „Stand bis 9c9fcec“ beschreibt den Stand davor.

### Oberfläche

- Blockrahmen in `components/ui/block.tsx`. Verben, Icons, Ton und Lunte stehen in `lib/ui/actions.ts`. Zeilenaktionen liegen in `components/ui/row-action.tsx`. Eine Lunte am `JellyButton` ruft den Dienst erst, wenn sie durch ist.
- Buchungen haben einen Zeitraum und die Artwahl in `components/booking-kind-filter.tsx`: Alle, Geburtstage, Kita. Die Tischauslastung sitzt im Block. Der Saalplan-Block heißt „Tischauslastung mit Plan“.
- Die Seitenleiste klappt über einen Schalter ein und aus. Die Tagesmappe öffnet sich als Dialog über den Buchungen.

### Personal

- Der Dienstplan ist drei Blöcke: Wochenübersicht, Stundenplan, Schichtzuweisung. Überschrift „Dienstplan“ und die Woche stehen darüber.
- Im Stundenplan sind Schichten breite Spalten in der Rollenfarbe: Leitung rot, Schichtleiter bernsteinfarben, Mitarbeiter grün, Putzkraft blau. Das Fenster wächst mit dem Inhalt und scrollt nicht in sich.
- Der Reiter Verfügbarkeit ist weg. Verfügbarkeit öffnet sich als Dialog aus der Mitarbeiterzeile. Der Planvorschlag bleibt eine Rechenregel, öffnet den Dialog und schreibt nichts, bevor er übernommen wird.
- Veröffentlichen, Stempeln und Korrekturen bleiben Simulationen im Browser. Es wird nichts gesendet, gespeichert oder abgerechnet.

### Website-Anfragen

- Migration `packages/database/migrations/0012_website_booking_requests.sql` legt `website_booking_requests` wieder an, nachdem `0011_slim.sql` die Tabelle entfernt hat. Status `angefragt` ist keine bestätigte Reservierung. `angenommen` verlangt eine Reservierung.
- `POST /api/buchungen` nimmt eine Anfrage entgegen. `GET /api/buchungen` listet sie für die angemeldete Sitzung. `POST /api/buchungen/bearbeitet`, `/api/buchungen/ablehnen` und `/api/buchungen/annehmen` setzen den Status. Annehmen legt die Reservierung an.
- `app/booking-requests.tsx` ruft diese Routen auf. Die Fläche ist in `app/page.tsx` nicht eingehängt.

## Stand bis 9c9fcec

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

### Personal (Team & Schichten)

- Neuer interaktiver Personalbereich in `components/personal/` mit den Reitern Dienstplan, Mitarbeiter, Verfügbarkeit, Zeiterfassung und Regeln. Ab 768px steuern `JellyRadio`-Pillen, darunter `GlideSelect`, wie bei Buchungen und Auswertungen.
- Die Fachlogik liegt getrennt von der Anzeige in `lib/personal/` (Regeln, Verfügbarkeit, Planprüfung, Planvorschlag, Zeiterfassung, Reducer) und hat Unit-Tests in `lib/personal/personal.test.ts`.
- Planprüfung in 15-Minuten-Scheiben: Grundbesetzung je Tag, Zusatzbedarf bei hoher Auslastung (nur die höchste passende Bedingung, gedeckelt durch die Höchstbesetzung), Kasse, Leitung, Toilettenreinigung, Sonderöffnungen aus Kita-Buchungen vor 10:00 Uhr, Überschneidungen, Verfügbarkeit und Stundengrenzen. Offene Punkte sperren das Veröffentlichen, Hinweise verlangen eine Bestätigung.
- Der Planvorschlag ist eine Rechenregel ohne KI. Er zeigt vor der Übernahme, was ergänzt oder ersetzt wird und was offen bleibt. Übernahme, Schichtänderungen, Ausnahmen, Korrekturen und Regeländerungen lassen sich per Toast zurücknehmen.
- Veröffentlichen, Stempeln und Korrekturen sind Simulationen im Browser. Es wird nichts gesendet, gespeichert oder abgerechnet. Die Demo-Uhr startet am Samstag, 07.11.2026, 16:30 Uhr.
- Mit angebundenem Arbeitsbereich steht der veröffentlichte Plan aus der Datenbank weiter oben. Der Demo-Bereich folgt getrennt darunter und ist als Beispielbereich gekennzeichnet.

## Bekannte Lücken

Diese Lieferung schließt sie nicht.

- `app/booking-requests.tsx` ist nicht in `app/page.tsx` eingehängt. Die Routen unter `/api/buchungen` sind verdrahtet.
- Der Personalbereich arbeitet nur mit Beispieldaten im Browser. Es gibt keine Schreib-API für Dienstplan, Verfügbarkeit, Regeln oder Korrekturen. Die Wiederkehrenden Reinigungsdienste (Regeln, Punkt 4) sind eine Annahme der Demo. Die Karte „Schicht prüfen“ auf der Übersicht nutzt weiter eigene Beispielnamen.
- Eine Datenbank, die bei `0011_slim.sql` stehen bleibt, hat `website_booking_requests` nicht. Migration `0012_website_booking_requests.sql` legt die Tabelle wieder an.

## Nicht in diesem Commit

Die Impeccable-Engine unter `.cursor/skills/impeccable`, die zugehörigen Agenten, `.cursor/hooks.json` und die lokale Laufzeit unter `.impeccable` bleiben auf dem Rechner. Mitgeliefert sind `DESIGN.md`, `PRODUCT.md` und die Icon-Regel `.cursor/rules/icons.mdc`.
