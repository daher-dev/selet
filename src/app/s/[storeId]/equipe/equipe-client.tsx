"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ListFilter,
  Search,
  ShieldCheck,
  ShieldUser,
  UserCog,
  Users,
} from "lucide-react";
import type { Store, TeamMember } from "@/lib/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DataList,
  DataListHeader,
  DataListRow,
} from "@/components/ui/data-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIcon,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  usePageAction,
  useShellSearch,
} from "@/components/shell/app-shell-context";
import { MemberSheet } from "./member-sheet";

type RoleFilter = "todos" | "admin" | "funcionario";

// Design teamStatusVisual (Selet Admin.dc.html:2410): a consistent
// amber/gold treatment for "Convidado" — pill AND dot share the gold.
const STATUS_META: Record<
  string,
  { label: string; fg: string; bg: string; dot: string }
> = {
  ativo: { label: "Ativo", fg: "text-success", bg: "bg-mint-wash", dot: "bg-success" },
  convidado: { label: "Convidado", fg: "text-amber", bg: "bg-amber-wash", dot: "bg-amber" },
  inativo: { label: "Inativo", fg: "text-ink-faint", bg: "bg-wash", dot: "bg-ink-faint" },
};

const ROLE_FILTERS: {
  key: RoleFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}[] = [
  { key: "todos", label: "Todos", icon: Users },
  {
    key: "admin",
    label: "Admin",
    icon: ShieldCheck,
    iconClass: "bg-[#F6EAC6] text-[#8A6312]",
  },
  {
    key: "funcionario",
    label: "Funcionário",
    icon: ShieldUser,
    iconClass: "bg-mist text-[#3A7D44]",
  },
];

/**
 * Which stores a member belongs to, as the design shows it: the actual store
 * names, comma-joined (design storesLabel, Selet Admin.dc.html:2412) — not a
 * lossy "N lojas" count.
 */
function storesLabel(member: TeamMember, stores: Store[]): string {
  if (member.storeIds === "all") return "Todas as lojas";
  const ids = member.storeIds;
  if (ids.length === 0) return "Nenhuma loja";
  const names = ids
    .map((id) => stores.find((s) => s.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(", ") : `${ids.length} lojas`;
}

function roleMeta(role: TeamMember["role"]) {
  return role === "admin"
    ? {
        label: "Admin",
        icon: ShieldCheck,
        pill: "bg-[#F6EAC6] text-[#8A6312]",
        avatar: "bg-[#F6EAC6] text-[#8A6312]",
      }
    : {
        label: "Funcionário",
        icon: ShieldUser,
        pill: "bg-mist text-[#3A7D44]",
        avatar: "bg-mist text-[#3A7D44]",
      };
}

interface EquipeClientProps {
  storeId: string;
  members: TeamMember[];
  stores: Store[];
  meEmail: string;
  meIsAdmin: boolean;
}

export function EquipeClient({
  storeId,
  members,
  stores,
  meEmail,
  meIsAdmin,
}: EquipeClientProps) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("todos");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const shellSearch = useShellSearch();

  usePageAction({ label: "Novo membro", onClick: () => setInviting(true) });

  const selected = members.find((m) => m.email === selectedEmail) ?? null;

  const filtered = useMemo(() => {
    const terms = [query, shellSearch]
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const matches = (m: TeamMember, term: string) =>
      m.name.toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term);
    return members.filter((m) => {
      if (roleFilter !== "todos" && m.role !== roleFilter) return false;
      return terms.every((term) => matches(m, term));
    });
  }, [members, query, shellSearch, roleFilter]);

  const adminCount = members.filter((m) => m.role === "admin").length;
  const activeCount = members.filter((m) => m.status === "ativo").length;

  const activeFilter = ROLE_FILTERS.find((f) => f.key === roleFilter)!;

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <Stat label="Membros" value={members.length} valueClass="text-ink" />
        <Stat label="Admins" value={adminCount} valueClass="text-[#8A6312]" />
        <Stat label="Ativos" value={activeCount} valueClass="text-[#3A9D5D]" />
      </div>

      <div className="mb-4 flex flex-col gap-2.5 min-[560px]:flex-row min-[560px]:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-primary/40 data-[state=open]:border-primary/40"
            >
              <ListFilter className="size-4 text-leaf" />
              <span>{activeFilter.label}</span>
              <ChevronDown className="size-3.5 text-ink-faint" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {ROLE_FILTERS.map((f) => (
              <DropdownMenuItem
                key={f.key}
                active={roleFilter === f.key}
                onSelect={() => setRoleFilter(f.key)}
              >
                <DropdownMenuItemIcon className={f.iconClass}>
                  <f.icon />
                </DropdownMenuItemIcon>
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Nada encontrado"
          description="Tente outra busca ou filtro."
        />
      ) : (
        <>
          {/* Desktop table (design 1730-1750) */}
          <DataList
            columns="1.7fr 130px 1fr 110px"
            className="hidden min-[820px]:block"
          >
            <DataListHeader>
              <span>Membro</span>
              <span>Permissão</span>
              <span>Lojas</span>
              <span>Status</span>
            </DataListHeader>
            {filtered.map((member) => {
              const status = STATUS_META[member.status];
              const role = roleMeta(member.role);
              return (
                <DataListRow
                  key={member.email}
                  onClick={() => setSelectedEmail(member.email)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                        role.avatar,
                      )}
                    >
                      {initials(member.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-semibold text-ink">
                          {member.name}
                        </span>
                        {member.email === meEmail && (
                          <span className="shrink-0 rounded-full bg-mist px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                            você
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-faint">
                        {member.email}
                      </span>
                    </span>
                  </span>
                  <span>
                    <RolePill role={member.role} />
                  </span>
                  <span className="truncate text-[12.5px] text-ink-soft">
                    {storesLabel(member, stores)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn("size-1.5 shrink-0 rounded-full", status.dot)}
                    />
                    <span className="text-[12.5px] text-ink-soft">
                      {status.label}
                    </span>
                  </span>
                </DataListRow>
              );
            })}
          </DataList>

          {/* Mobile cards (design 1752-1774) */}
          <ul className="space-y-2.5 min-[820px]:hidden">
            {filtered.map((member) => {
              const status = STATUS_META[member.status];
              const role = roleMeta(member.role);
              return (
                <li key={member.email}>
                  <button
                    type="button"
                    onClick={() => setSelectedEmail(member.email)}
                    className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold",
                          role.avatar,
                        )}
                      >
                        {initials(member.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-semibold text-ink">
                            {member.name}
                          </span>
                          <RolePill role={member.role} />
                          {member.email === meEmail && (
                            <span className="shrink-0 rounded-full bg-mist px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-primary">
                              você
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                          {member.email}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2.5 border-t border-border pt-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            status.dot,
                          )}
                        />
                        <span className="text-[12px] text-ink-soft">
                          {status.label}
                        </span>
                      </span>
                      <span className="flex-1" />
                      <span className="truncate text-[12px] text-ink-faint">
                        {storesLabel(member, stores)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <MemberSheet
        storeId={storeId}
        member={inviting ? null : selected}
        stores={stores}
        meEmail={meEmail}
        meIsAdmin={meIsAdmin}
        open={inviting || selectedEmail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setInviting(false);
            setSelectedEmail(null);
          }
        }}
      />
    </>
  );
}

function RolePill({ role }: { role: TeamMember["role"] }) {
  const meta = roleMeta(role);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
        meta.pill,
      )}
    >
      <meta.icon className="size-2.5" />
      {meta.label}
    </span>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="rounded-[13px] border border-border bg-card px-4 py-3.5">
      <p
        className={cn(
          "tabular text-[26px] font-semibold leading-none tracking-[-0.4px]",
          valueClass,
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11.5px] text-ink-faint">{label}</p>
    </div>
  );
}
