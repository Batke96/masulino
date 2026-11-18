"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Info } from "lucide-react";
import { JellyButton } from "@/components/ui/jelly-button";
import { addDays } from "@/lib/booking/period";
import {
  buildTagesmappe,
  exampleTagesmappe,
  folderBookingFromView,
  folderFileName,
  folderFootnote,
  folderMeta,
  formatGeneratedAt,
  type Tagesmappe,
} from "@/lib/tagesmappe/folder";
import { renderTagesmappePdf } from "@/lib/tagesmappe/pdf";
import { fetchSectionBookings } from "@/lib/workspace/client";

import "./tagesmappe.css";

export function TagesmappeApp({ live, anchorDate }: { live: boolean; anchorDate: string | null }) {
  const picked = useRef(false);
  const [date, setDate] = useState<string | null>(anchorDate);
  const [folder, setFolder] = useState<Tagesmappe | null>(live ? null : exampleTagesmappe());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!live || picked.current || !anchorDate) return;
    setDate(anchorDate);
  }, [live, anchorDate]);

  useEffect(() => {
    if (!live) {
      setFailed(false);
      setFolder(exampleTagesmappe());
      return;
    }
    if (!date) return;
    let cancelled = false;
    setFolder(null);
    setFailed(false);
    void (async () => {
      const rows = await fetchSectionBookings("bookings", date);
      if (cancelled) return;
      if (!rows) {
        setFailed(true);
        return;
      }
      setFolder(
        buildTagesmappe({
          dateIso: date,
          source: "live",
          bookings: rows.map((row) =>
            folderBookingFromView({
              id: row.id,
              reference: row.reference,
              name: row.name,
              time: row.time,
              type: row.type,
              packageName: row.packageName,
              childrenCount: row.childrenCount,
              adultCount: row.adultCount,
              tables: row.tables,
              status: row.status,
            }),
          ),
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [live, date, attempt]);

  function step(days: number) {
    if (!date) return;
    picked.current = true;
    setDate(addDays(date, days));
  }

  function download() {
    if (!folder) return;
    const bytes = renderTagesmappePdf(folder, formatGeneratedAt(new Date()));
    const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = folderFileName(folder);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const loading = live && !failed && !folder;

  return (
    <div className="tagesmappe">
      <div className="section-head">
        <div className="tagesmappe-title">
          <h2>{folder?.dateLabel ?? "Tagesmappe"}</h2>
          {folder ? <p className="tagesmappe-meta">{folderMeta(folder)}</p> : null}
        </div>
        <div className="tagesmappe-tools">
          {live ? (
            <>
              <JellyButton variant="icon" aria-label="Vorheriger Tag" onClick={() => step(-1)} disabled={!date}>
                <ChevronLeft size={18} strokeWidth={1.8} />
              </JellyButton>
              <JellyButton variant="icon" aria-label="Nächster Tag" onClick={() => step(1)} disabled={!date}>
                <ChevronRight size={18} strokeWidth={1.8} />
              </JellyButton>
            </>
          ) : null}
          <JellyButton className="tagesmappe-download" onClick={download} disabled={!folder}>
            <Download size={16} strokeWidth={1.8} />
            PDF herunterladen
          </JellyButton>
        </div>
      </div>

      {loading ? (
        <section className="surface" aria-live="polite">
          <p className="tagesmappe-status">Die Buchungen werden geladen.</p>
        </section>
      ) : null}

      {failed ? (
        <div className="callout amber" role="alert">
          <Info size={22} strokeWidth={1.8} />
          <div>
            <strong>Buchungen nicht geladen</strong>
            <p>Die Tagesmappe kann gerade nicht aus den Buchungen erstellt werden.</p>
            <JellyButton className="tagesmappe-retry" variant="soft" onClick={() => setAttempt((value) => value + 1)}>
              Erneut laden
            </JellyButton>
          </div>
        </div>
      ) : null}

      {folder ? (
        <>
          <div className="tagesmappe-pages">
            {folder.pages.map((page, index) => (
              <article className="surface tagesmappe-page" key={`${page.kind}-${index}`} aria-label={page.title}>
                <header className="tagesmappe-page-head">
                  <h3>{page.title}</h3>
                  {page.kind === "party" ? <span className="tagesmappe-ref">{page.reference}</span> : null}
                </header>
                {page.kind === "overview" ? (
                  page.emptyLabel ? (
                    <p className="tagesmappe-empty">{page.emptyLabel}</p>
                  ) : (
                    <ul className="tagesmappe-rows">
                      {page.rows.map((row, rowIndex) => (
                        <li key={`${row.time}-${row.name}-${rowIndex}`}>
                          <span>
                            {row.time} · {row.name}
                          </span>
                          <span>{row.counts}</span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <div className="tagesmappe-party">
                    <p>{page.when}</p>
                    <p>{page.party}</p>
                    {page.coupons ? <p>{page.coupons}</p> : null}
                    <p className="tagesmappe-note">{page.note}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
          <p className="fine-print">{folderFootnote(folder.source)}</p>
        </>
      ) : null}
    </div>
  );
}
