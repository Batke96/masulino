import {
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CornerUpLeft,
  Eye,
  FolderOpen,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react"

export type ActionTone = "neutral" | "present" | "danger"

export type ActionId =
  | "open"
  | "checkIn"
  | "remove"
  | "add"
  | "folder"
  | "previous"
  | "next"
  | "edit"
  | "save"
  | "discard"
  | "cancel"
  | "close"
  | "reset"
  | "undo"
  | "accept"
  | "search"
  | "propose"

export type ActionDefinition = {
  verb: string
  icon: string
  label: string
  pressedLabel?: string
  tone: ActionTone
  undo?: "fuse"
  unambiguous: boolean
}

export const actionCatalog: Record<ActionId, ActionDefinition> = {
  open: { verb: "Öffnen", icon: "Eye", label: "Öffnen", tone: "neutral", unambiguous: true },
  checkIn: { verb: "Check-in", icon: "UserCheck", label: "Check-in", pressedLabel: "Aufheben", tone: "present", undo: "fuse", unambiguous: true },
  remove: { verb: "Entfernen", icon: "Trash2", label: "Entfernen", tone: "danger", undo: "fuse", unambiguous: true },
  add: { verb: "Hinzufügen", icon: "Plus", label: "Hinzufügen", tone: "neutral", unambiguous: false },
  folder: { verb: "Tagesmappe", icon: "FolderOpen", label: "Tagesmappe", tone: "neutral", unambiguous: false },
  previous: { verb: "Zurück", icon: "ChevronLeft", label: "Zurück", tone: "neutral", unambiguous: true },
  next: { verb: "Vor", icon: "ChevronRight", label: "Vor", tone: "neutral", unambiguous: true },
  edit: { verb: "Bearbeiten", icon: "Pencil", label: "Bearbeiten", tone: "neutral", unambiguous: true },
  save: { verb: "Speichern", icon: "Check", label: "Speichern", tone: "present", unambiguous: false },
  discard: { verb: "Verwerfen", icon: "Undo2", label: "Verwerfen", tone: "neutral", unambiguous: false },
  cancel: { verb: "Abbrechen", icon: "CornerUpLeft", label: "Abbrechen", tone: "neutral", unambiguous: true },
  close: { verb: "Schließen", icon: "X", label: "Schließen", tone: "danger", unambiguous: true },
  reset: { verb: "Zurücksetzen", icon: "RefreshCcw", label: "Zurücksetzen", tone: "neutral", unambiguous: true },
  undo: { verb: "Rückgängig", icon: "RotateCcw", label: "Rückgängig", tone: "neutral", unambiguous: true },
  accept: { verb: "Annehmen", icon: "CalendarCheck", label: "Annehmen", tone: "neutral", undo: "fuse", unambiguous: false },
  search: { verb: "Suchen", icon: "Search", label: "Suchen", tone: "neutral", unambiguous: true },
  propose: { verb: "Vorschlagen", icon: "Sparkles", label: "Planvorschlag", tone: "neutral", unambiguous: false },
}

const icons: Record<ActionDefinition["icon"], LucideIcon> = {
  Eye,
  UserCheck,
  Trash2,
  Plus,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  Undo2,
  CornerUpLeft,
  X,
  RefreshCcw,
  RotateCcw,
  CalendarCheck,
  Search,
  Sparkles,
}

export function actionIcon(id: ActionId): LucideIcon {
  return icons[actionCatalog[id].icon]
}
