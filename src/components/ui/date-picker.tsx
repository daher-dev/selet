"use client"

import * as React from "react"
import { CalendarIcon, CakeIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Calendar,
  MonthCalendar,
  MONTHS_SHORT_PT,
} from "@/components/ui/calendar"

const triggerClassName =
  "flex h-[42px] w-full items-center gap-2 rounded-[10px] border border-border bg-muted/40 px-3.5 text-left transition-colors outline-none hover:border-primary/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:border-ring"

/**
 * Day picker for the customer birthday field (design 837-855). The birthday is
 * a day/month value, so the trigger shows a DD/MM label.
 */
function DatePicker({
  value,
  onChange,
  placeholder = "Selecionar",
  className,
}: {
  value?: Date
  onChange?: (date: Date) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const label = value
    ? `${String(value.getDate()).padStart(2, "0")}/${String(
        value.getMonth() + 1
      ).padStart(2, "0")}`
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(triggerClassName, className)}>
        <span
          className={cn(
            "flex-1 text-sm",
            value ? "text-ink" : "text-ink-faint"
          )}
        >
          {label}
        </span>
        <CakeIcon className="size-4 text-ink-faint" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <Calendar
          selected={value}
          onSelect={(date) => {
            onChange?.(date)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Month/year picker for "Cliente desde" (design 862-878). Shows a "Mês/AAAA"
 * label such as "Mar/2023".
 */
function MonthPicker({
  value,
  onChange,
  placeholder = "Selecionar",
  className,
}: {
  value?: { year: number; month: number }
  onChange?: (value: { year: number; month: number }) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const label = value
    ? `${MONTHS_SHORT_PT[value.month]}/${value.year}`
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(triggerClassName, className)}>
        <span
          className={cn(
            "flex-1 text-sm",
            value ? "text-ink" : "text-ink-faint"
          )}
        >
          {label}
        </span>
        <CalendarIcon className="size-4 text-ink-faint" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <MonthCalendar
          selected={value}
          onSelect={(v) => {
            onChange?.(v)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker, MonthPicker }
