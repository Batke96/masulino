"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import {
  DEMO_CLOCK_START,
  DEMO_DATE,
  dayPersons,
  initialPersonalState,
  personalReducer,
  planWeeks,
  type PersonalAction,
  type PersonalState,
  type PlanWeek,
} from "@/lib/personal"

export type PersonalTab = "dienstplan" | "mitarbeiter" | "verfuegbarkeit" | "zeiterfassung" | "regeln"

type CommitOptions = { description?: string; undoable?: boolean }

type PersonalContextValue = {
  state: PersonalState
  dispatch: (action: PersonalAction) => void
  commit: (action: PersonalAction, title: string, options?: CommitOptions) => void
  tab: PersonalTab
  setTab: (tab: PersonalTab) => void
  week: PlanWeek
  weekId: string
  setWeekId: (id: string) => void
  date: string
  setDate: (date: string) => void
  availabilityEmployee: string
  setAvailabilityEmployee: (id: string) => void
  openAvailability: (employeeId: string) => void
  openDay: (weekId: string, date: string) => void
  clock: number
  advanceClock: (minutes: number) => void
}

const PersonalContext = createContext<PersonalContextValue | null>(null)

export function usePersonal(): PersonalContextValue {
  const value = useContext(PersonalContext)
  if (!value) throw new Error("usePersonal braucht den PersonalProvider.")
  return value
}

function busiestDate(week: PlanWeek): string {
  if (week.days.some((day) => day.date === DEMO_DATE)) return DEMO_DATE
  return [...week.days].sort((a, b) => dayPersons(b) - dayPersons(a))[0]?.date ?? week.start
}

export function PersonalProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(personalReducer, undefined, initialPersonalState)
  const [tab, setTab] = useState<PersonalTab>("dienstplan")
  const [weekId, setWeekIdState] = useState(planWeeks[0]!.id)
  const [date, setDate] = useState(busiestDate(planWeeks[0]!))
  const [availabilityEmployee, setAvailabilityEmployee] = useState(state.employees[0]!.id)
  const [clockExtra, setClockExtra] = useState(0)
  const [clockTicks, setClockTicks] = useState(0)

  const snapshot = useRef(state)
  useEffect(() => {
    snapshot.current = state
  }, [state])

  useEffect(() => {
    const id = window.setInterval(() => setClockTicks((value) => value + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const week = planWeeks.find((item) => item.id === weekId) ?? planWeeks[0]!

  const setWeekId = useCallback((id: string) => {
    const next = planWeeks.find((item) => item.id === id)
    if (!next) return
    setWeekIdState(id)
    setDate(busiestDate(next))
  }, [])

  const commit = useCallback(
    (action: PersonalAction, title: string, options?: CommitOptions) => {
      const before = snapshot.current
      dispatch(action)
      toast(title, {
        description: options?.description,
        action:
          options?.undoable === false
            ? undefined
            : { label: "Rückgängig", onClick: () => dispatch({ type: "restore", state: before }) },
      })
    },
    [],
  )

  const openAvailability = useCallback((employeeId: string) => {
    setAvailabilityEmployee(employeeId)
    setTab("verfuegbarkeit")
  }, [])

  const openDay = useCallback(
    (targetWeek: string, targetDate: string) => {
      setWeekIdState(targetWeek)
      setDate(targetDate)
      setTab("dienstplan")
    },
    [],
  )

  const advanceClock = useCallback((minutes: number) => setClockExtra((value) => value + minutes), [])

  const clock = Math.min(24 * 60 - 1, DEMO_CLOCK_START + clockExtra + clockTicks)

  const value = useMemo<PersonalContextValue>(
    () => ({
      state,
      dispatch,
      commit,
      tab,
      setTab,
      week,
      weekId,
      setWeekId,
      date,
      setDate,
      availabilityEmployee,
      setAvailabilityEmployee,
      openAvailability,
      openDay,
      clock,
      advanceClock,
    }),
    [state, commit, tab, week, weekId, setWeekId, date, availabilityEmployee, openAvailability, openDay, clock, advanceClock],
  )

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>
}
