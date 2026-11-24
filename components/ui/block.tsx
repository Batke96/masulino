import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import "./block.css"

export function Block({
  title,
  count,
  actions,
  controls,
  legend,
  note,
  columns = 1,
  className,
  windowClassName,
  children,
}: {
  title?: string
  count?: number
  actions?: ReactNode
  controls?: ReactNode
  legend?: ReactNode
  note?: ReactNode
  columns?: 1 | 2
  className?: string
  windowClassName?: string
  children: ReactNode
}) {
  const headerActions = !controls && actions ? actions : null
  return (
    <section className={cn("work-block", className)}>
      {title || headerActions ? (
        <header className="work-block-title">
          {title ? (
            <div className="work-block-heading">
              <h2>{title}</h2>
              {typeof count === "number" ? <span className="pill">{count.toLocaleString("de-DE")}</span> : null}
            </div>
          ) : null}
          {headerActions ? <div className="work-block-actions">{headerActions}</div> : null}
        </header>
      ) : null}
      {controls ? (
        <div className="work-block-controls">
          <div className="work-block-filters">{controls}</div>
          {actions ? <div className="work-block-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("surface work-block-window", windowClassName)}>
        {legend ? <div className="work-block-legend">{legend}</div> : null}
        <div className={cn("work-block-body", columns === 2 && "work-block-split")}>{children}</div>
      </div>
      {note ? <p className="work-block-note">{note}</p> : null}
    </section>
  )
}
