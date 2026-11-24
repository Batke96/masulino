"use client"

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

import "./glide-select.css"

type GlideOption =
  | string
  | {
      value: string
      label: ReactNode
      tag?: string
    }

type NormalizedOption = {
  value: string
  label: ReactNode
  tag?: string
}

const SIZES = {
  sm: { chip: 28, row: 26, font: 12 },
  md: { chip: 36, row: 32, font: 13 },
  lg: { chip: 44, row: 40, font: 14 },
} as const

const PAD = 4
const GAP = 1
const MENU_GAP = 6
const DEFAULT_OPTIONS = ["One", "Two", "Three"]

const norm = (option: GlideOption): NormalizedOption =>
  typeof option === "string" ? { value: option, label: option } : option

const textOf = (item: NormalizedOption) =>
  typeof item.label === "string" ? item.label : item.value

const typeaheadIndex = (items: NormalizedOption[], from: number, ch: string) => {
  const c = ch.toLowerCase()
  const n = items.length
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n
    if (textOf(items[i]).toLowerCase().startsWith(c)) return i
  }
  return from
}

export type GlideSelectProps = {
  options?: GlideOption[]
  value?: string
  defaultValue?: string
  onChange?: (value: string, option: NormalizedOption) => void
  placeholder?: string
  showTags?: boolean
  accentColor?: string
  surfaceColor?: string
  highlightColor?: string
  textColor?: string
  size?: keyof typeof SIZES
  /** Closed trigger matches the dark JellyButton. The menu keeps the same radius. */
  variant?: "field" | "button"
  radius?: number
  menuWidth?: number
  placement?: "top" | "bottom"
  align?: "left" | "right"
  popDuration?: number
  glideDuration?: number
  rememberPosition?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

const TRIGGER_CHROME = 10 + 8 + 6 + 14
const MENU_CHROME = 4 * 2 + 10 + 8 + 8 + 14

export function GlideSelect({
  options = DEFAULT_OPTIONS,
  value,
  defaultValue,
  onChange,
  placeholder = "Auswählen…",
  showTags = true,
  accentColor = "var(--ink)",
  surfaceColor = "var(--background)",
  highlightColor = "var(--muted)",
  textColor = "var(--text)",
  size = "md",
  variant = "field",
  radius = 14,
  menuWidth,
  placement = "bottom",
  align = "left",
  popDuration = 180,
  glideDuration = 220,
  rememberPosition = true,
  disabled = false,
  ariaLabel = "Auswahl",
  className = "",
}: GlideSelectProps) {
  const items = options.map(norm)
  const [inner, setInner] = useState(defaultValue ?? "")
  const current = value ?? inner
  const selected = items.findIndex((it) => it.value === current)
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed")
  const [active, setActive] = useState<number | null>(null)
  const [side, setSide] = useState(placement)
  const [menuSpace, setMenuSpace] = useState(0)
  const [fitWidth, setFitWidth] = useState<number | undefined>(menuWidth)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const instant = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scrub = useRef<{ id: number; top: number } | null>(null)
  const id = useId()
  const S = SIZES[size] ?? SIZES.md
  const button = variant === "button"
  const shape = button ? 18 : radius
  const fontSize = button ? 14 : S.font
  const triggerChrome = button ? 16 + 16 + 8 + 16 : TRIGGER_CHROME
  const step = S.row + GAP
  const popOut = Math.round((popDuration * 2) / 3)
  const itemsKey = items.map((it) => `${it.value}:${textOf(it)}:${it.tag ?? ""}`).join("|")

  useLayoutEffect(() => {
    if (typeof menuWidth === "number") {
      setFitWidth(menuWidth)
      return
    }
    const probe = document.createElement("span")
    probe.style.cssText = [
      "position:absolute",
      "visibility:hidden",
      "white-space:nowrap",
      `font-size:${fontSize}px`,
      `font-weight:${button ? 600 : 500}`,
      "font-family:inherit",
      "pointer-events:none",
    ].join(";")
    document.body.appendChild(probe)
    let maxLabel = 0
    for (const item of items) {
      probe.textContent = textOf(item)
      maxLabel = Math.max(maxLabel, probe.offsetWidth)
      if (showTags && item.tag) {
        probe.textContent = `${textOf(item)}  ${item.tag}`
        maxLabel = Math.max(maxLabel, probe.offsetWidth + 24)
      }
    }
    probe.textContent = placeholder
    maxLabel = Math.max(maxLabel, probe.offsetWidth)
    document.body.removeChild(probe)
    setFitWidth(Math.ceil(Math.max(maxLabel + triggerChrome, maxLabel + MENU_CHROME)))
  }, [button, fontSize, itemsKey, menuWidth, placeholder, showTags, items, triggerChrome])

  useLayoutEffect(() => {
    const el = menuRef.current
    const root = rootRef.current
    if (phase !== "open" || !el || !root) {
      setMenuSpace(0)
      return
    }
    const r = root.getBoundingClientRect()
    const need = el.offsetHeight + MENU_GAP
    const nextSide =
      placement === "bottom" && r.bottom + need > window.innerHeight
        ? "top"
        : placement === "top" && r.top - need < 0
          ? "bottom"
          : placement
    setSide(nextSide)
    setMenuSpace(nextSide === "bottom" ? need : 0)
    el.style.transitionDuration = instant.current ? "0ms" : ""
    el.dataset.state = "closed"
    void el.offsetHeight
    el.dataset.state = "open"
    const p = pillRef.current
    if (p) {
      p.style.transition = "none"
      p.style.transform = `translateY(${Math.max(0, selected) * step}px)`
      p.style.opacity = "0"
      void p.offsetHeight
      p.style.transition = ""
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useLayoutEffect(() => {
    const p = pillRef.current
    if (!p || phase !== "open") return
    if (active === null) {
      p.style.opacity = "0"
      return
    }
    const jump = instant.current || p.style.opacity !== "1"
    p.style.transitionDuration = jump ? "0ms, 150ms" : ""
    p.style.transform = `translateY(${active * step}px)`
    p.style.opacity = "1"
    instant.current = false
  }, [active, phase, step])

  const open = (viaKey: boolean) => {
    if (disabled) return
    clearTimeout(closeTimer.current)
    instant.current = true
    setActive(selected >= 0 ? selected : viaKey ? 0 : null)
    setPhase("open")
  }

  const close = (mode: "instant" | "pop") => {
    setActive(null)
    clearTimeout(closeTimer.current)
    const el = menuRef.current
    if (mode === "instant" || !el) {
      setPhase("closed")
      return
    }
    el.style.transitionDuration = ""
    el.dataset.state = "closed"
    setPhase("closing")
    closeTimer.current = setTimeout(() => setPhase("closed"), popOut + 20)
  }

  const pick = (i: number, viaKey: boolean) => {
    const it = items[i]
    if (!it) {
      close("instant")
      return
    }
    if (it.value !== current) {
      if (value === undefined) setInner(it.value)
      onChange?.(it.value, it)
      if (!viaKey && rootRef.current) rootRef.current.dataset.swap = ""
    }
    close("instant")
    triggerRef.current?.focus({ preventScroll: true })
  }

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key
    const n = items.length
    const cur = active ?? Math.max(0, selected)
    if (phase !== "open") {
      if (k === "Enter" || k === " " || k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault()
        open(true)
      }
      return
    }
    const go = (i: number) => {
      e.preventDefault()
      instant.current = true
      setActive(Math.min(n - 1, Math.max(0, i)))
    }
    if (k === "ArrowDown" || k === "ArrowUp") {
      go(active === null ? cur : cur + (k === "ArrowDown" ? 1 : -1))
    } else if (k === "Home" || k === "End") {
      go(k === "Home" ? 0 : n - 1)
    } else if (k === "Enter" || k === " ") {
      e.preventDefault()
      pick(cur, true)
    } else if (k === "Escape" || k === "Tab") {
      if (k === "Escape") e.preventDefault()
      close("instant")
    } else if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      go(typeaheadIndex(items, cur, k))
    }
  }

  useEffect(() => {
    if (phase === "closed") return undefined
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close("pop")
    }
    document.addEventListener("pointerdown", onDown, true)
    return () => document.removeEventListener("pointerdown", onDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  useEffect(() => {
    if (disabled && phase !== "closed") close("instant")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const rowAt = (y: number) => {
    const s = scrub.current
    if (!s) return null
    const i = Math.floor((y - s.top - PAD) / step)
    return i >= 0 && i < items.length ? i : null
  }

  const onListDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (scrub.current) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    scrub.current = { id: e.pointerId, top: e.currentTarget.getBoundingClientRect().top }
    instant.current = true
    setActive(rowAt(e.clientY))
  }

  const onListMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrub.current || scrub.current.id !== e.pointerId) return
    const i = rowAt(e.clientY)
    if (i !== active) setActive(i)
  }

  const onListUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrub.current || scrub.current.id !== e.pointerId) return
    const i = e.type === "pointerup" ? rowAt(e.clientY) : null
    scrub.current = null
    if (i !== null) pick(i, false)
    else if (!rememberPosition) setActive(null)
  }

  const onListOver = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || scrub.current) return
    const row = (e.target as HTMLElement).closest("[data-index]")
    if (!row) return
    const i = Number((row as HTMLElement).dataset.index)
    if (i !== active) setActive(i)
  }

  const origin = `${side === "bottom" ? "top" : "bottom"} ${align}`

  return (
    <div
      ref={rootRef}
      data-slot="glide-select"
      className={cn("glide-select", className)}
      data-size={size}
      data-variant={variant}
      data-disabled={disabled ? "" : undefined}
      style={
        {
          width: fitWidth ? `${fitWidth}px` : undefined,
          "--gs-accent": accentColor,
          "--gs-surface": surfaceColor,
          "--gs-highlight": highlightColor,
          "--gs-text": textColor,
          "--gs-radius": `${shape}px`,
          "--gs-inner-radius": `${button ? shape : Math.max(3, shape - 4)}px`,
          "--gs-chip": `${button ? 36 : S.chip}px`,
          "--gs-row": `${S.row}px`,
          "--gs-font": `${fontSize}px`,
          "--gs-menu-w": "100%",
          "--gs-pop": `${popDuration}ms`,
          "--gs-pop-out": `${popOut}ms`,
          "--gs-glide": `${glideDuration}ms`,
          "--gs-origin": origin,
          "--gs-menu-space": menuSpace > 0 ? `${menuSpace}px` : undefined,
        } as CSSProperties
      }
      onAnimationEnd={(e) => {
        if (e.animationName === "gs-swap" && rootRef.current) delete rootRef.current.dataset.swap
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={phase === "open"}
        aria-controls={`${id}-list`}
        aria-activedescendant={active !== null ? `${id}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className="glide-select__trigger"
        onPointerDown={(e) => {
          if (e.button !== 0 || disabled) return
          e.currentTarget.focus({ preventScroll: true })
          if (phase === "open") close("pop")
          else open(false)
        }}
        onKeyDown={onTriggerKey}
      >
        <span className="glide-select__label" key={current} data-empty={selected < 0 ? "" : undefined}>
          {selected >= 0 ? items[selected].label : placeholder}
        </span>
        <span className="glide-select__chevron" aria-hidden="true">
          <ChevronDown size={button ? 16 : 14} strokeWidth={1.8} />
        </span>
      </button>
      {phase !== "closed" ? (
        <div
          ref={menuRef}
          className="glide-select__menu"
          data-state="open"
          data-side={side}
          data-align={align}
        >
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label={ariaLabel}
            className="glide-select__list"
            data-live={active !== null ? "" : undefined}
            onPointerOver={onListOver}
            onPointerLeave={() => {
              if (!scrub.current && !rememberPosition) setActive(null)
            }}
            onPointerDown={onListDown}
            onPointerMove={onListMove}
            onPointerUp={onListUp}
            onPointerCancel={onListUp}
            onLostPointerCapture={onListUp}
          >
            <span ref={pillRef} className="glide-select__pill" aria-hidden="true" />
            {items.map((it, i) => (
              <div
                key={it.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === selected}
                data-index={i}
                className="glide-select__option"
              >
                <span className="glide-select__name">{it.label}</span>
                {showTags && it.tag ? <span className="glide-select__tag">{it.tag}</span> : null}
                <span className="glide-select__check" data-on={i === selected ? "" : undefined} aria-hidden="true">
                  <Check size={14} strokeWidth={1.8} />
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
