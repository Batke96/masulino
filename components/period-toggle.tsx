"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bookingPeriods, type BookingPeriod } from "@/lib/booking/period";

export function PeriodToggle({
  value,
  onChange,
  label = "Zeitraum",
}: {
  value: BookingPeriod;
  onChange: (period: BookingPeriod) => void;
  label?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const period = bookingPeriods.find((item) => item.id === next);
        if (period) onChange(period.id);
      }}
    >
      <SelectTrigger aria-label={label} size="sm" className="period-choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" position="popper">
        {bookingPeriods.map((item) => (
          <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
