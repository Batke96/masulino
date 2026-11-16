export function PeriodCompare({
  title,
  note,
  items,
}: {
  title: string
  note?: string
  items: Array<{ label: string; value: string }>
}) {
  return (
    <section className="surface">
      <div className="section-head"><h2>{title}</h2></div>
      {note ? <p className="fine-print mb-4">{note}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <strong className="mt-1 block text-xl tabular-nums tracking-tight">{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
