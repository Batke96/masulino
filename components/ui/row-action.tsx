"use client"

import { forwardRef, useState, type ReactNode } from "react"

import { actionCatalog, actionIcon, type ActionId } from "@/lib/ui/actions"

import { JellyButton } from "./jelly-button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"

import "./row-action.css"

const iconProps = { size: 16, strokeWidth: 1.8, "aria-hidden": true as const }

function fuseBody(): ReactNode {
  const Undo = actionIcon("undo")
  return (
    <>
      <Undo {...iconProps} />
      <span>{actionCatalog.undo.label}</span>
    </>
  )
}

export const ActionButton = forwardRef<HTMLButtonElement, {
  action: ActionId
  onClick: () => void
  variant?: "dark" | "soft" | "icon"
  label?: string
  disabled?: boolean
  onFuseStart?: () => void
  onFuseCancel?: () => void
}>(function ActionButton({
  action,
  onClick,
  variant = "soft",
  label,
  disabled,
  onFuseStart,
  onFuseCancel,
}, ref) {
  const entry = actionCatalog[action]
  const Icon = actionIcon(action)
  const text = label ?? entry.label
  const fused = entry.undo === "fuse"
  const button = (
    <JellyButton
      ref={ref}
      variant={variant}
      tone={entry.tone}
      undo={entry.undo}
      disabled={disabled}
      aria-label={text}
      fuseName={`${actionCatalog.undo.label}, ${text}`}
      fuseContent={fuseBody()}
      onClick={fused ? undefined : onClick}
      onFuseStart={onFuseStart}
      onFuseCancel={onFuseCancel}
      onFuseCommit={fused ? onClick : undefined}
    >
      <Icon {...iconProps} />
      {variant === "icon" ? null : <span>{text}</span>}
    </JellyButton>
  )
  if (variant !== "icon") return button
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top" align="end" sideOffset={8}>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})

export function RowAction({
  action,
  rowName,
  pressed,
  onClick,
  disabled,
}: {
  action: ActionId
  rowName: string
  pressed?: boolean
  onClick: () => void
  disabled?: boolean
}) {
  const entry = actionCatalog[action]
  const Icon = actionIcon(action)
  const text = pressed && entry.pressedLabel ? entry.pressedLabel : entry.label
  const name = `${text} für ${rowName}`
  const fused = entry.undo === "fuse"
  const [undoing, setUndoing] = useState(false)
  const Undo = actionIcon("undo")
  const tip = undoing ? actionCatalog.undo.label : text
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <JellyButton
            className="row-action"
            variant="icon"
            tone={entry.tone}
            undo={entry.undo}
            pressed={pressed}
            disabled={disabled}
            aria-label={name}
            fuseName={`${actionCatalog.undo.label}, ${name}`}
            fuseContent={<Undo {...iconProps} />}
            onClick={fused ? undefined : onClick}
            onFuseStart={fused ? () => setUndoing(true) : undefined}
            onFuseCancel={fused ? () => setUndoing(false) : undefined}
            onFuseCommit={fused ? () => { setUndoing(false); onClick() } : undefined}
          >
            <Icon {...iconProps} />
          </JellyButton>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" sideOffset={8} className="text-right">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
