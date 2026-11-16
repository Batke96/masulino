import * as React from "react"

const MOBILE_BREAKPOINT = 768
const COMPACT_BREAKPOINT = 1040

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export function useIsCompactSidebar() {
  const [isCompact, setIsCompact] = React.useState(false)

  React.useEffect(() => {
    const query = `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${COMPACT_BREAKPOINT - 1}px)`
    const mql = window.matchMedia(query)
    const onChange = () => setIsCompact(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isCompact
}
