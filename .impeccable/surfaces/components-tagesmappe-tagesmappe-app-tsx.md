---
version: 1
slug: "components-tagesmappe-tagesmappe-app-tsx"
primary_target: "components/tagesmappe/tagesmappe-app.tsx"
related_targets: []
---

# Tagesmappe

Mode: Operate

Reception prints the day's folder before service. The screen is the binder: one overview, then one sheet per booking. The PDF is the same binder with ruled lines for handwriting.

Audience: staff who may see bookings, at the counter or in the back office.
Job: read the day's parties and download the folder.
Content: the day's bookings. When the workplace is not live, the labelled example parties from the co-founder's mock.
Constraints: Masulino Operate, German, JellyButton, no send and no payment. Cancelled bookings stay out.

## Direction contract

THESIS: The folder is the page. Sheets are read in order, instead of a dashboard of metrics about the day.
OWN-WORLD: Masulino Operate. White sheets, hairline borders, 16px radius, ink for the download, Inter, the coral mark already in the shell.
STORY: The person sees the date, how many pages the folder has, and every sheet, then downloads that folder as a PDF with space to write adjustments, coupon hand-out and the bill.
FIRST VIEWPORT: The date is the heading. The page count sits with it. PDF herunterladen is the dark action on the right. Day steps appear only when bookings are live. Under that, Seite 1 lists time, name and K/E. Each following sheet shows the reference, the window, the table, the party line, Deluxe coupons, and the handwriting note.
FORM: seed: none (pinned). Quoted pin: "implement it while following the design guidelines of this application" and "Already include the possibility to download the mappe as a pdf", on the mock "Tagesmappe – 29.10.2026" with Familie Müller B-1024, Familie Schmidt B-1025, Familie Weber B-1026, "14:30–19:00", Deluxe coupons, and "Platz für handschriftliche Anpassungen, Coupon-Ausgabe und Abrechnung."
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
