"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import type { LucideIcon } from "lucide-react"

import "./pill-select.css"

export type PillSelectItem = {
  value: string
  label: string
}

export function PillSelect({
  label,
  icon: Icon,
  value,
  items,
  onChange,
  align = "start",
}: {
  label: string
  icon: LucideIcon
  value: string
  items: readonly PillSelectItem[]
  onChange: (value: string) => void
  align?: "start" | "end"
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const current = items.find((item) => item.value === value) ?? items[0]
  const currentIndex = Math.max(0, items.findIndex((item) => item.value === value))

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [open])

  function openMenu() {
    setHighlight(currentIndex)
    setOpen(true)
  }

  function choose(next: string) {
    onChange(next)
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        openMenu()
      }
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlight((index) => (index + 1) % items.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight((index) => (index - 1 + items.length) % items.length)
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      const item = items[highlight]
      if (item) choose(item.value)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className={open ? "pill-select is-open" : "pill-select"} ref={rootRef}>
      <button
        type="button"
        className="pill-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}, ${current?.label ?? ""}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        <span>{current?.label}</span>
      </button>
      {open ? (
        <div id={listId} role="listbox" aria-label={label} className={align === "end" ? "pill-select-menu is-end" : "pill-select-menu"}>
          {items.map((item, index) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === value}
              className={index === highlight ? "pill-select-option is-hot" : "pill-select-option"}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
