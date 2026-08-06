"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ListFilter,
  LogIn,
  Search,
  ShieldCheck,
  ShieldUser,
  UserCog,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { GrantableSection, Store, TeamMember } from "@/lib/types";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { resendInviteAction } from "@/actions/team";
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

// Grantable-module labels for the "Acesso" column (design Mock
// Equipe.dc.html:96-98, 116, 134-137) — mirrors ACCESS_MODULES in
// member-sheet.tsx, kept as a small standalone map like STATUS_META above.
const SECTION_LABELS: Record<GrantableSection, string> = {
  pedidos: "Pedidos",
  clientes: "Clientes",
  produtos: "Cardápio",
  cartelas: "Cartelas",
  estoque: "Estoque",
  financeiro: "Financeiro",
};

/**
 * A funcionário's granted module labels, in the fixed order above (design
 * order), dropping any legacy/non-grantable values.
 */
function grantedSectionLabels(member: TeamMember): string[] {
  return (Object.keys(SECTION_LABELS) as GrantableSection[])
    .filter((key) => member.sections.includes(key))
    .map((key) => SECTION_LABELS[key]);
}

/**
 * Store suffix appended to a funcionário's email in the "Pessoa" column
 * (design Mock Equipe.dc.html:111,129: "· Passos/MG", "· 2 lojas") — shown
 * only when it adds information beyond "they work at this store".
 */
function storeSuffix(
  member: TeamMember,
  currentStoreId: string,
  stores: Store[],
): string | null {
  if (member.role === "admin" || member.storeIds === "all") return null;
  const ids = member.storeIds;
  if (ids.length === 0) return null;
  if (ids.length === 1) {
    if (ids[0] === currentStoreId) return null;
    return stores.find((s) => s.id === ids[0])?.sub ?? null;
  }
  return `${ids.length} lojas`;
}

/** The "Pessoa" column's second line (design row structure). */
function memberSubline(
  member: TeamMember,
  currentStoreId: string,
  stores: Store[],
): string {
  if (member.status === "convidado") {
    return `Convite enviado ${formatRelative(member.invitedAt)}`;
  }
  const suffix = storeSuffix(member, currentStoreId, stores);
  return suffix ? `${member.email} · ${suffix}` : member.email;
}

/**
 * The "Acesso" column content (design Mock Equipe.dc.html:78-172): access
 * chips for an active funcionário, an all-areas summary for admins, and a
 * plain status note for invited/revoked members.
 */
function AccessSummary({
  member,
  stores,
}: {
  member: TeamMember;
  stores: Store[];
}) {
  if (member.status === "convidado") {
    return <span className="text-[12.5px] text-ink-faint">Definido no aceite</span>;
  }
  if (member.status === "inativo") {
    return <span className="text-[12.5px] text-ink-faint">Acesso revogado</span>;
  }
  if (member.role === "admin") {
    return (
      <span className="text-[12.5px] text-ink-soft">
        Todas as áreas · {stores.length} {stores.length === 1 ? "loja" : "lojas"}
      </span>
    );
  }
  const labels = grantedSectionLabels(member);
  if (labels.length === 0) {
    return <span className="text-[12.5px] text-ink-faint">Nenhuma área liberada</span>;
  }
  const shown = labels.slice(0, 3);
  const extra = labels.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((label) => (
        <span
          key={label}
          className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-soft"
        >
          {label}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[11px] font-semibold text-ink-faint">+{extra}</span>
      )}
    </span>
  );
}

function roleMeta(role: TeamMember["role"]) {
  return role === "admin"
    ? {
        label: "Administrador",
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

  usePageAction({ label: "Convidar", onClick: () => setInviting(true) });

  const selected = members.find((m) => m.email === selectedEmail) ?? null;
  const pendingInvites = members.filter((m) => m.status === "convidado");

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

      {pendingInvites.length > 0 && (
        <InviteBanner storeId={storeId} invites={pendingInvites} />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Nada encontrado"
          description="Tente outra busca ou filtro."
        />
      ) : (
        <>
          {/* Desktop table (design Mock Equipe.dc.html:65-176) */}
          <DataList
            columns="1.3fr 150px 1fr 150px"
            className="hidden min-[820px]:block"
          >
            <DataListHeader>
              <span>Pessoa</span>
              <span>Papel</span>
              <span>Acesso</span>
              <span>Situação</span>
            </DataListHeader>
            {filtered.map((member) => {
              const status = STATUS_META[member.status];
              const role = roleMeta(member.role);
              return (
                <DataListRow
                  key={member.email}
                  onClick={() => setSelectedEmail(member.email)}
                  className={cn(
                    member.status === "inativo" && "opacity-[0.68]",
                  )}
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
                        {memberSubline(member, storeId, stores)}
                      </span>
                    </span>
                  </span>
                  <span>
                    <RolePill role={member.role} />
                  </span>
                  <AccessSummary member={member} stores={stores} />
                  <span>
                    <StatusPill status={status} />
                  </span>
                </DataListRow>
              );
            })}
          </DataList>

          {/* Mobile cards — same content as the desktop table, stacked. */}
          <ul className="space-y-2.5 min-[820px]:hidden">
            {filtered.map((member) => {
              const status = STATUS_META[member.status];
              const role = roleMeta(member.role);
              return (
                <li key={member.email}>
                  <button
                    type="button"
                    onClick={() => setSelectedEmail(member.email)}
                    className={cn(
                      "flex w-full flex-col gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]",
                      member.status === "inativo" && "opacity-[0.68]",
                    )}
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
                          {memberSubline(member, storeId, stores)}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-2.5 border-t border-border pt-3">
                      <StatusPill status={status} />
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <AccessSummary member={member} stores={stores} />
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

/**
 * Amber "convite aguardando aceite" banner with a "Reenviar" action (design
 * Mock Equipe.dc.html:56-63) — shown above the list whenever at least one
 * invite is still pending acceptance.
 */
function InviteBanner({
  storeId,
  invites,
}: {
  storeId: string;
  invites: TeamMember[];
}) {
  const [pending, startTransition] = useTransition();
  const first = invites[0];

  function resend() {
    startTransition(async () => {
      const result = await resendInviteAction(storeId, first.email);
      if (result.ok) {
        toast.success("Convite reenviado.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber/25 bg-amber-wash/50 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F6EAC6] text-[#8A6312]">
        <LogIn className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-[#8A6312]">
          {invites.length === 1
            ? "1 convite aguardando aceite"
            : `${invites.length} convites aguardando aceite`}
        </span>
        <span className="block truncate text-[12px] text-amber/70">
          {invites.length === 1
            ? `${first.name} · enviado ${formatRelative(first.invitedAt)} para ${first.email}`
            : invites.map((m) => m.name).join(", ")}
        </span>
      </span>
      {invites.length === 1 && (
        <button
          type="button"
          onClick={resend}
          disabled={pending}
          className="shrink-0 text-[12.5px] font-bold text-amber transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {pending ? "Enviando…" : "Reenviar →"}
        </button>
      )}
    </div>
  );
}

/** "Situação" badge (design Mock Equipe.dc.html): a filled pill, not a dot. */
function StatusPill({
  status,
}: {
  status: { label: string; fg: string; bg: string };
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold",
        status.bg,
        status.fg,
      )}
    >
      {status.label}
    </span>
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
