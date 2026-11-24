"use client"

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react"

import { cn } from "@/lib/utils"

import "./jelly-button.css"

type JellyButtonProps = Omit<HTMLMotionProps<"button">, "onClick" | "children"> & {
  variant?: "dark" | "soft" | "icon"
  tone?: "neutral" | "present" | "danger"
  undo?: "fuse"
  pressed?: boolean
  fuseContent?: ReactNode
  fuseName?: string
  children?: ReactNode
  onClick?: HTMLMotionProps<"button">["onClick"]
  onFuseStart?: () => void
  onFuseCommit?: () => void
  onFuseCancel?: () => void
}

const pressSpring = {
  type: "spring" as const,
  stiffness: 580,
  damping: 2 * Math.sqrt(580 * 0.9) * (1 - 0.25),
  mass: 0.9,
}

function undoWindow(): number {
  if (typeof document === "undefined") return 4000
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--undo-window").trim()
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return 4000
  return raw.endsWith("ms") ? value : value * 1000
}

export const JellyButton = forwardRef<HTMLButtonElement, JellyButtonProps>(function JellyButton({
  className,
  variant = "dark",
  tone = "neutral",
  undo,
  pressed,
  fuseContent,
  fuseName,
  onClick,
  onFuseStart,
  onFuseCommit,
  onFuseCancel,
  children,
  ...props
}: JellyButtonProps, ref) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<"idle" | "undo">("idle")
  const [paused, setPaused] = useState(false)
  const fusing = useRef(false)
  const pointer = useRef(false)
  const keyboard = useRef(false)
  const pausedRef = useRef(false)
  const remaining = useRef(0)
  const endsAt = useRef(0)
  const timer = useRef<number | null>(null)
  const commitRef = useRef(onFuseCommit)
  const cancelRef = useRef(onFuseCancel)
  const startRef = useRef(onFuseStart)
  commitRef.current = onFuseCommit
  cancelRef.current = onFuseCancel
  startRef.current = onFuseStart

  function stopTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  function arm(ms: number) {
    stopTimer()
    remaining.current = ms
    endsAt.current = performance.now() + ms
    timer.current = window.setTimeout(() => {
      timer.current = null
      fusing.current = false
      pausedRef.current = false
      setPaused(false)
      setPhase("idle")
      commitRef.current?.()
    }, ms)
  }

  function syncPause() {
    if (!fusing.current) return
    const shouldPause = pointer.current || keyboard.current
    if (shouldPause && !pausedRef.current) {
      stopTimer()
      remaining.current = Math.max(0, endsAt.current - performance.now())
      pausedRef.current = true
      setPaused(true)
      return
    }
    if (!shouldPause && pausedRef.current) {
      pausedRef.current = false
      setPaused(false)
      arm(remaining.current)
    }
  }

  function begin(node: HTMLButtonElement) {
    fusing.current = true
    pointer.current = node.matches(":hover")
    keyboard.current = node.matches(":focus-visible")
    const ms = undoWindow()
    remaining.current = ms
    setPhase("undo")
    startRef.current?.()
    if (pointer.current || keyboard.current) {
      pausedRef.current = true
      setPaused(true)
      endsAt.current = performance.now()
      return
    }
    pausedRef.current = false
    setPaused(false)
    arm(ms)
  }

  function cancelFuse() {
    stopTimer()
    fusing.current = false
    pausedRef.current = false
    setPaused(false)
    setPhase("idle")
    cancelRef.current?.()
  }

  useEffect(() => () => {
    fusing.current = false
    stopTimer()
  }, [])

  const showFuse = undo === "fuse" && phase === "undo"
  const label = showFuse && fuseName ? fuseName : props["aria-label"]

  return (
    <motion.button
      type="button"
      data-slot="jelly-button"
      data-variant={variant}
      data-tone={tone}
      data-phase={showFuse ? "undo" : "idle"}
      data-fuse-paused={showFuse && paused ? "true" : "false"}
      aria-pressed={typeof pressed === "boolean" ? pressed : undefined}
      className={cn("jelly-button", className)}
      whileTap={reduce ? undefined : { scaleX: 1.06, scaleY: 0.92 }}
      transition={pressSpring}
      {...props}
      ref={ref}
      aria-label={label}
      onPointerEnter={(event) => {
        pointer.current = true
        syncPause()
        props.onPointerEnter?.(event)
      }}
      onPointerLeave={(event) => {
        pointer.current = false
        syncPause()
        props.onPointerLeave?.(event)
      }}
      onFocus={(event) => {
        const node = event.currentTarget
        requestAnimationFrame(() => {
          keyboard.current = node.isConnected && node.matches(":focus-visible")
          syncPause()
        })
        props.onFocus?.(event)
      }}
      onBlur={(event) => {
        keyboard.current = false
        syncPause()
        props.onBlur?.(event)
      }}
      onClick={(event) => {
        if (undo === "fuse") {
          if (fusing.current) {
            cancelFuse()
            return
          }
          begin(event.currentTarget)
          return
        }
        onClick?.(event)
      }}
    >
      <span className="jelly-button-label">
        {showFuse && fuseContent ? fuseContent : children}
      </span>
    </motion.button>
  )
})
