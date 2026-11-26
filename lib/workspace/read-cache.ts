type Entry = { value: unknown }

const store = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

export function takeCached<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined
}

export function keepCached(key: string, value: unknown): void {
  store.set(key, { value })
}

export function forgetCached(prefix?: string): void {
  if (!prefix) {
    store.clear()
    inflight.clear()
    return
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key)
  }
}

/** Reuses a stored read for the rest of the browser session. Failed reads are not stored. */
export async function cachedRead<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const stored = store.get(key)
  if (stored) return stored.value as T
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T | null>
  const promise = load()
    .then((value) => {
      if (inflight.get(key) === promise && value !== null && value !== undefined) store.set(key, { value })
      return value
    })
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}
