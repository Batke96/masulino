"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { type NumberFormat } from "@/lib/format"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DeltaBadge, getDeltaDirection } from "@/components/ui/delta-badge"
import { Sparkline } from "@/components/ui/sparkline"
import { MetricValue } from "@/components/ui/metric-value"

export interface KpiCardProps extends Omit<
  React.ComponentProps<typeof Card>,
  "children"
> {
  /** Metric name, e.g. "Revenue". */
  label: string
  /** Current value. Numbers are formatted with `format`; strings render as-is. */
  value: number | string
  /** Fractional change vs. the previous period, e.g. 0.124 for +12.4%. */
  delta?: number
  /** Context for the delta, e.g. "vs. last 30 days". */
  deltaLabel?: string
  /** Series for the sparkline. Rendered when it has two or more points. */
  trend?: number[]
  format?: NumberFormat
  /** ISO 4217 code, used when `format` is "currency". */
  currency?: string
  /** Treat a decrease as good and an increase as bad (churn, latency, errors). */
  invertDelta?: boolean
  /** Optional icon shown before the label. */
  icon?: React.ReactNode
  children?: React.ReactNode
}

function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  trend,
  format = "number",
  currency,
  invertDelta = false,
  icon,
  className,
  children,
  ...props
}: KpiCardProps) {
  const direction = getDeltaDirection(delta)
  const isPositive =
    direction === "flat" ? null : (direction === "up") !== invertDelta
  const trendColor =
    isPositive === true
      ? "#33775a"
      : isPositive === false
        ? "#a33b32"
        : "var(--primary)"

  return (
    <Card
      data-slot="kpi-card"
      data-direction={direction}
      className={cn("gap-4 py-5", className)}
      {...props}
    >
      <CardHeader className="px-5">
        <CardDescription className="flex items-center gap-1.5 [&>svg]:size-4">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums tracking-tight">
          <MetricValue value={value} format={format} currency={currency} />
        </CardTitle>
        {delta !== undefined ? (
          <CardAction>
            <DeltaBadge delta={delta} invert={invertDelta} />
          </CardAction>
        ) : null}
      </CardHeader>
      {trend && trend.length > 1 ? (
        <CardContent className="px-5">
          <Sparkline data={trend} color={trendColor} />
        </CardContent>
      ) : null}
      {deltaLabel ? (
        <CardContent className="text-muted-foreground px-5 text-xs">
          <span>{deltaLabel}</span>
        </CardContent>
      ) : null}
      {children ? <CardContent className="px-5">{children}</CardContent> : null}
    </Card>
  )
}

export { KpiCard }
