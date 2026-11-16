"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDayLabel } from "@/lib/booking/period";
import { windowLabel, windowsFor, type BookingKind } from "@/lib/booking/slots";
import {
  placeBookings,
  roomColumns,
  seatTone,
  tableIndex,
  tableSeats,
  type FloorBooking,
} from "@/lib/booking/tables";

const kinds: Array<{ id: BookingKind; label: string }> = [
  { id: "group", label: "Gruppen" },
  { id: "birthday", label: "Geburtstage" },
];

const segmented = "bg-background *:data-[slot=toggle-group-item]:bg-background *:data-[slot=toggle-group-item]:px-3";

export function TableFloor({
  dates,
  defaultDay,
  bookings,
}: {
  dates: string[];
  defaultDay: string;
  bookings: Array<FloorBooking & { date: string }>;
}) {
  const [day, setDay] = useState(defaultDay);
  const [kind, setKind] = useState<BookingKind>("birthday");
  const [windowStart, setWindowStart] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const datesKey = dates.join("|");

  useEffect(() => {
    setDay(defaultDay);
  }, [defaultDay, datesKey]);

  if (dates.length === 0) return null;
  const index = Math.max(0, dates.indexOf(day));
  const current = dates[index] ?? dates[0]!;
  const windows = windowsFor(current, kind);
  const active = windows.find((item) => item.start === windowStart) ?? windows[0] ?? null;
  const dayBookings = bookings.filter((booking) => booking.date === current);
  const placed = active
    ? placeBookings(dayBookings, kind, active)
    : { byTable: new Map<number, FloorBooking[]>(), unmatched: [] };
  const unknown = placed.unmatched.flatMap((booking) =>
    booking.tables
      .filter((name) => tableIndex(name) === null)
      .map((name) => `${booking.name}: ${name}`),
  );
  const selectedSeat = tableSeats.find((seat) => seat.id === selectedId) ?? null;
  const selectedBookings = selectedSeat ? placed.byTable.get(selectedSeat.id) ?? [] : [];
  const selectedTone = seatTone(selectedBookings);

  return (
    <div className="list-block floor-block">
    <div className="section-head">
      <h2>Tischauslastung</h2>
      <div className="floor-day">
          {dates.length > 1 && (
            <button
              type="button"
              className="icon-button"
              aria-label="Vorheriger Tag"
              disabled={index === 0}
              onClick={() => setDay(dates[index - 1]!)}
            >
              <ChevronLeft size={18} strokeWidth={1.8} />
            </button>
          )}
          <strong>{formatDayLabel(current)}</strong>
          {dates.length > 1 && (
            <button
              type="button"
              className="icon-button"
              aria-label="Nächster Tag"
              disabled={index >= dates.length - 1}
              onClick={() => setDay(dates[index + 1]!)}
            >
              <ChevronRight size={18} strokeWidth={1.8} />
            </button>
          )}
      </div>
    </div>
    <section className="surface floor-section" aria-label="Tischauslastung">
      <div className="floor-band">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={kind}
          aria-label="Art"
          className={segmented}
          onValueChange={(value) => {
            const next = kinds.find((item) => item.id === value);
            if (!next) return;
            setKind(next.id);
            setWindowStart(null);
          }}
        >
          {kinds.map((item) => (
            <ToggleGroupItem key={item.id} value={item.id}>{item.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        {windows.length === 0 ? (
          <p className="floor-note">An diesem Tag gibt es kein Gruppenfenster.</p>
        ) : (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={active?.start ?? ""}
            aria-label="Zeitfenster"
            className={segmented}
            onValueChange={(value) => {
              if (windows.some((item) => item.start === value)) setWindowStart(value);
            }}
          >
            {windows.map((item) => (
              <ToggleGroupItem key={item.start} value={item.start}>{windowLabel(item)}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
      <div className="floor-stage">
        <div className="floor-plan" role="group" aria-label={`Saalplan am ${formatDayLabel(current)}`}>
          <div className="room-wall" aria-hidden="true" />
          <div className="room-elbow" aria-hidden="true" />
          <div className="room-lintel t5" aria-hidden="true" />
          <div className="room-lintel t6" aria-hidden="true" />
          <div className="room-lintel t7" aria-hidden="true" />
          <div className="room-slab" aria-hidden="true" />
          <div className="room-aquarium" aria-hidden="true"><span>Aquarium</span></div>
          {roomColumns.map((column) => (
            <span
              key={`${column.x}-${column.y}`}
              className="room-column"
              style={{ left: `${column.x}%`, top: `${column.y}%` }}
              role="img"
              aria-label={column.label}
            />
          ))}
          {tableSeats.map((seat) => {
            const occupants = placed.byTable.get(seat.id) ?? [];
            const tone = seatTone(occupants);
            const names = occupants.map((booking) => booking.name).join(", ");
            const state = tone === "free" ? "frei" : tone === "reserved" ? "reserviert" : "gebucht";
            const selected = selectedId === seat.id;
            return (
              <button
                key={seat.id}
                type="button"
                className={`table-tile ${tone}${selected ? " selected" : ""}`}
                style={{ left: `${seat.x}%`, top: `${seat.y}%`, width: `${seat.w}%`, height: `${seat.h}%` }}
                aria-pressed={selected}
                aria-controls="floor-booking"
                onClick={() => setSelectedId(selected ? null : seat.id)}
              >
                <strong>T{seat.id}</strong>
                <span>{seat.seats}</span>
                <span className="sr-only">{`${state}${names ? `, ${names}` : ""}`}</span>
              </button>
            );
          })}
        </div>
        <div className="floor-detail" id="floor-booking" aria-live="polite">
          <div className="floor-legend">
            <span className="floor-swatch free">Frei</span>
            <span className="floor-swatch reserved">Reserviert</span>
            <span className="floor-swatch booked">Gebucht</span>
          </div>
          {selectedSeat ? (
            <>
              <h3>T{selectedSeat.id}</h3>
              <p>{selectedSeat.seats} Plätze · {selectedTone === "free" ? "Frei" : selectedTone === "reserved" ? "Reserviert" : "Gebucht"}</p>
              {selectedBookings.length === 0 ? (
                <p>In diesem Fenster ist der Tisch nicht vergeben.</p>
              ) : selectedBookings.map((booking) => (
                <article key={booking.id}>
                  <strong>{booking.name}</strong>
                  <span>{booking.time} Uhr · {booking.type}</span>
                  {booking.detail && <span>{booking.detail}</span>}
                </article>
              ))}
            </>
          ) : (
            <p>Tisch antippen, um die Buchung in diesem Fenster zu sehen.</p>
          )}
        </div>
      </div>
      {unknown.length > 0 && (
        <p className="fine-print">Ohne Platz im Plan: {unknown.join(" · ")}</p>
      )}
    </section>
    </div>
  );
}
