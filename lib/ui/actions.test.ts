import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"
import * as Lucide from "lucide-react"

import { actionCatalog } from "./actions"

describe("action catalog", () => {
  it("gives each verb one lucide icon", () => {
    const verbs = new Set<string>()
    const icons = new Set<string>()
    for (const action of Object.values(actionCatalog)) {
      expect(verbs.has(action.verb)).toBe(false)
      verbs.add(action.verb)
      expect(icons.has(action.icon)).toBe(false)
      icons.add(action.icon)
      expect(action.icon in Lucide).toBe(true)
      expect(action.icon).not.toBe("LogIn")
    }
    expect(actionCatalog.checkIn.icon).toBe("UserCheck")
    expect(actionCatalog.checkIn.undo).toBe("fuse")
    expect(actionCatalog.remove.undo).toBe("fuse")
    expect(actionCatalog.accept.undo).toBe("fuse")
    expect(actionCatalog.propose.verb).toBe("Vorschlagen")
    expect(actionCatalog.propose.icon).toBe("Sparkles")
    expect(actionCatalog.propose.label).toBe("Planvorschlag")
  })

  it("binds button tones to the color tokens", () => {
    const css = readFileSync(new URL("../../components/ui/jelly-button.css", import.meta.url), "utf8")
    expect(css).toMatch(/data-tone="present"[\s\S]*?var\(--success\)/)
    expect(css).toMatch(/data-tone="danger"[\s\S]*?var\(--destructive\)/)
    const motion = readFileSync(new URL("../../app/styles/tokens/motion.css", import.meta.url), "utf8")
    expect(motion).toContain("--undo-window: 4000ms")
  })
})
