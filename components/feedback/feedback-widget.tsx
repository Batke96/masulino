"use client"

import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { MessageSquarePlus, X } from "lucide-react"
import { JellyButton } from "@/components/ui/jelly-button"
import { useStaffIdentity } from "@/app/staff-access"

import "./feedback-widget.css"

type FeedbackWidgetProps = {
  appId: string
  appName: string
}

type SentIssue = {
  number: number
  url: string
}

export function FeedbackWidget({ appId, appName }: FeedbackWidgetProps) {
  const staff = useStaffIdentity()
  const titleId = useId()
  const fieldId = useId()
  const dockRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const opened = useRef(false)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [sent, setSent] = useState<SentIssue | null>(null)

  useEffect(() => {
    if (open) {
      opened.current = true
      fieldRef.current?.focus()
      return
    }
    if (opened.current) launcherRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!dockRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function close() {
    setOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = message.trim()
    if (!text || pending) return
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          appId,
          appName,
          path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        }),
      })
      const data = (await response.json().catch(() => null)) as { url?: string; number?: number } | null
      if (!response.ok || !data?.url || typeof data.number !== "number") {
        setError(feedbackError(response.status))
        return
      }
      setMessage("")
      setSent({ number: data.number, url: data.url })
    } catch {
      setError("Das Feedback konnte nicht gesendet werden.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="feedback-dock" ref={dockRef}>
      {open ? (
        <section
          className="feedback-panel"
          role="dialog"
          aria-labelledby={titleId}
        >
          <header>
            <h2 id={titleId}>Feedback</h2>
            <JellyButton variant="icon" aria-label="Feedback schließen" onClick={close}>
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </JellyButton>
          </header>
          {sent ? (
            <div className="feedback-sent">
              <p>Danke. Das liegt jetzt als GitHub-Issue.</p>
              <a href={sent.url} target="_blank" rel="noopener noreferrer">
                Issue {sent.number} öffnen
              </a>
              <JellyButton
                variant="soft"
                onClick={() => {
                  setSent(null)
                  setError("")
                }}
              >
                Weiteres Feedback
              </JellyButton>
            </div>
          ) : (
            <form onSubmit={submit}>
              <p className="feedback-context">
                App: {appName}
                {staff ? ` · ${staff.name}` : ""}
              </p>
              <label className="feedback-field" htmlFor={fieldId}>
                Nachricht
                <textarea
                  id={fieldId}
                  ref={fieldRef}
                  value={message}
                  maxLength={4000}
                  rows={5}
                  required
                  placeholder="Was ist aufgefallen?"
                  onChange={(event) => setMessage(event.target.value)}
                />
              </label>
              <p className="feedback-note">Wird als Issue im Repository angelegt.</p>
              {error ? (
                <p className="feedback-status" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="feedback-actions">
                <JellyButton variant="soft" type="button" onClick={close} disabled={pending}>
                  Abbrechen
                </JellyButton>
                <JellyButton type="submit" disabled={pending || !message.trim()}>
                  {pending ? "Senden …" : "Senden"}
                </JellyButton>
              </div>
            </form>
          )}
        </section>
      ) : null}
      <JellyButton
        ref={launcherRef}
        variant="soft"
        className="feedback-launcher"
        aria-expanded={open}
        aria-label={open ? "Feedback schließen" : "Feedback geben"}
        onClick={() => setOpen((value) => !value)}
      >
        <MessageSquarePlus size={18} strokeWidth={1.8} aria-hidden="true" />
        Feedback
      </JellyButton>
    </div>
  )
}

function feedbackError(status: number): string {
  if (status === 401) return "Bitte zuerst anmelden."
  if (status === 403) return "Für dieses Konto ist kein Feedback freigeschaltet."
  if (status === 429) return "Gerade zu viele Rückmeldungen. Bitte kurz warten."
  if (status === 503) return "Der Server kann gerade kein GitHub-Issue anlegen."
  return "Das Feedback konnte nicht gesendet werden."
}
