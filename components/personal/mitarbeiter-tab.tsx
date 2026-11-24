"use client"

import { useMemo, useState } from "react"

import { ListSearch } from "@/app/booking-lists"
import { DataTable, type DataColumn } from "@/components/data-table"
import { Block } from "@/components/ui/block"
import { GlideSelect } from "@/components/ui/glide-select"
import { RowAction } from "@/components/ui/row-action"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  initialPersonalState,
  roleLabels,
  skillKeys,
  skillLabels,
  type Employee,
  type Role,
  type SkillKey,
} from "@/lib/personal"
import { usePersonal } from "./personal-context"
import { Pill } from "./personal-ui"

const skillShort: Record<SkillKey, string> = {
  kasse: "Kasse",
  reinigung: "Reinigung",
  oeffnung: "Öffnungsdienst",
  stosszeit: "Stoßzeiten",
}

type RoleFilter = "alle" | Role

const roleFilterItems: { value: RoleFilter; label: string }[] = [
  { value: "alle", label: "Alle" },
  ...(Object.keys(roleLabels) as Role[]).map((value) => ({ value, label: roleLabels[value] })),
]

type EmployeeRow = {
  id: string
  name: string
  role: string
  hours: string
  hoursSort: number
  skills: SkillKey[]
  changed: boolean
}

function sameEmployee(a: Employee, b: Employee | undefined): boolean {
  return Boolean(b) && JSON.stringify(a) === JSON.stringify(b)
}

function skillSearchText(skills: readonly SkillKey[]): string {
  if (skills.length === 0) return "Keine"
  return skills.map((skill) => `${skillShort[skill]} ${skillLabels[skill]}`).join(" ")
}

function SkillMarks({ skills }: { skills: readonly SkillKey[] }) {
  if (skills.length === 0) return <span className="personal-skill-none">Keine</span>
  return (
    <TooltipProvider delayDuration={400}>
      <span className="personal-skill-marks">
        {skills.map((skill) => {
          const description = skillLabels[skill]
          const letter = skillShort[skill].charAt(0).toLocaleUpperCase("de-DE")
          return (
            <Tooltip key={skill}>
              <TooltipTrigger asChild>
                <button type="button" className="personal-skill" aria-label={description}>
                  {letter}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>{description}</TooltipContent>
            </Tooltip>
          )
        })}
      </span>
    </TooltipProvider>
  )
}

function toRow(employee: Employee, baseline: readonly Employee[]): EmployeeRow {
  const skills = skillKeys.filter((skill) => employee.skills[skill])
  return {
    id: employee.id,
    name: employee.name,
    role: roleLabels[employee.role],
    hours: `${employee.targetHours} / ${employee.maxHours} Std.`,
    hoursSort: employee.targetHours * 100 + employee.maxHours,
    skills,
    changed: !sameEmployee(employee, baseline.find((item) => item.id === employee.id)),
  }
}

const columns: DataColumn<EmployeeRow>[] = [
  {
    id: "name",
    label: "Name",
    kind: "text",
    raw: (row) => row.name,
    text: (row) => row.name,
    render: (row) => (
      <span className="personal-employee-name">
        <strong>{row.name}</strong>
        {row.changed ? <Pill tone="blue">Geändert</Pill> : null}
      </span>
    ),
  },
  {
    id: "role",
    label: "Rolle",
    kind: "text",
    raw: (row) => row.role,
    text: (row) => row.role,
  },
  {
    id: "hours",
    label: "Stunden",
    kind: "number",
    raw: (row) => row.hoursSort,
    text: (row) => row.hours,
  },
  {
    id: "skills",
    label: "Fähigkeiten",
    kind: "text",
    raw: (row) => skillSearchText(row.skills),
    text: (row) => skillSearchText(row.skills),
    render: (row) => <SkillMarks skills={row.skills} />,
  },
]

function isRoleFilter(value: string): value is RoleFilter {
  return value === "alle" || (Object.keys(roleLabels) as string[]).includes(value)
}

export function MitarbeiterTab() {
  const { state, openAvailability } = usePersonal()
  const baseline = useMemo(() => initialPersonalState().employees, [])
  const [role, setRole] = useState<RoleFilter>("alle")
  const [query, setQuery] = useState("")
  const rows = useMemo(
    () =>
      state.employees
        .filter((employee) => role === "alle" || employee.role === role)
        .map((employee) => toRow(employee, baseline)),
    [baseline, role, state.employees],
  )

  return (
    <Block
      controls={
        <GlideSelect
          options={roleFilterItems}
          value={role}
          onChange={(value) => {
            if (isRoleFilter(value)) setRole(value)
          }}
          showTags={false}
          size="md"
          variant="button"
          ariaLabel="Rolle"
        />
      }
      actions={<ListSearch query={query} onChange={setQuery} />}
      note="Alle Namen sind fiktiv. Rolle, Stunden und Fähigkeiten steuern die Planprüfung und den Planvorschlag. Änderungen gelten im Dienstplan erst nach dem Speichern."
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        query={query}
        onQueryChange={setQuery}
        initialSort={{ id: "name", direction: "asc" }}
        empty={<div className="empty-state"><h3>Keine Mitarbeitenden</h3><p>In dieser Rolle steht hier niemand.</p></div>}
        emptyFiltered="Keine Mitarbeitenden passen zur Suche."
        actions={(row) => <RowAction action="open" rowName={row.name} onClick={() => openAvailability(row.id)} />}
      />
    </Block>
  )
}
