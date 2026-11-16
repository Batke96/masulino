"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
} from "recharts"

import { cn } from "@/lib/utils"

export interface SparklineProps extends React.ComponentProps<"div"> {
  /** Series to plot, oldest first. */
  data: number[]
  variant?: "area" | "line"
  /** Area fill. The dot grid needs a recharts shape this version does not export, so both fills use the gradient. */
  fill?: "gradient" | "dots"
  /** Any CSS color. Defaults to the theme primary. */
  color?: string
  curve?: "monotone" | "linear" | "step"
  strokeWidth?: number
  /** Animate after hydration and when data changes. Respects reduced motion. */
  animate?: boolean
  animationDuration?: number
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)"

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getReducedMotionSnapshot() {
  return window.matchMedia(reducedMotionQuery).matches
}

function getReducedMotionServerSnapshot() {
  return true
}

function Sparkline({
  data,
  variant = "area",
  fill = "gradient",
  color = "var(--primary)",
  curve = "monotone",
  strokeWidth = 1.5,
  animate = true,
  animationDuration = 500,
  className,
  ...props
}: SparklineProps) {
  const id = React.useId()
  const reducedMotion = React.useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  )
  const animationActive = animate && !reducedMotion
  const points = React.useMemo(() => data.map((y, i) => ({ i, y })), [data])
  const margin = { top: 2, right: 0, bottom: 0, left: 0 }
  const fillOpacity = fill === "dots" ? 0.45 : 0.3

  return (
    <div
      data-slot="sparkline"
      aria-hidden="true"
      className={cn("h-10 w-full", className)}
      {...props}
    >
      <ResponsiveContainer width="100%" height="100%">
        {variant === "line" ? (
          <LineChart data={points} margin={margin}>
            <Line
              type={curve}
              dataKey="y"
              stroke={color}
              strokeWidth={strokeWidth}
              dot={false}
              isAnimationActive={animationActive}
              animationDuration={animationDuration}
              animationEasing="ease-out"
            />
          </LineChart>
        ) : (
          <AreaChart data={points} margin={margin}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type={curve}
              dataKey="y"
              stroke={color}
              strokeWidth={strokeWidth}
              fill={`url(#${id})`}
              dot={false}
              isAnimationActive={animationActive}
              animationDuration={animationDuration}
              animationEasing="ease-out"
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export { Sparkline }
