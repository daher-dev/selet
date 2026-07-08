"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Responsive desktop-table primitive matching the design's data tables
 * (pedidos 296-329, clientes 636-679, equipe 1730-1750): a white card with a
 * muted uppercase header row and hover-highlighted rows sharing one CSS grid
 * template.
 *
 * Pages render this table for desktop and their own card list for mobile,
 * toggled with the >=820px breakpoint, e.g.:
 *
 *   <DataList columns="60px 1.4fr 1.3fr 96px" className="hidden min-[820px]:block">
 *     <DataListHeader>
 *       <span>Pedido</span><span>Cliente</span><span>Itens</span>
 *       <DataListCell align="end">Total</DataListCell>
 *     </DataListHeader>
 *     {rows.map((r) => (
 *       <DataListRow key={r.id} onClick={r.onEdit}>…</DataListRow>
 *     ))}
 *   </DataList>
 *
 * The `columns` grid template is shared by the header and every row through
 * context, so cells always line up.
 */

const DataListContext = React.createContext<{ columns: string }>({
  columns: "1fr",
})

function DataList({
  columns,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** CSS grid-template-columns for the header and rows. */
  columns: string
}) {
  return (
    <DataListContext.Provider value={{ columns }}>
      <div
        data-slot="data-list"
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-card",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </DataListContext.Provider>
  )
}

function DataListHeader({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  const { columns } = React.useContext(DataListContext)
  return (
    <div
      data-slot="data-list-header"
      role="row"
      className={cn(
        "grid items-center gap-2.5 border-b border-border bg-muted/40 px-[18px] py-[13px] text-[11px] font-bold tracking-wider text-muted-foreground uppercase [&>span]:min-w-0",
        className
      )}
      style={{ gridTemplateColumns: columns, ...style }}
      {...props}
    />
  )
}

function DataListRow({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  const { columns } = React.useContext(DataListContext)
  const interactive = props.onClick != null
  return (
    <div
      data-slot="data-list-row"
      role="row"
      className={cn(
        "grid items-center gap-2.5 border-b border-muted px-[18px] py-3.5 text-sm transition-colors last:border-b-0 hover:bg-muted/40 [&>span]:min-w-0",
        interactive && "cursor-pointer",
        className
      )}
      style={{ gridTemplateColumns: columns, ...style }}
      {...props}
    />
  )
}

function DataListCell({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"span"> & {
  align?: "start" | "center" | "end"
}) {
  return (
    <span
      data-slot="data-list-cell"
      className={cn(
        "min-w-0",
        align === "end" && "text-right",
        align === "center" && "text-center",
        className
      )}
      {...props}
    />
  )
}

export { DataList, DataListHeader, DataListRow, DataListCell }
