---
name: komponente
description: Prüft eine einzelne Masulino-Komponente und ändert nur bestätigte Punkte. Nutzen, wenn ein Screenshot, ein Kartenname oder „diese Komponente“ gemeint ist und die Fläche von der Analyse bis zur Änderung laufen soll. Nicht für eine ganze Seite.
---

# Eine Komponente

Eine Fläche. Nicht die Seite. Impeccable bleibt das Werkzeug für Kontext und Detector. Die installierte Impeccable-Skill nicht verändern.

## Ablauf

1. Komponente benennen: sichtbare Überschrift und Datei. Beispiele: `components/reports/bar-list.tsx`, der Verlauf in `components/reports/pos-dashboard.tsx`.
2. Einmal `.cursor/skills/impeccable/scripts/impeccable context --target <datei>`, falls in der Sitzung noch nicht gelaufen. Vor dem ersten Edit `.cursor/skills/impeccable/reference/craft-floor.md` lesen.
3. Die laufende Fläche im Browser ansehen und messen. Prüfen: Ausrichtung, Lesbarkeit, Reihenfolge, was ein Klick wirklich verändert, und ob eine Zahl einen vollständigen Zeitraum behauptet.
4. Befunde zuerst in den Chat. Nur ändern, was Messung oder Ansicht bestätigen. Farben, Radien, Schriften und Lucide-Strich 1.8 bleiben. Kein `bolder`, `colorize` oder `delight`.
5. Im Browser prüfen: Hauptzustand, den geänderten Zustand, und die Nachbarfläche, die dieselben Daten liest. Die Kartenbreite messen, wenn ein Diagramm den Rand nicht erreicht.

## Beispiele

- Balken, die nur so breit sind wie der Name, zeigen den Anteil nicht. Die Leiste muss die Zeile füllen, die Breite ist der Anteil.
- Ein Segment in der Verteilung filtert die Kategorien, ohne das zu sagen. Der Filter muss auf beiden Karten stehen, und die Kurven sagen, wenn er sie nicht trifft.
- Ein unvollständiger Monat, als voller Punkt gezeichnet, liest sich als Einbruch. Die Strecke bis zum letzten erfassten Tag ist gestrichelt, und der Satz nennt das Datum.
