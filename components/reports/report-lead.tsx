import type { ReactNode } from "react"

export function ReportLead({
  alert,
  note,
}: {
  alert?: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="report-lead">
      <div className="section-head"><h2>Laufend</h2></div>
      {alert}
      {note ? <p className="fine-print">{note}</p> : null}
    </div>
  )
}
