"use client"

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react"

import { cn } from "@/lib/utils"

import "./jelly-button.css"

type JellyButtonProps = HTMLMotionProps<"button"> & {
  variant?: "dark" | "soft" | "icon"
}

const pressSpring = {
  type: "spring" as const,
  stiffness: 580,
  damping: 2 * Math.sqrt(580 * 0.9) * (1 - 0.25),
  mass: 0.9,
}

export function JellyButton({
  className,
  variant = "dark",
  children,
  ...props
}: JellyButtonProps) {
  const reduce = useReducedMotion()

  return (
    <motion.button
      type="button"
      data-slot="jelly-button"
      data-variant={variant}
      className={cn("jelly-button", className)}
      whileTap={reduce ? undefined : { scaleX: 1.06, scaleY: 0.92 }}
      transition={pressSpring}
      {...props}
    >
      {children}
    </motion.button>
  )
}
