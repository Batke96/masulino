"use client"

import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import {
  animate,
  motion,
  motionValue,
  useReducedMotion,
  useTransform,
  type HTMLMotionProps,
  type MotionValue,
} from "motion/react"

import "./jelly-radio.css"

const DEFAULT_ITEMS = ["Off", "Low", "Medium", "High", "Max"]
const SIZES = {
  sm: [28, 12, 12],
  md: [36, 13, 16],
  lg: [44, 14, 20],
} as const

type JellyRadioItem =
  | string
  | {
      value: string
      label: string
      icon?: ReactNode
      disabled?: boolean
    }

type JellyMotionValues = {
  x: MotionValue<number>
  sx: MotionValue<number>
  sy: MotionValue<number>
}

type JellyRadioProps = {
  items?: JellyRadioItem[]
  value?: string
  defaultValue?: string
  onChange?: (value: string, index: number) => void
  chipColor?: string
  activeColor?: string
  textColor?: string
  activeTextColor?: string
  size?: keyof typeof SIZES
  gap?: number
  radius?: number
  swell?: number
  barge?: number
  shrink?: number
  jelly?: number
  bounce?: number
  stagger?: number
  stiffness?: number
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

const spring = (stiffness: number, mass: number, bounce: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * Math.sqrt(stiffness * mass) * (1 - bounce),
  mass,
})

const Chip = forwardRef<
  HTMLButtonElement,
  HTMLMotionProps<"button"> & { mv: JellyMotionValues }
>(function Chip({ mv, children, ...rest }, ref) {
  const transform = useTransform(
    () => `translateX(${mv.x.get()}px) scale(${mv.sx.get()}, ${mv.sy.get()})`
  )

  return (
    <motion.button ref={ref} style={{ transform }} {...rest}>
      {children}
    </motion.button>
  )
})

export function JellyRadio({
  items = DEFAULT_ITEMS,
  value,
  defaultValue,
  onChange,
  chipColor = "#27272a",
  activeColor = "#f5f5f5",
  textColor = "#f5f5f5",
  activeTextColor = "#18181b",
  size = "md",
  gap = 8,
  radius = 18,
  swell = 0,
  barge = 0,
  shrink = 0,
  jelly = 0.15,
  bounce = 0.05,
  stagger = 6,
  stiffness = 780,
  disabled = false,
  ariaLabel = "Options",
  className = "",
}: JellyRadioProps) {
  const list = items.map((item) =>
    typeof item === "string" ? { value: item, label: item } : item
  )
  const [inner, setInner] = useState(() => defaultValue ?? list[0]?.value)
  const current = value ?? inner
  const at = Math.max(
    0,
    list.findIndex((item) => item.value === current)
  )
  const reduce = useReducedMotion()
  const groupRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([])
  const widths = useRef<number[]>([])
  const mvs = useRef<JellyMotionValues[]>([])
  const applied = useRef(at)
  const config = useRef({
    swell,
    barge,
    shrink,
    jelly,
    bounce,
    stagger,
    stiffness,
    reduce,
    count: list.length,
  })
  config.current = {
    swell,
    barge,
    shrink,
    jelly,
    bounce,
    stagger,
    stiffness,
    reduce,
    count: list.length,
  }
  const [height, font, paddingX] = SIZES[size] ?? SIZES.md
  const itemsKey = list.map((item) => item.value).join("|")

  const mvFor = (index: number) => {
    let mv = mvs.current[index]
    if (!mv) {
      mv = {
        x: motionValue(0),
        sx: motionValue(1),
        sy: motionValue(1),
      }
      mvs.current[index] = mv
    }
    return mv
  }

  const apply = (selected: number, instant: boolean) => {
    const currentConfig = config.current
    const group = groupRef.current
    const rtl = group ? getComputedStyle(group).direction === "rtl" : false
    const push =
      ((widths.current[selected] ?? 0) * currentConfig.swell) / 2 +
      currentConfig.barge

    for (let index = 0; index < currentConfig.count; index += 1) {
      const mv = mvFor(index)
      const on = index === selected
      const far = Math.abs(index - selected)
      const direction = Math.sign(index - selected) * (rtl ? -1 : 1)
      const x = direction * push
      const scale = on ? 1 + currentConfig.swell : 1 - currentConfig.shrink

      if (instant || currentConfig.reduce) {
        mv.x.jump(x)
        mv.sx.jump(scale)
        mv.sy.jump(scale)
        continue
      }

      const stiffnessForItem =
        currentConfig.stiffness * (1 - 0.12 * Math.min(far, 3))
      const inFlight =
        mv.x.isAnimating() || mv.sx.isAnimating() || mv.sy.isAnimating()
      const delay = inFlight ? 0 : (far * currentConfig.stagger) / 1000

      animate(mv.x, x, {
        ...spring(stiffnessForItem, 0.9, currentConfig.bounce),
        delay,
      })
      animate(mv.sx, scale, {
        ...spring(
          stiffnessForItem * (1 + 0.24 * currentConfig.jelly),
          0.9 - 0.1 * currentConfig.jelly,
          Math.min(
            0.85,
            currentConfig.bounce + 0.3 * currentConfig.jelly
          )
        ),
        delay,
      })
      animate(mv.sy, scale, {
        ...spring(
          stiffnessForItem * (1 - 0.14 * currentConfig.jelly),
          0.9 + 0.05 * currentConfig.jelly,
          currentConfig.bounce
        ),
        delay: delay + 0.05 * currentConfig.jelly,
      })
    }
  }

  const measure = () => {
    const group = groupRef.current
    if (!group) return

    widths.current = chipRefs.current.map(
      (element) => element?.offsetWidth ?? 0
    )
    const chipHeight = chipRefs.current[0]?.offsetHeight ?? 0
    const maxWidth = Math.max(0, ...widths.current)
    group.style.setProperty(
      "--jr-pad-x",
      `${Math.ceil((maxWidth * swell * 1.3) / 2 + barge) + 2}px`
    )
    group.style.setProperty(
      "--jr-pad-y",
      `${Math.ceil((chipHeight * swell) / 2) + 2}px`
    )
  }

  useLayoutEffect(() => {
    const settle = () => {
      measure()
      apply(applied.current, true)
    }

    settle()
    const observer = new ResizeObserver(settle)
    if (groupRef.current) observer.observe(groupRef.current)
    document.fonts?.ready.then(settle)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, size, gap, swell, barge, shrink])

  useEffect(() => {
    if (applied.current === at) return
    applied.current = at
    apply(at, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at])

  useEffect(
    () => () => {
      mvs.current.forEach((mv) => {
        mv.x.destroy()
        mv.sx.destroy()
        mv.sy.destroy()
      })
    },
    []
  )

  const commit = (index: number, instant: boolean) => {
    if (
      disabled ||
      index === at ||
      !list[index] ||
      list[index].disabled
    ) {
      return
    }
    applied.current = index
    apply(index, instant)
    if (value === undefined) setInner(list[index].value)
    onChange?.(list[index].value, index)
  }

  const stepFrom = (index: number, direction: number) => {
    const count = list.length
    let next = index
    for (let tries = 0; tries < count; tries += 1) {
      next = (next + direction + count) % count
      if (!list[next].disabled) return next
    }
    return index
  }

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let next: number | null = null
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = stepFrom(index, 1)
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = stepFrom(index, -1)
    } else if (event.key === "Home") {
      next = stepFrom(-1, 1)
    } else if (event.key === "End") {
      next = stepFrom(list.length, -1)
    } else if (event.key === " " || event.key === "Enter") {
      next = index
    }
    if (next === null) return
    event.preventDefault()
    commit(next, true)
    chipRefs.current[next]?.focus()
  }

  const style = {
    "--jr-chip": chipColor,
    "--jr-active": activeColor,
    "--jr-text": textColor,
    "--jr-active-text": activeTextColor,
    "--jr-gap": `${gap}px`,
    "--jr-radius": `${radius}px`,
    "--jr-h": `${height}px`,
    "--jr-font": `${font}px`,
    "--jr-px": `${paddingX}px`,
  } as CSSProperties

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      data-disabled={disabled ? "" : undefined}
      className={`jelly-radio${className ? ` ${className}` : ""}`}
      style={style}
    >
      {list.map((item, index) => (
        <Chip
          key={item.value}
          mv={mvFor(index)}
          ref={(element) => {
            chipRefs.current[index] = element
          }}
          type="button"
          role="radio"
          aria-checked={index === at}
          tabIndex={index === at ? 0 : -1}
          disabled={disabled || Boolean(item.disabled)}
          className="jelly-radio__chip"
          data-on={index === at ? "true" : "false"}
          onClick={(event) => commit(index, event.detail === 0)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className="jelly-radio__skin">
            {item.icon ? (
              <span className="jelly-radio__icon">{item.icon}</span>
            ) : null}
            <span className="jelly-radio__label">{item.label}</span>
          </span>
        </Chip>
      ))}
    </div>
  )
}
