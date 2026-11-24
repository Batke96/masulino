---
name: Masulino Operate
description: Ruhiger, rollenbasierter Arbeitsplatz für den Betrieb der Masulino Spielwelt.
colors:
  canvas: "#f6f7fa"
  background: "#ffffff"
  foreground: "#242732"
  text: "#252937"
  text-secondary: "#70798b"
  primary: "#ef603b"
  primary-foreground: "#ffffff"
  ring: "#ee714f"
  ink: "#2c3040"
  ink-hover: "#151928"
  navy: "#222a44"
  destructive: "#a33b32"
  destructive-bg: "color-mix(in srgb, #a33b32 18%, white)"
  success: "#33775a"
  success-bg: "#eaf5ef"
  warning: "#926916"
  warning-bg: "#fff3d9"
  status-high: "#a7582c"
  status-high-bg: "#fff0e7"
  info: "#496ca4"
  info-bg: "#eaf1fe"
  border: "#e6e7ec"
  input: "#e0e2e8"
  secondary: "#f4f5f7"
  secondary-foreground: "#353845"
  muted: "#f2f3f6"
  accent: "#f0f1f5"
  accent-foreground: "#262934"
  sidebar-accent: "#fff0ea"
typography:
  display:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  metric:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  meta:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  pill: "4px"
  control: "8px"
  surface: "16px"
  full: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  7: "28px"
  8: "32px"
  9: "36px"
  10: "40px"
  11: "44px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "36px"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "40px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  surface:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "16px"
  status-pill:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "4px 8px"
---

# Design System: Masulino Operate

## Overview

**Creative North Star: "Die Empfangstheke"**

Masulino Operate ist eine ruhige, belastbare Arbeitsfläche für deutschsprachige Mitarbeitende am Empfang und im Backoffice. Wie eine gut organisierte Empfangstheke zeigt das System zuerst, was für den heutigen Betrieb zählt: klare Aufgaben, stabile Navigation, lesbare Zustände und eindeutige nächste Schritte.

Kühles Papier, weiße Arbeitsflächen, Haarlinien und eine einzelne korallfarbene Stimme bilden die visuelle Basis. Die Oberfläche ist kompakt, aber nicht gedrängt; Hierarchie entsteht durch Typografie, Einzüge und semantische Zustände, nicht durch Dekoration. Die CSS-Tokens unter `app/styles/tokens/` sind normativ; bei einer Abweichung gewinnt immer der Token.

**Key Characteristics:**
- Kühler Arbeitsgrund mit weißen, flachen Flächen und feinen Grenzen.
- Ein selten eingesetzter Korallakzent für Marke, aktive Navigation und führende Aktion.
- Inter in sechs Rollen und ausschließlich den Gewichten 400 und 600.
- 4px-Rhythmus, 8px-Steuerelemente und 16px-Arbeitsflächen.
- Sichtbarer, einheitlicher Tastaturfokus und reduzierte Bewegung auf Systemwunsch.

## Colors

Die Palette trennt Marke, Arbeitsmaterial und Betriebszustand klar. Korall ist die einzige warme Akzentstimme; Navy ist eine dunkle Spezialfläche, kein zweiter Akzent.

### Primary
- **Masulino-Korall** (`primary`): Marke, aktive Navigation und führende Aktion.
- **Korall-Ring** (`ring`): alleinige Quelle des sichtbaren Tastaturfokus und der akzentuierten Hover-Grenze.
- **Korall-Waschung** (`sidebar-accent`): leiser Hintergrund für aktive Navigation und assistierende Hinweise.

### Secondary
- **Theken-Tinte** (`ink`, `ink-hover`): dunkle, hochverbindliche Arbeitsaktionen.
- **Navy-Panel** (`navy`): Wetter- und Konzeptflächen, niemals allgemeiner Akzent.

### Tertiary
- **Erfolg** (`success`, `success-bg`): positive oder anwesende Zustände.
- **Warnung** (`warning`, `warning-bg`): wartende oder vorsichtige Zustände.
- **Hohe Aufmerksamkeit** (`status-high`, `status-high-bg`): warmer operativer Hinweis ohne Markenfunktion.
- **Information** (`info`, `info-bg`): sachliche Hinweise.
- **Destruktiv** (`destructive`, `destructive-bg`): Fehler und irreversible Aktionen. `destructive-bg` ist über `--color-destructive-bg` in Tailwind verfügbar.

### Neutral
- **Kühles Papier** (`canvas`): äußerer Arbeitsgrund.
- **Weiße Fläche** (`background`): Karten, Navigation, Felder und Overlays.
- **Texttinte** (`foreground`, `text`): primäre Inhalte.
- **Sekundärtinte** (`text-secondary`): Erklärungen, Metadaten und inaktive Navigation.
- **Haarlinie und Feldkante** (`border`, `input`): strukturelle Trennung.
- **Leise Füllungen** (`secondary`, `muted`, `accent`): sekundäre Aktionen und Zustandsflächen.

### Named Rules
**The One Accent Rule.** Neue UI verwendet `primary` als einzige warme Akzentstimme. Navy und Statusfarben bleiben an ihre semantischen Rollen gebunden.

**The Local Data Color Rule.** Die Saalplanfarben für freie, reservierte und gebuchte Tische sowie Aquarium, Wände und Raumkörper sind lokale Diagrammfarben. Die Berichtskategorien in `components/reports/kasse-tab.tsx` sind ebenfalls lokal; beide Gruppen werden weder zu globalen UI-Tokens noch auf Statusfarben umgedeutet.

## Typography

**Display Font:** Inter (mit Aptos, Segoe UI, Arial und sans-serif als Fallback)
**Body Font:** Inter (mit Aptos, Segoe UI, Arial und sans-serif als Fallback)

**Character:** Eine sachliche Grotesk hält Zahlen, Navigation und Betriebskopie aus einem Guss. Enges Tracking stärkt Überschriften; Lauftext bleibt offen und ruhig.

### Hierarchy
- **Display** (600, 32px, 1.2): Seitentitel und Begrüßung.
- **Metric** (600, 24px, 1.2): Kennzahlen und Dialogtitel.
- **Title** (600, 20px, 1.2): Abschnitts- und Kartentitel.
- **Body** (400, 16px, 1.65): Lauftext und ausführliche Erklärungen.
- **Label** (400 oder 600, 14px, 1.4): Bedienung, Tabellen und Labels; 14px ist die Untergrenze für operative Inhalte.
- **Meta** (400 oder 600, 12px, 1.4): Legenden, Zeitangaben und ergänzende Hinweise.

### Named Rules
**The Two Weight Rule.** Es gibt nur 400 für regulären Text und 600 für Überschriften oder Betonung. Tailwinds `font-medium` bildet ausdrücklich auf 600 ab.

**The Role Ramp Rule.** `text-xs` bis `text-2xl` bilden genau Meta, Label, Body, Title, Metric und Display ab. Größere Tailwind-Schritte sind deaktiviert.

## Layout

Der Arbeitsplatz besitzt eine stabile Seitenleiste, eine obere Leiste und eine zentrierte Inhaltsfläche bis 1600px. Das Raster basiert durchgehend auf 4px und reicht von 4px bis 48px. Die Hauptabstände wachsen auf breiten Ansichten und verdichten sich auf Tablet und Telefon, ohne neue Zwischenwerte einzuführen.

Arbeitsflächen teilen eine Inhaltsachse: 16px Innenabstand und 16px Radius. Auf der Übersicht beschreibt `--inset-line` die gemeinsame Achse aus 1px Rand und 16px Inhaltseinzug; Begrüßung, Abschnittsleisten, KPI-Inhalt, Appkarten und rechte Aktionen richten sich daran aus. Mehrspaltige Kennzahlen, App-Raster und Tabellen brechen responsiv bei den implementierten Schwellen 1500px, 1199px, 1040px, 767px und in einzelnen dichten Flächen 640px/375px um.

Die Auslastungssteuerung bleibt ab 768px als direkt sichtbare Tabs auf einer Zeile. Unter 768px wird sie in zwei beschriftete Selects für Zeitraum und Informationstiefe überführt. Das ist ein Wechsel der Bedienform, nicht der verfügbaren Zustände.

**The Token Step Rule.** Responsive Layouts dürfen nur auf vorhandene Abstands-, Radius- und Typerollen wechseln.

## Elevation & Depth

Masulino ist flach im Ruhezustand. Primäre Arbeitsflächen tragen eine 1px-Grenze und keinen Schatten; Tiefe erscheint nur dort, wo die Interaktion oder Schichtung sie verlangt.

### Shadow Vocabulary
- **Control** (`--elevation-control`): leichter Halt für Felder, Outline-Aktionen und kleine eingebettete Elemente.
- **Floating** (`--elevation-floating`): Menüs, Auswahlflächen, Composer und schwebende Vorschauen.
- **Overlay** (`--elevation-overlay`): Dialoge und Sheets über dem Arbeitsplatz.
- **Card Hover** (`--elevation-card-hover`): ausschließlich als Reaktion auf den Hover einer interaktiven Karte.

### Named Rules
**The Flat-by-Default Rule.** Eine ruhende Arbeitsfläche ist flach. Semantische Elevationsrollen ersetzen rohe, komponentenspezifische Schatten.

## Shapes

Die Formensprache folgt vier Rollen: 4px für kompakte Statuspills, 8px für Steuerelemente, 16px für Arbeitsflächen und 999px nur für echte Kreise oder vollständig runde Formen. Der Radius einer Standardfläche entspricht ihrem 16px-Innenabstand, sodass Kurve und Inhaltskante auf derselben Geometrie beruhen.

**The Surface Geometry Rule.** Eine Standardfläche verwendet ausnahmslos 16px Radius und 16px Padding.

## Components

Komponenten teilen dieselben Farb-, Typografie-, Zustands-, Elevations- und Bewegungsrollen, unabhängig davon, ob sie als Workspace-Klasse oder Primitive aus `components/ui` umgesetzt sind.

### Buttons
- **Canonical:** Neue und geänderte Aktionen verwenden `JellyButton` aus `components/ui/jelly-button`. Legacy-Klassen `.button`, `.button.soft` und `.button.dark` werden nicht für neue UI genutzt. Verb, Icon, Name und Ton kommen aus `lib/ui/actions.ts`.
- **Dark:** Führende oder verbindliche Aktion (`Fertig`, `Buchung anlegen`).
- **Soft:** Sekundäre oder umkehrbare Aktion (`Abbrechen`, `Öffnen`, Katalog hinzufügen).
- **Icon:** Nur das Icon, wenn der Eintrag eindeutig ist und die Breite unter 768 px liegt, oder die Aktion allein schon klar ist (Zurück, Vor, Schließen, Bearbeiten). Der zugängliche Name nennt das Objekt.
- **Tones:** Ein Knopf ist eine Fläche ohne Rand. `neutral` bleibt auf der Variante: führend `--ink` mit hellem Icon, sekundär eine dunklere Mischung aus `--ink` und der Fläche mit dunklem Icon. `present` füllt `--success`, `danger` füllt `--destructive`. Das Icon ist `--primary-foreground`. Gedrückt oder unter dem Zeiger wird die Fläche dunkler, nicht umrandet.
- **Fuse:** `undo="fuse"` zeigt nach dem Druck „Rückgängig“ für `--undo-window`. Die Lunte ist ein heller Strich auf der gefüllten Fläche, `--fuse-thickness` stark. Check-in bleibt `--success`, Entfernen `--destructive`, eine noch nicht geschriebene Annahme `--warning`. Der Dienst wird erst nach der Lunte gerufen. Abbruch und Verlassen schreiben nichts. Unter `prefers-reduced-motion` bleibt der Knopf stehen, ohne umlaufenden Strich.
- **States:** Fokus, Hover und Disabled folgen den gemeinsamen State-/Motion-Rollen; deaktiviert bedeutet Opazität 0.5 und keine Interaktion.

### Blocks
- **Frame:** `components/ui/block.tsx` hat Titel und Zähler allein links. Die Steuerung darunter trägt Filter links und höchstens zwei Aktionen rechts, dazu Fenster, Leseschlüssel und Fußnote. Ein leerer Platz wird nicht gerendert.
- **Page actions:** Aktionen der ganzen Seite stehen einmal über dem ersten Block.
- **Scope:** Die Filter in der Steuerung sind `PillSelect`, auch an der Tischauslastung: eine Pill mit Icon und dem gewählten Namen. Die übrigen Werte öffnen sich nach unten als Pills. Höhe und Abstand folgen der Buchungen-Zeile. `JellyRadio` bleibt, wo die offene Wahl selbst der Inhalt ist.
- **Rows:** Eintragsaktionen kommen aus `RowAction`, in der Reihenfolge der Liste. Ab 768 px Icon und Text, darunter das Icon, wenn es eindeutig ist.
- **Legend:** Ein Leseschlüssel steht oben im Fenster und erklärt Farbe, die sonst stumm wäre.
- **Columns:** Zwei Lesarten derselben Frage teilen sich ein Fenster. Zwei Fragen sind zwei Blöcke.

### Selection Controls
- **Toggle pills:** 2–5 Optionen auf einer Zeile verwenden `JellyRadio` (Auslastungs-Tabs, Periodenwahl am Desktop).
- **Dropdown:** Mehr Optionen, lange Labels oder Phone unter 768px verwenden `GlideSelect`. Trigger und Menü behalten Control-, Focus- und Floating-Rollen.
- **The One Choice Control Rule.** Kein neues Select-, Tabs- oder Chip-Muster neben `JellyRadio` und `GlideSelect` für dieselbe Auswahlaufgabe.

### Chips
- **Style:** 4px Radius, 4px × 8px Padding, 12px Typografie in 600.
- **State:** Grün, Amber, Blau und warmes Orange vermitteln ausschließlich semantische Zustände. Vollrunde Badges aus den UI-Primitives bleiben für Zähler oder echte Badge-Silhouetten reserviert.

### Cards / Containers
- **Corner Style:** Arbeitsflächen 16px; kompakte interaktive Karten können 8px verwenden, die Übersichts-Appkarten verwenden 16px.
- **Background:** Weiß auf kühlem Canvas mit 1px-Haarlinie.
- **Shadow Strategy:** Flach im Ruhezustand; interaktive Karten erhalten nur beim Hover `card-hover`.
- **Internal Padding:** Standardflächen und KPI-Karten verwenden 16px.

### KPI Cards
- **Geometry:** 16px Padding, 16px Radius, 1px Rand und kein Ruheschatten.
- **Alignment:** Label, Wert, Verlauf und Vergleich bleiben innerhalb derselben Inhaltsachse; das responsive Raster ändert Spalten, nicht den Kartenvertrag.

### Section Bars, Separators & Occupancy Controls
- **Section Bars:** Auf der Übersicht teilen Titel und eine kurze Aktion die Grundzeile und verwenden `--inset-line`. In einem Block bleibt die Titelzeile beim Namen, dem Zähler und höchstens zwei kurzen Blockaktionen. Die Steuerung steht in der Zeile darunter.
- **Section Separators:** Abschnitte der Übersicht trennt ausschließlich `border-top: 1px solid var(--border)` plus oberer Innenabstand. Keine zweite Karte, kein Schatten und kein dekorativer Divider.
- **Desktop / Tablet:** Zeitraum und Informationstiefe erscheinen ab 768px als zwei `JellyRadio`-Gruppen auf einer Zeile.
- **Phone:** Unter 768px ersetzen zwei `GlideSelect`s die Toggle-Pills.

### Inputs / Fields
- **Style:** Weißer oder transparenter Grund, 1px-Feldkante, 8px Radius, 14px operative Schrift.
- **Focus:** Einheitlicher 2px-Outline in `ring` mit 2px Offset. Komponenten dürfen keinen eigenen Fokusfarbton oder abweichende Stärke definieren.
- **Error / Disabled:** `aria-invalid` wechselt Rand auf `destructive` und verwendet die semitransparente Rolle `invalid-ring`; deaktivierte Felder und Aktionen verwenden Opazität 0.5.

### Navigation
- **Style:** Stabile Reihenfolge, 14px Beschriftung, 8px Radius und neutraler Ruhezustand.
- **State:** Hover verwendet `muted`; aktiv verwendet `sidebar-accent`, `primary` und Gewicht 600. Die Seitenleiste wird auf kompakten Breiten zur Icon-Leiste und auf Mobilgeräten zum Sheet.

### Dialogs, Menus & Sheets
- **Depth:** Menüs verwenden `floating`, Dialoge und Sheets `overlay`.
- **Motion:** Schnelle Zustände dauern 150ms, Standardwechsel 200ms und Overlay-Bewegungen 300ms. Alle verwenden `cubic-bezier(0.2, 0, 0, 1)`.
- **Reduced Motion:** Unter `prefers-reduced-motion: reduce` fallen Animationen und Übergänge auf 0.01ms; Hover-Lifts werden entfernt.

### App Cards
- **Signature:** Icon-Kachel, Titel und kurze operative Beschreibung bilden den wiederkehrenden Einstieg in eine Arbeitsfläche.
- **Behavior:** Weiß, 1px-Grenze, 16px Radius und Padding; Hover hebt um 4px an, färbt die Grenze mit `ring` und verwendet `card-hover`.
- **Local Palette:** Die sechs Icon-Kachelpaare Orange, Violett, Pink, Blau, Grün und Amber gehören nur zu dieser Signatur und tragen keine Statusbedeutung.

## Do's and Don'ts

### Do:
- **Do** neue visuelle Rollen zuerst in der passenden CSS-Token-Datei anlegen und danach hier spiegeln.
- **Do** operative Texte bei mindestens 14px halten und für Betonung ausschließlich Gewicht 600 verwenden.
- **Do** den einheitlichen 2px-Fokus mit 2px Offset, die Invalid-Ring-Rolle und Opazität 0.5 für Disabled verwenden.
- **Do** UI-Icons ausschließlich aus `lucide-react` mit Strichstärke 1.8 und passender Nachbargröße verwenden.
- **Do** Sortierung mit `ArrowUp` oder `ArrowDown`, `aria-hidden` am Icon und `aria-sort` an der Spalte ausdrücken.
- **Do** Aktionen als `JellyButton`, kompakte Auswahl als `JellyRadio` und Dropdowns als `GlideSelect` umsetzen.
- **Do** eine Fläche aus `components/ui/block.tsx` und `lib/ui/actions.ts` setzen.
- **Do** Übersichtsabschnitte nur mit der Haarlinien-Trennung und `--inset-line` gliedern.

### Don't:
- **Don't** rohe Farben, Schatten, Radien, Schriftgrößen, Gewichte oder Bewegungswerte neben dem Tokensystem etablieren.
- **Don't** Saalplan- oder Berichtskategoriefarben als globale UI-Rollen behandeln.
- **Don't** ein zweites Icon-Pack oder Unicode-Pfeile als Icons einsetzen; Diagramme, Favicon und Saalplan-Farbflächen bleiben davon ausgenommen.
- **Don't** Karten ohne funktionalen Grund ineinander verschachteln.
- **Don't** simulierte Kampagnen, Check-ins, Zahlungen oder vorbereitete Assistenzantworten als Live-Integration darstellen.
- **Don't** neue UI mit Legacy-`.button`-Klassen oder einem dritten Auswahlmuster neben `JellyRadio`/`GlideSelect` bauen.
- **Don't** Sektionen mit Schatten, zweiten Karten oder dekorativen Dividern trennen.
