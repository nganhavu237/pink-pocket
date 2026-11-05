import type { ReactNode } from 'react'
import { useEffect } from 'react'
export function PageHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} · Pink Pocket`
  }, [title])
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}
export function MonthPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Month</span>
      <input
        className="field w-auto"
        type="month"
        aria-label="Month"
        min="0001-01"
        max="9999-12"
        value={value}
        onChange={(event) => {
          if (/^\d{4}-\d{2}$/.test(event.target.value))
            onChange(event.target.value)
        }}
        required
      />
    </label>
  )
}
