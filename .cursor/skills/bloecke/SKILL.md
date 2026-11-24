---
name: bloecke
description: >-
  Wählt Blöcke und Controls und formt Flächen in den Blockrahmen.
  Nutzen beim Erstellen eines Blocks, beim Überführen einer Mockup-App in
  Blöcke und beim Prüfen eines vorhandenen Blocks gegen die Buchungen-Zeile.
  Nicht für eine einzelne Diagrammkomponente; dafür komponente.
---

# Blöcke

Die Entscheidung steht in `.cursor/rules/blocks.mdc` und `.cursor/rules/controls.mdc`. Dieser Ablauf füllt die Plätze. `komponente` bleibt für eine einzelne Fläche mit Impeccable.

Vor dem ersten Edit `lib/ui/actions.ts` und `components/ui/block.tsx` lesen. Ein Auftrag, eine App.

## Auftrag wählen

1. Erstellen. Die Frage hat noch keinen Block.
2. Überführen. Inhalt einer Mockup-App liegt noch außerhalb des Rahmens.
3. Prüfen. Ein Block steht schon und soll in die Designphilosophie.

## Rahmen

`Block` hat diese Plätze. Ein leerer Platz wird nicht gerendert.

| Platz | Prop | Inhalt |
| --- | --- | --- |
| Überschrift | `title`, `count` | Frage links. Zähler nur bei einer Liste. |
| Filter | `controls` | Links, höchstens die Filter der Frage. |
| Aktionen | `actions` | Rechts, höchstens zwei kurze Aktionen. |
| Fenster | `children`, `columns` | Die Antwort. Zwei Lesarten sind `columns={2}`. |
| Leseschlüssel | `legend` | Farbe, die sonst stumm wäre. |
| Fußnote | `note` | Demo, Fixture, was nicht gespeichert wird. |

Seitenaktionen stehen über dem ersten Block, nicht in ihm.

## Controls wählen

Das Verb zuerst in `lib/ui/actions.ts`. Icon, Name, Ton und Lunte kommen aus dem Eintrag. Fehlt es, zuerst Katalog und `lib/ui/actions.test.ts`, dann die Fläche.

- Filter mit 2–5 Werten in der Steuerung: `PillSelect`, Icon und gewählter Name. Die übrigen Werte öffnen sich nach unten.
- Mehr Werte oder lange Labels: `GlideSelect`.
- Offene Wahl, die selbst der Inhalt ist: `JellyRadio`. Nicht in der Steuerungszeile.
- Knopf: `ActionButton` auf `JellyButton`. `dark` führend, `soft` sekundär, `icon` wenn der Eintrag eindeutig ist.
- Zeile: `RowAction`. Öffnen, Check-in, Entfernen sind Icons. Check-in und Entfernen tragen die Lunte.
- Liste: `DataTable`.

Ein neues Control entsteht erst, wenn diese sechs die Aufgabe nicht können. Keine neue Farbe, kein zweiter Knopf für dieselbe Aufgabe.

Die Steuerungszeile von Buchungen ist der Maßstab, auch am Saalplan:

- Zeile 36px, Filterabstand 8px, Abstand zur Überschrift 12px, Abstand zum Fenster 12px.
- Filter links als geschlossene Pills. Aktionen rechts.
- Den Abstand des Fensters nicht für einen einzelnen Block auf null setzen.

## 1. Erstellen

1. Die Frage in einem Satz benennen. Zwei Fragen sind zwei Blöcke.
2. Plätze füllen. Verben nur aus der Liste.
3. Im Browser die neue Zeile gegen die Buchungen-Zeile messen: Höhe, Abstand, linke Kante.
4. Den Hauptzustand und den geänderten Zustand bedienen. Eine Nachbarfläche, die dieselben Daten liest, bleibt stimmig.

## 2. Überführen

Die App-Kachel bleibt der Einstieg. Der Inhalt wird in Blöcke zerlegt, eine Frage pro Block. Demo- und Fixture-Sätze bleiben als Fußnote sichtbar.

Reihenfolge, eine App pro Auftrag: Tagesmappe, Personal, Auswertungen, Kunden, Betrieb, Gastro, Kasse, Kampagnen.

Danach wie beim Erstellen messen und bedienen.

## 3. Prüfen

1. Die laufende Fläche im Browser ansehen. Titel gegen Steuerung, Seitenaktion gegen Blockaktion, Eintragsaktion gegen Leseschlüssel, Zeile gegen die Buchungen-Zeile.
2. Befunde zuerst in den Chat. Nur ändern, was Messung oder Ansicht bestätigen.
3. Die Abweichung in den Rahmen heben. Dafür keinen zweiten Knopf und keine neue Farbe anlegen.
4. Hauptzustand, geänderten Zustand und die Nachbarfläche prüfen, die dieselben Daten liest.

Eine Lunte ist `undo="fuse"`. Der Dienst wird erst gerufen, wenn sie durch ist. Ein Abbruch oder das Verlassen der Fläche schreibt nichts. Während der Prüfung keine Lunte durchlaufen lassen.
