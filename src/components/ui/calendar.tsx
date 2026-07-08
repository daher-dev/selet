"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Dependency-light calendar: no react-day-picker (it is not in package.json and
// the design only needs a small month grid + a month/year grid). Everything
// here is hand-rolled around the native Date API.

const WEEKDAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"]
const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]
const MONTHS_SHORT_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
]

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const navButtonClassName =
  "flex size-7 items-center justify-center rounded-md text-ink-soft transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-[15px]"

function CalendarNav({
  label,
  onPrev,
  onNext,
  labelClassName,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  labelClassName?: string
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <button type="button" aria-label="Anterior" className={navButtonClassName} onClick={onPrev}>
        <ChevronLeftIcon />
      </button>
      <span className={cn("text-[13px] font-bold text-ink", labelClassName)}>
        {label}
      </span>
      <button type="button" aria-label="Próximo" className={navButtonClassName} onClick={onNext}>
        <ChevronRightIcon />
      </button>
    </div>
  )
}

type CalendarProps = {
  /** Currently selected day. */
  selected?: Date
  onSelect?: (date: Date) => void
  /** Month shown on first render when uncontrolled (defaults to selected/today). */
  defaultMonth?: Date
  className?: string
}

/**
 * Day-grid calendar with prev/next month navigation. Used for the customer
 * birthday picker (design 837-855).
 */
function Calendar({ selected, onSelect, defaultMonth, className }: CalendarProps) {
  const [viewDate, setViewDate] = React.useState<Date>(() => {
    const base = defaultMonth ?? selected ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const goPrev = () => setViewDate(new Date(year, month - 1, 1))
  const goNext = () => setViewDate(new Date(year, month + 1, 1))

  return (
    <div className={cn("w-[248px]", className)}>
      <CalendarNav
        label={`${MONTHS_PT[month]} ${year}`}
        onPrev={goPrev}
        onNext={goNext}
      />
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {WEEKDAYS_PT.map((w, i) => (
          <span
            key={i}
            className="flex h-6 items-center justify-center text-[11px] font-semibold text-ink-faint"
          >
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />
          const date = new Date(year, month, day)
          const isSelected = selected != null && sameDay(date, selected)
          const isToday = sameDay(date, new Date())
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect?.(date)}
              className={cn(
                "flex h-8 items-center justify-center rounded-lg text-[13px] font-medium tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "text-ink hover:bg-accent",
                !isSelected && isToday && "font-bold text-primary"
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type MonthCalendarProps = {
  /** Selected year+month. */
  selected?: { year: number; month: number }
  onSelect?: (value: { year: number; month: number }) => void
  defaultYear?: number
  className?: string
}

/**
 * Month/year grid variant with year navigation, used for "Cliente desde"
 * (design 862-878).
 */
function MonthCalendar({
  selected,
  onSelect,
  defaultYear,
  className,
}: MonthCalendarProps) {
  const [viewYear, setViewYear] = React.useState<number>(
    () => selected?.year ?? defaultYear ?? new Date().getFullYear()
  )

  return (
    <div className={cn("w-[248px]", className)}>
      <CalendarNav
        label={String(viewYear)}
        onPrev={() => setViewYear((y) => y - 1)}
        onNext={() => setViewYear((y) => y + 1)}
        labelClassName="text-sm"
      />
      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS_SHORT_PT.map((label, m) => {
          const isSelected =
            selected != null &&
            selected.year === viewYear &&
            selected.month === m
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelect?.({ year: viewYear, month: m })}
              className={cn(
                "flex h-9 items-center justify-center rounded-lg text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-ink hover:bg-accent"
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export {
  Calendar,
  MonthCalendar,
  MONTHS_PT,
  MONTHS_SHORT_PT,
  WEEKDAYS_PT,
}
