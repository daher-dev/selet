"use client";

import { useMemo, useState } from "react";
import { Plus, Search, ShieldCheck, UserCog, Users } from "lucide-react";
import type { Store, TeamMember } from "@/lib/types";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { MemberSheet } from "./member-sheet";

type RoleFilter = "todos" | "admin" | "funcionario";

const STATUS_META: Record<string, { label: string; fg: string; bg: string }> = {
  ativo: { label: "Ativo", fg: "text-primary", bg: "bg-mint-wash" },
  convidado: { label: "Convidado", fg: "text-info", bg: "bg-info-wash" },
  inativo: { label: "Inativo", fg: "text-ink-faint", bg: "bg-wash" },
};

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

  const selected = members.find((m) => m.email === selectedEmail) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== "todos" && m.role !== roleFilter) return false;
      return (
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      );
    });
  }, [members, query, roleFilter]);

  const adminCount = members.filter((m) => m.role === "admin").length;
  const activeCount = members.filter((m) => m.status === "ativo").length;

  return (
    <>
      <PageHeader
        title="Equipe"
        subtitle="Membros, acessos e permissões."
        action={
          <Button
            onClick={() => setInviting(true)}
            className="gap-1.5 rounded-xl font-semibold"
          >
            <Plus className="size-4" />
            Novo membro
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <Stat icon={Users} label="Membros" value={members.length} />
        <Stat icon={ShieldCheck} label="Admins" value={adminCount} />
        <Stat icon={UserCog} label="Ativos" value={activeCount} />
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="rounded-xl bg-card pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(
            [
              { key: "todos", label: "Todos" },
              { key: "admin", label: "Admins" },
              { key: "funcionario", label: "Funcionários" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setRoleFilter(f.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                roleFilter === f.key
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-ink-soft hover:border-primary/40",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="Nada encontrado"
          description="Tente outra busca ou filtro."
        />
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((member) => {
            const status = STATUS_META[member.status];
            return (
              <li key={member.email}>
                <button
                  type="button"
                  onClick={() => setSelectedEmail(member.email)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(24,107,65,.28)]"
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold",
                      member.role === "admin"
                        ? "bg-amber-wash text-amber"
                        : "bg-mist text-primary",
                    )}
                  >
                    {initials(member.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-semibold text-ink">
                        {member.name}
                      </span>
                      {member.email === meEmail && (
                        <span className="shrink-0 rounded-full bg-mist px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-primary">
                          você
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-faint">
                      {member.email}
                      {member.role === "admin"
                        ? " · Administrador"
                        : ` · ${member.sections.length} ${member.sections.length === 1 ? "área" : "áreas"}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold",
                        status.bg,
                        status.fg,
                      )}
                    >
                      {status.label}
                    </span>
                    {member.firstLoginAt && (
                      <span className="text-[10.5px] text-ink-faint">
                        visto {formatRelative(member.firstLoginAt)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-3 text-center">
      <Icon className="mx-auto size-4 text-primary" />
      <p className="tabular mt-1 text-[20px] font-bold leading-none text-ink">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
    </div>
  );
}
