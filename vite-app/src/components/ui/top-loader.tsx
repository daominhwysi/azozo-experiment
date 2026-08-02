import { useEffect, useState } from "react"

type Listener = (val: number | null) => void

class TopLoaderController {
  private listeners: Set<Listener> = new Set()
  private progress: number | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.progress)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    this.listeners.forEach((l) => l(this.progress))
  }

  start() {
    if (this.timer) clearInterval(this.timer)
    this.progress = 12
    this.notify()

    this.timer = setInterval(() => {
      if (this.progress === null) return
      if (this.progress < 45) {
        this.progress += Math.floor(Math.random() * 8) + 5
      } else if (this.progress < 82) {
        this.progress += Math.floor(Math.random() * 4) + 1
      } else if (this.progress < 96) {
        this.progress += 0.5
      }
      this.notify()
    }, 200)
  }

  set(val: number) {
    this.progress = Math.min(100, Math.max(0, val))
    this.notify()
  }

  done() {
    if (this.timer) clearInterval(this.timer)
    this.progress = 100
    this.notify()

    setTimeout(() => {
      this.progress = null
      this.notify()
    }, 450)
  }
}

export const topLoader = new TopLoaderController()

export function TopLoader() {
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    return topLoader.subscribe(setProgress)
  }, [])

  if (progress === null) return null

  return (
    <div
      aria-label="Loading progress"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      className="pointer-events-none fixed top-0 right-0 left-0 z-[9999]"
    >
      <div
        className="h-0.5 bg-primary transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transitionProperty: "width, opacity",
        }}
      />
    </div>
  )
}
