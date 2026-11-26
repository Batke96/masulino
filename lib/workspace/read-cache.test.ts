import { describe, expect, it } from "vitest"

import { cachedRead, forgetCached, takeCached } from "./read-cache"

describe("read cache", () => {
  it("reuses a stored read and skips the loader", async () => {
    let calls = 0
    const key = "reuse"
    const load = async () => {
      calls += 1
      return { n: 1 }
    }
    expect(await cachedRead(key, load)).toEqual({ n: 1 })
    expect(await cachedRead(key, load)).toEqual({ n: 1 })
    expect(calls).toBe(1)
    expect(takeCached(key)).toEqual({ n: 1 })
  })

  it("does not store a failed read", async () => {
    let calls = 0
    const key = "miss"
    const first = await cachedRead(key, async () => {
      calls += 1
      return null
    })
    const second = await cachedRead(key, async () => {
      calls += 1
      return "ok"
    })
    expect(first).toBeNull()
    expect(second).toBe("ok")
    expect(calls).toBe(2)
  })

  it("shares one load while the first request is still open", async () => {
    let calls = 0
    let release: (value: string) => void = () => {}
    const key = "flight"
    const load = () => {
      calls += 1
      return new Promise<string>((resolve) => {
        release = resolve
      })
    }
    const first = cachedRead(key, load)
    const second = cachedRead(key, load)
    release("ready")
    await expect(first).resolves.toBe("ready")
    await expect(second).resolves.toBe("ready")
    expect(calls).toBe(1)
  })

  it("drops one prefix and ignores a load that finishes after the drop", async () => {
    await cachedRead("keep-me", async () => "stay")
    await cachedRead("pos/open", async () => "gone")
    forgetCached("pos/")
    expect(takeCached("keep-me")).toBe("stay")
    expect(takeCached("pos/open")).toBeUndefined()

    let release: (value: string) => void = () => {}
    const late = cachedRead("late", () => new Promise<string>((resolve) => {
      release = resolve
    }))
    forgetCached("late")
    release("too-late")
    await expect(late).resolves.toBe("too-late")
    expect(takeCached("late")).toBeUndefined()
  })

  it("clears the session", async () => {
    await cachedRead("a", async () => 1)
    forgetCached()
    expect(takeCached("a")).toBeUndefined()
  })
})
