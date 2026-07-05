"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import type { Section, Store, TeamMember } from "@/lib/types";
import { SECTIONS } from "@/lib/types";
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

const SECTION_LABELS: Record<Section, string> = {
  pedidos: "Pedidos",
  clientes: "Clientes",
  produtos: "Catálogo",
  estoque: "Estoque",
  financeiro: "Financeiro",
  equipe: "Equipe",
};

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
          <SheetTitle className="text-[17px] font-bold">
            {member ? member.name : "Novo membro"}
          </SheetTitle>
          {member && (
            <p className="text-[11.5px] text-ink-faint">{member.email}</p>
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
  const [sections, setSections] = useState<Section[]>(
    (member?.sections as Section[]) ?? ["pedidos", "clientes", "estoque"],
  );
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
        sections: role === "admin" ? [...SECTIONS] : sections,
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

  return (
    <>
      <div className="flex-1 space-y-4 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="member-name">Nome</Label>
          <Input
            id="member-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ana Souza"
            disabled={locked}
            className="rounded-xl"
          />
        </div>

        {!member && (
          <div className="space-y-1.5">
            <Label htmlFor="member-email">E-mail (conta Google)</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ana@gmail.com"
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
            placeholder="(27) 99999-0000"
            inputMode="tel"
            disabled={locked}
            className="rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Permissão</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={locked || !meIsAdmin}
              onClick={() => setRole("funcionario")}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
                role === "funcionario"
                  ? "border-primary bg-mist text-primary"
                  : "border-border bg-card text-ink-soft",
              )}
            >
              Funcionário
            </button>
            <button
              type="button"
              disabled={locked || !meIsAdmin}
              onClick={() => setRole("admin")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50",
                role === "admin"
                  ? "border-amber bg-amber-wash text-amber"
                  : "border-border bg-card text-ink-soft",
              )}
            >
              <ShieldCheck className="size-4" />
              Admin
            </button>
          </div>
        </div>

        {role === "admin" ? (
          <p className="rounded-xl bg-surface px-3.5 py-3 text-[12.5px] leading-normal text-ink-soft">
            Administradores acessam todas as lojas e todas as áreas do painel.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Lojas</Label>
              <div className="space-y-2">
                {stores.map((store) => {
                  const checked = storeIds.includes(store.id);
                  return (
                    <label
                      key={store.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-paper px-3.5 py-2.5"
                    >
                      <span className="text-[13px] font-semibold text-ink">
                        {store.name}
                        <span className="ml-1.5 font-normal text-ink-faint">
                          {store.sub}
                        </span>
                      </span>
                      <Switch
                        checked={checked}
                        disabled={locked}
                        onCheckedChange={(on) =>
                          setStoreIds(
                            on
                              ? [...storeIds, store.id]
                              : storeIds.filter((id) => id !== store.id),
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Áreas de acesso</Label>
              <div className="grid grid-cols-2 gap-2">
                {SECTIONS.map((section) => {
                  const checked = sections.includes(section);
                  return (
                    <label
                      key={section}
                      className="flex items-center justify-between rounded-xl border border-border bg-paper px-3 py-2.5"
                    >
                      <span className="text-[12.5px] font-semibold text-ink">
                        {SECTION_LABELS[section]}
                      </span>
                      <Switch
                        checked={checked}
                        disabled={locked}
                        onCheckedChange={(on) =>
                          setSections(
                            on
                              ? [...sections, section]
                              : sections.filter((s) => s !== section),
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {member && !isSelf && (
          <Button
            variant="ghost"
            onClick={toggleStatus}
            disabled={pending || locked}
            className={cn(
              "w-full gap-1.5 rounded-xl",
              member.status === "inativo"
                ? "text-primary hover:bg-mist hover:text-primary"
                : "text-destructive hover:bg-danger-wash hover:text-destructive",
            )}
          >
            {member.status === "inativo" ? (
              <>
                <UserCheck className="size-4" /> Reativar acesso
              </>
            ) : (
              <>
                <UserX className="size-4" /> Desativar acesso
              </>
            )}
          </Button>
        )}

        {isSelf && (
          <p className="rounded-xl bg-surface px-3.5 py-3 text-[12.5px] text-ink-soft">
            Você não pode alterar o próprio acesso.
          </p>
        )}
      </div>

      <SheetFooter className="flex-row gap-2 border-t border-border">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={pending}
          className="flex-1 rounded-xl"
        >
          Fechar
        </Button>
        <Button
          onClick={submit}
          disabled={
            pending ||
            locked ||
            !name.trim() ||
            (!member && !email.trim()) ||
            (role === "funcionario" && storeIds.length === 0)
          }
          className="flex-1 rounded-xl font-semibold"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {member ? "Salvar" : "Enviar convite"}
        </Button>
      </SheetFooter>
    </>
  );
}
