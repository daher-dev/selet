"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  Calendar,
  Check,
  CircleCheck,
  CircleDollarSign,
  Inbox,
  LogIn,
  Loader2,
  Mail,
  Package,
  Phone,
  ShieldCheck,
  ShieldUser,
  Tag,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { GrantableSection, Store, TeamMember } from "@/lib/types";
import { GRANTABLE_SECTIONS } from "@/lib/types";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  inviteMemberAction,
  setMemberStatusAction,
  updateMemberAction,
} from "@/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const STATUS_META: Record<
  string,
  { label: string; fg: string; bg: string; dot: string }
> = {
  ativo: { label: "Ativo", fg: "text-success", bg: "bg-mint-wash", dot: "bg-success" },
  convidado: { label: "Convidado", fg: "text-amber", bg: "bg-amber-wash", dot: "bg-amber" },
  inativo: { label: "Inativo", fg: "text-ink-faint", bg: "bg-wash", dot: "bg-ink-faint" },
};

// The exactly-five modules a funcionário can be granted (design aclSections,
// Selet Admin.dc.html:2415-2423). "equipe" is deliberately absent — team
// management is admin-only.
const ACCESS_MODULES: {
  key: GrantableSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "pedidos", label: "Pedidos", icon: Inbox },
  { key: "clientes", label: "Clientes", icon: Users },
  { key: "produtos", label: "Catálogo", icon: Tag },
  { key: "estoque", label: "Estoque", icon: Package },
  { key: "financeiro", label: "Financeiro", icon: CircleDollarSign },
];

const ROLE_DESC = {
  admin:
    "Acesso total: gerencia catálogo, estoque, finanças, pedidos e equipe em todas as lojas.",
  funcionario:
    "Acesso operacional: registra pedidos, dá baixa no estoque e atende clientes nas lojas atribuídas.",
} as const;

interface MemberSheetProps {
  storeId: string;
  member: TeamMember | null;
  stores: Store[];
  meEmail: string;
  meIsAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemberSheet({
  storeId,
  member,
  stores,
  meEmail,
  meIsAdmin,
  open,
  onOpenChange,
}: MemberSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b border-border">
          {member ? (
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full text-[14px] font-bold",
                  member.role === "admin"
                    ? "bg-[#F6EAC6] text-[#8A6312]"
                    : "bg-mist text-[#3A7D44]",
                )}
              >
                {initials(member.name)}
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-[17px] font-bold">
                  {member.name}
                </SheetTitle>
                <p className="truncate text-[11.5px] text-ink-faint">
                  {member.email}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  STATUS_META[member.status].bg,
                  STATUS_META[member.status].fg,
                )}
              >
                {STATUS_META[member.status].label}
              </span>
            </div>
          ) : (
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-leaf">
                Novo membro
              </span>
              <SheetTitle className="mt-0.5 text-[19px] font-bold">
                Convidar para a equipe
              </SheetTitle>
            </div>
          )}
        </SheetHeader>
        <MemberForm
          key={member?.email ?? "new"}
          storeId={storeId}
          member={member}
          stores={stores}
          meEmail={meEmail}
          meIsAdmin={meIsAdmin}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function MemberForm({
  storeId,
  member,
  stores,
  meEmail,
  meIsAdmin,
  onClose,
}: {
  storeId: string;
  member: TeamMember | null;
  stores: Store[];
  meEmail: string;
  meIsAdmin: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [role, setRole] = useState<"admin" | "funcionario">(
    member?.role ?? "funcionario",
  );
  const [storeIds, setStoreIds] = useState<string[]>(
    member && member.storeIds !== "all" ? member.storeIds : [storeId],
  );
  // Only the five grantable modules are ever tracked here — legacy values (e.g.
  // a stray "equipe") are filtered out so the UI matches the design catalog.
  const [sections, setSections] = useState<GrantableSection[]>(() => {
    const grantable = new Set<string>(GRANTABLE_SECTIONS);
    const current = (member?.sections ?? []).filter((s): s is GrantableSection =>
      grantable.has(s),
    );
    return member ? current : ["pedidos"];
  });
  const [pending, startTransition] = useTransition();

  const isSelf = member?.email === meEmail;
  const locked = isSelf || (member?.role === "admin" && !meIsAdmin);

  function submit() {
    startTransition(async () => {
      const input = {
        storeId,
        email,
        name,
        phone: phone || undefined,
        role,
        storeIds: role === "admin" ? ("all" as const) : storeIds,
        // Admins get access via their role — they carry no per-module grants
        // (matching the seed convention). Funcionários carry their toggles.
        sections: role === "admin" ? [] : sections,
      };
      const result = member
        ? await updateMemberAction(input)
        : await inviteMemberAction(input);
      if (result.ok) {
        toast.success(
          member
            ? "Acessos atualizados."
            : "Convite criado. O membro entra com a conta Google deste e-mail.",
        );
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleStatus() {
    if (!member) return;
    const next = member.status === "inativo" ? "ativo" : "inativo";
    startTransition(async () => {
      const result = await setMemberStatusAction(storeId, member.email, next);
      if (result.ok) {
        toast.success(next === "ativo" ? "Acesso reativado." : "Acesso desativado.");
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  const isAdmin = role === "admin";

  return (
    <>
      <div className="flex-1 space-y-4 p-4">
        {member && (
          <div className="flex flex-wrap gap-2">
            {member.phone && (
              <span className="flex flex-1 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[12.5px] text-ink-soft">
                <Phone className="size-3.5 text-ink-faint" />
                {member.phone}
              </span>
            )}
            <span className="flex flex-1 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2.5 text-[12.5px] text-ink-soft">
              <Calendar className="size-3.5 text-ink-faint" />
              {member.firstLoginAt
                ? `Desde ${formatDate(member.firstLoginAt)}`
                : `Desde ${formatDate(member.invitedAt)}`}
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="member-name">Nome</Label>
          <Input
            id="member-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Marina Alves"
            disabled={locked}
            className="rounded-xl"
          />
        </div>

        {!member && (
          <div className="space-y-1.5">
            <Label htmlFor="member-email">E-mail de acesso (conta Google)</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@selet.com.br"
              className="rounded-xl"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="member-phone">Telefone</Label>
          <Input
            id="member-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(27) 90000-0000"
            inputMode="tel"
            disabled={locked}
            className="rounded-xl"
          />
        </div>

        {/* Role segmented control + description (design 1801-1807) */}
        <div className="space-y-2">
          <Label>Permissão</Label>
          <div className="flex gap-0.5 rounded-[10px] border border-border bg-surface p-[3px]">
            <SegButton
              active={role === "funcionario"}
              disabled={locked || !meIsAdmin}
              onClick={() => setRole("funcionario")}
              icon={ShieldUser}
              label="Funcionário"
            />
            <SegButton
              active={role === "admin"}
              disabled={locked || !meIsAdmin}
              onClick={() => setRole("admin")}
              icon={ShieldCheck}
              label="Admin"
            />
          </div>
          <p className="text-[11.5px] leading-relaxed text-ink-faint">
            {ROLE_DESC[role]}
          </p>
        </div>

        {/* Store access — shown for both roles; admins locked to all (design
            1809-1821). */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            Acesso às lojas
            {isAdmin && (
              <span className="font-semibold normal-case tracking-normal text-ink-faint">
                · admin acessa todas
              </span>
            )}
          </Label>
          <div className="space-y-2">
            {stores.map((store) => {
              const checked = isAdmin || storeIds.includes(store.id);
              const disabled = locked || isAdmin;
              return (
                <button
                  key={store.id}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setStoreIds(
                      checked
                        ? storeIds.filter((id) => id !== store.id)
                        : [...storeIds, store.id],
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                    checked
                      ? "border-primary bg-primary/[0.05]"
                      : "border-border bg-card",
                    disabled ? "cursor-default" : "cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold",
                      checked
                        ? "bg-primary/[0.12] text-primary"
                        : "bg-mist text-ink-faint",
                    )}
                  >
                    {store.initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {store.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {store.sub}
                    </span>
                  </span>
                  {checked && (
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-primary text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Per-module access — funcionários only (design 1823-1834) */}
        {!isAdmin && (
          <div className="space-y-2">
            <Label>Áreas que pode acessar</Label>
            <div className="space-y-1.5">
              {ACCESS_MODULES.map((mod) => {
                const checked = sections.includes(mod.key);
                return (
                  <label
                    key={mod.key}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                      checked
                        ? "border-primary/40 bg-primary/[0.04]"
                        : "border-border bg-card",
                      locked ? "cursor-default" : "cursor-pointer",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-[30px] shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                        checked
                          ? "bg-primary/[0.12] text-primary"
                          : "bg-mist text-ink-faint",
                      )}
                    >
                      <mod.icon />
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-[13.5px] font-semibold",
                        checked ? "text-ink" : "text-ink-faint",
                      )}
                    >
                      {mod.label}
                    </span>
                    <Switch
                      checked={checked}
                      disabled={locked}
                      onCheckedChange={(on) =>
                        setSections(
                          on
                            ? [...sections, mod.key]
                            : sections.filter((s) => s !== mod.key),
                        )
                      }
                    />
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {member && (
          <div className="space-y-2">
            <Label>Atividade recente</Label>
            {/* Honest milestone timeline from the dates on TeamMember. A rich
                per-action activity feed (produced X, edited price, registered
                order…) is a Phase-3 deliverable — the ActivityEntry pipeline
                that writes/reads those events is not built yet, so we surface
                only the real invite/first-login/status milestones rather than
                fabricate a persisted feed.
                TODO(phase-3): render TeamMember activity events once the
                ActivityEntry collection is written and read (see plan
                "Activity feed" — design 1837-1851). */}
            <div className="rounded-xl border border-border bg-paper">
              <TimelineRow
                icon={Mail}
                label="Convite enviado"
                detail={formatDate(member.invitedAt)}
              />
              {member.firstLoginAt && (
                <TimelineRow
                  icon={LogIn}
                  label="Primeiro acesso"
                  detail={formatDate(member.firstLoginAt)}
                  bordered
                />
              )}
              <div className="flex items-center gap-3 border-t border-border px-3.5 py-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg",
                    STATUS_META[member.status].bg,
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      STATUS_META[member.status].dot,
                    )}
                  />
                </span>
                <span className="text-[12.5px] font-semibold text-ink">
                  Status atual:{" "}
                  <span className={STATUS_META[member.status].fg}>
                    {STATUS_META[member.status].label}
                  </span>
                </span>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              O histórico detalhado de ações da equipe chega em breve.
            </p>
          </div>
        )}

        {isSelf && (
          <p className="rounded-xl bg-surface px-3.5 py-3 text-[12.5px] text-ink-soft">
            Você não pode alterar o próprio acesso.
          </p>
        )}
      </div>

      <SheetFooter className="flex-col gap-2 border-t border-border">
        {member && !isSelf && (
          <Button
            onClick={toggleStatus}
            disabled={pending || locked}
            className={cn(
              "w-full gap-1.5 rounded-xl font-semibold",
              member.status === "inativo"
                ? "bg-primary text-white hover:bg-primary/90"
                : "border border-[#E7C7BD] bg-[#FCF6F4] text-[#C0492F] shadow-none hover:bg-[#F8ECE8]",
            )}
          >
            {member.status === "inativo" ? (
              <>
                <CircleCheck className="size-4" /> Reativar acesso
              </>
            ) : (
              <>
                <Ban className="size-4" /> Desativar acesso
              </>
            )}
          </Button>
        )}
        <div className="flex w-full gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-xl"
          >
            {member ? "Fechar" : "Cancelar"}
          </Button>
          {!locked && (
            <Button
              onClick={submit}
              disabled={
                pending ||
                !name.trim() ||
                (!member && !email.trim()) ||
                (role === "funcionario" && storeIds.length === 0)
              }
              className="flex-[1.6] gap-1.5 rounded-xl font-semibold"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : member ? null : (
                <Mail className="size-4" />
              )}
              {member ? "Salvar" : "Enviar convite"}
            </Button>
          )}
        </div>
      </SheetFooter>
    </>
  );
}

function SegButton({
  active,
  disabled,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50",
        active
          ? "bg-primary text-white shadow-[0_2px_6px_-2px_rgba(24,107,65,0.5)]"
          : "text-ink-soft hover:text-ink",
      )}
    >
      <Icon className="size-[15px]" />
      {label}
    </button>
  );
}

function TimelineRow({
  icon: Icon,
  label,
  detail,
  bordered = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3.5 py-3",
        bordered && "border-t border-border",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-mist text-primary">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-ink">
          {label}
        </span>
        <span className="block text-[11px] text-ink-faint">{detail}</span>
      </span>
    </div>
  );
}
