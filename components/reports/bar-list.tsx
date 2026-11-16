import { percent } from "@/lib/reports/format"

export function BarList({
  items,
  label,
  onSelect,
  selected,
}: {
  items: Array<{ id: string; label: string; valueLabel: string; note?: string; share: number }>
  label: string
  selected?: string | null
  onSelect?: (id: string) => void
}) {
  const ordered = [...items].sort((a, b) => b.share - a.share || a.label.localeCompare(b.label, "de"))
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={`${label}, nach Umsatz absteigend`}>
      {ordered.map((item) => {
        const active = selected === item.id
        const width = item.share <= 0 ? 0 : Math.min(100, Math.max(item.share * 100, 1.5))
        const row = (
          <>
            <span className="relative block h-8 min-w-0 flex-1 overflow-hidden rounded-md bg-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-md bg-primary/25"
                style={{ width: `${width}%` }}
              />
              <span className="relative flex h-full min-w-0 items-center gap-2 px-3 text-sm">
                <strong className="shrink-0 tabular-nums font-[650]">{percent(item.share)}</strong>
                <span className="min-w-0 flex-1 truncate text-right">{item.label}</span>
              </span>
            </span>
            <span className="w-40 shrink-0 whitespace-nowrap text-right text-sm tabular-nums leading-tight">
              {item.valueLabel}
              {item.note ? <span className="block text-xs text-muted-foreground">{item.note}</span> : null}
            </span>
          </>
        )
        if (!onSelect) {
          return (
            <li key={item.id} className="flex w-full items-center gap-3">
              {row}
            </li>
          )
        }
        return (
          <li key={item.id}>
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-md text-left ${active ? "ring-2 ring-primary" : ""}`}
              aria-pressed={active}
              onClick={() => onSelect(item.id)}
            >
              {row}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
