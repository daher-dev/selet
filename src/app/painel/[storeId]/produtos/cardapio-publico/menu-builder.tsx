"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  CupSoda,
  Ellipsis,
  EyeOff,
  FileText,
  GripVertical,
  ImageOff,
  Lock,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Smartphone,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { publishMenuAction, saveMenuDraftAction, unpublishMenuAction } from "@/actions/menu";
import { MenuPrintStyles, MenuView, type MenuEditSlots, type MenuStoreInfo, type MenuTextSlot } from "@/components/menu/menu-view";
import { usePageAction, usePageHeader } from "@/components/shell/app-shell-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIcon,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MENU_TAGS,
  MENU_TAG_LABELS,
  entryDefaults,
  entryKey,
  mixKindOf,
  newSectionId,
  resolveMenu,
  type MenuCatalog,
  type MenuDoc,
  type MenuEntry,
  type MenuState,
  type MixKind,
} from "@/lib/menu";
import { cn } from "@/lib/utils";
import { MenuPicker } from "./menu-picker";
import { uploadMenuPhoto } from "./menu-photo";
import { MixBuilder } from "./mix-builder";
import { PrintPortal, SharePanel, TablePosters } from "./menu-share";

interface Props {
  storeId: string;
  catalog: MenuCatalog;
  initial: MenuState;
  store: MenuStoreInfo;
  url: string;
}

type View = "screen" | "print";

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/**
 * Cardápio público builder: the menu is edited in place, rendered by the same
 * MenuView customers get (phone or A4). Edits autosave as a draft; "Publicar"
 * puts the draft on the link. Prices are never edited here.
 */
export function MenuBuilder({ storeId, catalog, initial, store, url }: Props) {
  usePageHeader({ title: "Cardápio público", subtitle: "O que o cliente vê no link, no QR code e no impresso" });
  usePageAction(null);

  const [doc, setDoc] = useState<MenuDoc>(initial.draft);
  const [published, setPublished] = useState(initial.published);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [view, setView] = useState<View>("screen");
  const [picker, setPicker] = useState<number | null>(null);
  const [share, setShare] = useState(false);
  const [printing, setPrinting] = useState<"menu" | "posters" | null>(null);
  const [publishing, startPublish] = useTransition();
  /** The suggestion being built: new in section `si`, or editing entry `ei`. */
  const [builder, setBuilder] = useState<{ kind: MixKind; si: number; ei?: number; n: number } | null>(null);

  const sections = useMemo(() => resolveMenu(doc, catalog, { keepUnavailable: true }), [doc, catalog]);
  const publicSections = useMemo(() => resolveMenu(doc, catalog), [doc, catalog]);
  const dirty = JSON.stringify(doc) !== JSON.stringify(published);
  const inMenu = useMemo(() => {
    const m = new Map<string, string>();
    doc.sections.forEach((s) => s.entries.forEach((e) => m.set(entryKey(e), s.title || "Sem nome")));
    return m;
  }, [doc]);

  // Autosave the draft shortly after the last edit (the first render is the saved state).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("saving");
    const t = setTimeout(async () => {
      const r = await saveMenuDraftAction(storeId, doc);
      setSave(r.ok ? "saved" : "error");
      if (!r.ok) toast.error(r.error ?? "Não foi possível salvar o rascunho.");
    }, 700);
    return () => clearTimeout(t);
  }, [doc, storeId]);

  useEffect(() => {
    if (save !== "saving") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  function update(fn: (d: MenuDoc) => void) {
    setDoc((d) => {
      const next = structuredClone(d);
      fn(next);
      return next;
    });
  }

  function patchEntry(si: number, ei: number, patch: Partial<MenuEntry>) {
    update((d) => {
      const e = d.sections[si].entries[ei];
      Object.assign(e, patch);
      for (const k of Object.keys(patch) as (keyof MenuEntry)[]) if (patch[k] === undefined) delete e[k];
    });
  }

  function removeEntry(si: number, ei: number) {
    const before = doc;
    const name = sections[si].entries[ei].name;
    update((d) => void d.sections[si].entries.splice(ei, 1));
    toast(`${name} saiu do cardápio`, { action: { label: "Desfazer", onClick: () => setDoc(before) } });
  }

  function moveEntry(from: { si: number; ei: number }, to: { si: number; ei: number }) {
    update((d) => {
      const [e] = d.sections[from.si].entries.splice(from.ei, 1);
      const ei = from.si === to.si && from.ei < to.ei ? to.ei - 1 : to.ei;
      d.sections[to.si].entries.splice(ei, 0, e);
    });
  }

  function moveSection(si: number, dir: -1 | 1) {
    update((d) => {
      const [s] = d.sections.splice(si, 1);
      d.sections.splice(si + dir, 0, s);
    });
  }

  function removeSection(si: number) {
    const before = doc;
    const title = doc.sections[si].title || "Seção";
    update((d) => void d.sections.splice(si, 1));
    toast(`${title} saiu do cardápio`, { action: { label: "Desfazer", onClick: () => setDoc(before) } });
  }

  function addSection() {
    update((d) => void d.sections.push({ id: newSectionId(d.sections.map((s) => s.id)), title: "Nova seção", entries: [] }));
    setPicker(doc.sections.length);
  }

  function setText(slot: MenuTextSlot, raw: string) {
    const f = slot.field;
    update((d) => {
      if (f.kind === "title") d.title = raw;
      else if (f.kind === "tagline") d.tagline = raw;
      else if (f.kind === "section") {
        const s = d.sections[f.si];
        if (raw || f.key === "title") s[f.key] = raw;
        else delete s[f.key];
      } else {
        const e = d.sections[f.si].entries[f.ei];
        const original = f.key === "caption" ? "" : entryDefaults(e, catalog)[f.key];
        // Typing the catalog text back (or clearing it) means "follow the Cardápio" again.
        if (!raw.trim() || raw === original) delete e[f.key];
        else e[f.key] = raw;
      }
    });
  }

  function publish() {
    startPublish(async () => {
      const r = await publishMenuAction(storeId, doc);
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível publicar.");
      setPublished(structuredClone(doc));
      setPublishedAt(r.publishedAt ?? new Date().toISOString());
      setSave("saved");
      toast.success("Cardápio publicado. O link e o QR code já mostram esta versão.");
    });
  }

  function unpublish() {
    startPublish(async () => {
      const r = await unpublishMenuAction(storeId);
      if (!r.ok) return void toast.error(r.error ?? "Algo deu errado.");
      setPublished(null);
      toast("O link do cardápio saiu do ar. O rascunho continua aqui.");
    });
  }

  // ------------------------------------------------------------ photos
  const fileInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<{ si: number; ei: number } | "cover" | null>(null);

  function pickPhoto(target: { si: number; ei: number } | "cover") {
    photoTarget.current = target;
    fileInput.current?.click();
  }

  async function onPhoto(file: File | undefined) {
    const target = photoTarget.current;
    if (!file || !target) return;
    const t = toast.loading("Enviando foto…");
    try {
      const id = await uploadMenuPhoto(storeId, file);
      update((d) => {
        if (target === "cover") d.coverPhoto = id;
        else d.sections[target.si].entries[target.ei].photo = id;
      });
      toast.success("Foto adicionada.", { id: t });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar a foto.", { id: t });
    }
  }

  // ------------------------------------------------------------ drag & drop
  const [armed, setArmed] = useState<string | null>(null);
  const drag = useRef<{ si: number; ei: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const edit: MenuEditSlots = {
    text: (slot) => {
      const f = slot.field;
      let value = slot.value;
      if (f.kind === "entry") {
        const e = doc.sections[f.si].entries[f.ei];
        value = e[f.key] ?? (f.key === "caption" ? "" : entryDefaults(e, catalog)[f.key]);
      }
      return (
        <EditableText
          slot={slot}
          value={value}
          placeholder={f.kind === "entry" && f.key !== "name" ? slot.placeholder || "Adicionar descrição" : slot.placeholder}
          onChange={(v) => setText(slot, v)}
        />
      );
    },
    entryProps: (si, ei) => {
      const key = entryKey(doc.sections[si].entries[ei]);
      return {
        draggable: armed === key,
        onDragStart: (ev) => {
          drag.current = { si, ei };
          ev.dataTransfer.effectAllowed = "move";
        },
        onDragEnd: () => {
          drag.current = null;
          setArmed(null);
          setOver(null);
        },
        onDragOver: (ev) => {
          if (!drag.current) return;
          ev.preventDefault();
          setOver(key);
        },
        onDrop: (ev) => {
          ev.preventDefault();
          if (drag.current) moveEntry(drag.current, { si, ei });
        },
        style: over === key && drag.current ? { boxShadow: "0 0 0 2px #186B41", transform: "translateY(2px)" } : undefined,
      };
    },
    entryChrome: (e, si, ei) => {
      const s = doc.sections[si];
      const isFirst = si === 0 && ei === 0;
      const isLast = si === doc.sections.length - 1 && ei === s.entries.length - 1;
      return (
        <>
          {!e.available && (
            <div className={cn("mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-wash px-2.5 py-1 text-[11px] font-semibold text-amber", e.entry.photo && "absolute left-3 top-3 z-[1] mb-0")}>
              <EyeOff className="size-3" strokeWidth={2} />
              {mixKindOf(e.entry.source)
                ? "Um ingrediente foi arquivado · o cliente não vê"
                : e.kind === "table"
                  ? "Sem adicionais ativos · o cliente não vê"
                  : "Arquivado no Cardápio · o cliente não vê"}
            </div>
          )}
          <div className="absolute -top-3.5 right-2 z-10 flex items-center gap-0.5 rounded-full border border-[#E7EEE6] bg-white p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within/entry:opacity-100 group-hover/entry:opacity-100 [@media(hover:none)]:opacity-100 print:hidden">
            <button
              type="button"
              aria-label={`Arrastar ${e.name}`}
              title="Arraste para mudar de lugar"
              onPointerDown={() => setArmed(e.key)}
              onPointerUp={() => setArmed(null)}
              className="flex size-7 cursor-grab items-center justify-center rounded-full text-ink-faint hover:bg-mist hover:text-ink active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </button>
            {e.kind === "item" && (
              <button
                type="button"
                aria-label={e.entry.photo ? `Trocar foto de ${e.name}` : `Foto de ${e.name}`}
                title="Item com foto vira destaque"
                onClick={() => pickPhoto({ si, ei })}
                className={cn("flex size-7 items-center justify-center rounded-full hover:bg-mist", e.entry.photo ? "text-primary" : "text-ink-faint hover:text-ink")}
              >
                <Camera className="size-3.5" />
              </button>
            )}
            {e.kind === "item" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Selo de ${e.name}`} className={cn("flex size-7 items-center justify-center rounded-full hover:bg-mist", e.tag ? "text-amber" : "text-ink-faint hover:text-ink")}>
                  <Tag className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {MENU_TAGS.map((t) => (
                  <DropdownMenuItem key={t} active={e.tag === t} onSelect={() => patchEntry(si, ei, { tag: e.tag === t ? undefined : t })}>
                    {MENU_TAG_LABELS[t]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem active={!e.tag} onSelect={() => patchEntry(si, ei, { tag: undefined })}>
                  Sem selo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Mais ações de ${e.name}`} className="flex size-7 items-center justify-center rounded-full text-ink-faint hover:bg-mist hover:text-ink">
                  <Ellipsis className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuItem disabled={isFirst} onSelect={() => moveEntry({ si, ei }, ei > 0 ? { si, ei: ei - 1 } : { si: si - 1, ei: doc.sections[si - 1].entries.length })}>
                  <DropdownMenuItemIcon><ArrowUp /></DropdownMenuItemIcon>
                  Subir
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isLast} onSelect={() => moveEntry({ si, ei }, ei < s.entries.length - 1 ? { si, ei: ei + 2 } : { si: si + 1, ei: 0 })}>
                  <DropdownMenuItemIcon><ArrowDown /></DropdownMenuItemIcon>
                  Descer
                </DropdownMenuItem>
                {doc.sections.length > 1 && <DropdownMenuSeparator />}
                {doc.sections.map((t, ti) =>
                  ti === si ? null : (
                    <DropdownMenuItem key={t.id} onSelect={() => moveEntry({ si, ei }, { si: ti, ei: t.entries.length })}>
                      Mover para {t.title || "Sem nome"}
                    </DropdownMenuItem>
                  ),
                )}
                {mixKindOf(e.entry.source) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setBuilder({ kind: mixKindOf(e.entry.source)!, si, ei, n: Date.now() })}>
                      <DropdownMenuItemIcon><CupSoda /></DropdownMenuItemIcon>
                      Editar montagem
                    </DropdownMenuItem>
                  </>
                )}
                {e.entry.photo && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => patchEntry(si, ei, { photo: undefined, caption: undefined })}>
                      <DropdownMenuItemIcon><ImageOff /></DropdownMenuItemIcon>
                      Remover foto
                    </DropdownMenuItem>
                  </>
                )}
                {!mixKindOf(e.entry.source) && (e.entry.name !== undefined || e.entry.description !== undefined) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => patchEntry(si, ei, { name: undefined, description: undefined })}>
                      <DropdownMenuItemIcon><RotateCcw /></DropdownMenuItemIcon>
                      Usar nome e descrição do Cardápio
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              aria-label={`Tirar ${e.name} do cardápio`}
              onClick={() => removeEntry(si, ei)}
              className="flex size-7 items-center justify-center rounded-full text-ink-faint hover:bg-danger-wash hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </>
      );
    },
    entryFooter: (e, si, ei) => {
      const kind = mixKindOf(e.entry.source);
      if (!kind || !e.mixPicks.length) return null;
      return (
        <button
          type="button"
          onClick={() => setBuilder({ kind, si, ei, n: Date.now() })}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-[#C9D8C4] bg-white px-2.5 py-1 text-left text-[11px] font-semibold text-primary hover:border-primary print:hidden",
            e.entry.photo ? "mx-4 mb-3.5" : "mt-2",
          )}
        >
          <CupSoda className="size-3 shrink-0" />
          <span className="truncate">
            {kind === "shake" ? "Shake" : "Pudim"} montado · {e.mixPicks.join(", ")}
          </span>
          <span className="shrink-0 text-ink-faint">· editar</span>
        </button>
      );
    },
    coverPhoto: () =>
      doc.coverPhoto ? (
        <div className="absolute right-3 top-3 flex gap-1.5 print:hidden">
          <button type="button" onClick={() => pickPhoto("cover")} className="flex h-8 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[12px] font-semibold text-ink shadow-sm hover:bg-white">
            <Camera className="size-3.5" />
            Trocar foto
          </button>
          <button
            type="button"
            aria-label="Remover foto de capa"
            onClick={() => update((d) => void delete d.coverPhoto)}
            className="flex size-8 items-center justify-center rounded-full bg-white/95 text-ink-soft shadow-sm hover:bg-white hover:text-destructive"
          >
            <ImageOff className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => pickPhoto("cover")}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-white/35 bg-white/[.06] text-[13px] font-semibold text-white transition-colors hover:bg-white/[.12] print:hidden"
        >
          <Camera className="size-4" />
          Adicionar foto de capa
        </button>
      ),
    sectionChrome: (si) => {
      const s = doc.sections[si];
      return (
        <div className="absolute -top-4 right-0 z-10 flex items-center gap-0.5 rounded-full border border-[#E7EEE6] bg-white p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within/section:opacity-100 group-hover/section:opacity-100 [@media(hover:none)]:opacity-100">
          {view === "print" && si > 0 && (
            <button
              type="button"
              aria-pressed={!!s.newPage}
              onClick={() => update((d) => void (d.sections[si].newPage ? delete d.sections[si].newPage : (d.sections[si].newPage = true)))}
              className={cn("flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-semibold", s.newPage ? "bg-mist text-primary" : "text-ink-faint hover:bg-mist hover:text-ink")}
            >
              <FileText className="size-3.5" />
              Começa em nova página
            </button>
          )}
          <button type="button" aria-label={`Subir seção ${s.title}`} disabled={si === 0} onClick={() => moveSection(si, -1)} className="flex size-7 items-center justify-center rounded-full text-ink-faint hover:bg-mist hover:text-ink disabled:opacity-30">
            <ArrowUp className="size-3.5" />
          </button>
          <button type="button" aria-label={`Descer seção ${s.title}`} disabled={si === doc.sections.length - 1} onClick={() => moveSection(si, 1)} className="flex size-7 items-center justify-center rounded-full text-ink-faint hover:bg-mist hover:text-ink disabled:opacity-30">
            <ArrowDown className="size-3.5" />
          </button>
          <button type="button" aria-label={`Excluir seção ${s.title}`} onClick={() => removeSection(si)} className="flex size-7 items-center justify-center rounded-full text-ink-faint hover:bg-danger-wash hover:text-destructive">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      );
    },
    sectionEnd: (si) => (
      <button
        type="button"
        onClick={() => setPicker(si)}
        onDragOver={(ev) => drag.current && ev.preventDefault()}
        onDrop={(ev) => {
          ev.preventDefault();
          if (drag.current) moveEntry(drag.current, { si, ei: doc.sections[si].entries.length });
        }}
        className="mt-2.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-[#C9D8C4] text-[13px] font-semibold text-primary transition-colors hover:border-primary hover:bg-mist print:hidden"
      >
        <Plus className="size-3.5" strokeWidth={2.4} />
        {doc.sections[si].entries.length ? "Adicionar itens" : "Adicionar itens a esta seção"}
      </button>
    ),
    menuEnd: () => (
      <button
        type="button"
        onClick={addSection}
        className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#C9D8C4] font-display text-[22px] font-semibold text-primary transition-colors hover:border-primary hover:bg-mist print:hidden"
      >
        <Plus className="size-4" strokeWidth={2.4} />
        Nova seção
      </button>
    ),
  };

  const viewProps = { storeId, doc, store, url, updatedAt: publishedAt };
  const status = !published
    ? { dot: "bg-ink-faint", text: "Fora do ar · ainda não publicado" }
    : { dot: "bg-channel-whatsapp", text: `No ar · publicado ${when(publishedAt ?? "")}` };

  return (
    <div className="-mx-3.5 -mt-4 min-[820px]:-mx-7 min-[820px]:-mt-[26px]">
      <MenuPrintStyles />
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#E7EEE6] bg-white/95 px-3.5 py-2.5 backdrop-blur min-[820px]:px-7">
        <Link href={`/painel/${storeId}/produtos`} className="flex size-8 items-center justify-center rounded-lg text-ink-faint hover:bg-mist hover:text-ink" aria-label="Voltar ao Cardápio">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <span className={cn("size-2 shrink-0 rounded-full", status.dot)} />
            <span className="truncate">{status.text}</span>
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
            {save === "saving" ? "Salvando rascunho…" : save === "error" ? "Rascunho não salvo" : (
              <>
                <Check className="size-3" strokeWidth={2.4} />
                Rascunho salvo
              </>
            )}
            {dirty && published && <span className="rounded-full bg-amber-wash px-2 py-px font-semibold text-amber">alterações não publicadas</span>}
          </span>
        </div>

        <div role="radiogroup" aria-label="Visualizar como" className="mx-auto flex rounded-[11px] bg-mist p-[3px]">
          {([
            ["screen", Smartphone, "Celular"],
            ["print", FileText, "Impresso A4"],
          ] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cn("flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold transition-colors", view === v ? "bg-white text-primary shadow-sm" : "text-ink-soft hover:text-ink")}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShare(true)} className="h-9 rounded-[10px] px-3 text-[13px] font-semibold">
            <QrCode className="size-3.5" />
            <span className="max-[560px]:sr-only">Link e QR code</span>
          </Button>
          <Button variant="outline" onClick={() => setPrinting("menu")} className="h-9 rounded-[10px] px-3 text-[13px] font-semibold">
            <Printer className="size-3.5" />
            <span className="max-[560px]:sr-only">Imprimir</span>
          </Button>
          <Button onClick={publish} disabled={publishing || (!dirty && !!published)} className="h-9 rounded-[10px] px-3.5 text-[13px] font-semibold">
            {!dirty && published ? "Publicado" : "Publicar"}
          </Button>
          {published && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label="Mais opções do cardápio">
                  <Ellipsis className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={url} target="_blank" rel="noreferrer">Abrir como cliente</a>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!dirty} onSelect={() => setDoc(structuredClone(published))}>
                  <DropdownMenuItemIcon><RotateCcw /></DropdownMenuItemIcon>
                  Descartar alterações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={unpublish}>
                  <DropdownMenuItemIcon><EyeOff /></DropdownMenuItemIcon>
                  Tirar do ar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="min-h-[calc(100dvh-140px)] bg-[#E9EFE5] bg-[radial-gradient(#D3DECD_1px,transparent_1px)] bg-size-[18px_18px] px-3 py-8 min-[820px]:px-7">
        <p className="mx-auto mb-5 flex max-w-[680px] items-center justify-center gap-1.5 text-center text-[12.5px] text-ink-soft">
          <Lock className="size-3 shrink-0" />
          Clique num texto para editar. Os preços vêm do Cardápio e de Shakes e Pudim, e se atualizam sozinhos.
        </p>
        {view === "screen" ? (
          <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[34px] border-[7px] border-ink bg-white shadow-[0_30px_70px_-30px_rgba(21,35,28,.6)] max-[480px]:rounded-2xl max-[480px]:border-0">
            <MenuView {...viewProps} sections={sections} mode="screen" edit={edit} />
          </div>
        ) : (
          <Sheet>
            <MenuView {...viewProps} sections={sections} mode="print" edit={edit} />
          </Sheet>
        )}
      </div>

      <MenuPicker
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        sectionTitle={picker !== null ? doc.sections[picker]?.title ?? "" : ""}
        catalog={catalog}
        inMenu={inMenu}
        onAdd={(entries) => {
          const si = picker!;
          update((d) => void d.sections[si].entries.push(...entries));
          setPicker(null);
        }}
        onBuild={(kind) => setBuilder({ kind, si: picker!, n: Date.now() })}
      />
      {builder && (
        <MixBuilder
          key={builder.n}
          kind={builder.kind}
          catalog={catalog[builder.kind]}
          sectionTitle={doc.sections[builder.si]?.title ?? ""}
          initial={(() => {
            const e = builder.ei !== undefined ? doc.sections[builder.si].entries[builder.ei] : undefined;
            return e?.mix ? { name: e.name ?? "", description: e.description, mix: e.mix } : undefined;
          })()}
          onClose={() => setBuilder(null)}
          onSave={({ name, description, mix }) => {
            const { si, ei, kind } = builder;
            update((d) => {
              if (ei !== undefined) {
                const e = d.sections[si].entries[ei];
                Object.assign(e, { name, mix });
                if (description) e.description = description;
                else delete e.description;
              } else {
                d.sections[si].entries.push({
                  source: kind === "shake" ? "shake-mix" : "pudim-mix",
                  id: crypto.randomUUID().slice(0, 8),
                  name,
                  mix,
                  ...(description ? { description } : {}),
                });
              }
            });
            setBuilder(null);
          }}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(ev) => {
          void onPhoto(ev.target.files?.[0]);
          ev.target.value = "";
        }}
      />
      <SharePanel open={share} onOpenChange={setShare} url={url} storeName={store.name} published={!!published} onPrintPosters={() => setPrinting("posters")} />
      {printing && (
        <PrintPortal onDone={() => setPrinting(null)}>
          {printing === "menu" ? <MenuView {...viewProps} sections={publicSections} mode="print" /> : <TablePosters url={url} storeName={store.name} />}
        </PrintPortal>
      )}
    </div>
  );
}

/** The A4 sheet, scaled down to fit narrow screens (zoom keeps clicks and text editing exact). */
function Sheet({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setZoom(Math.min(1, el.clientWidth / 794)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="w-full">
      <div style={{ zoom }} className="mx-auto w-[794px] bg-white shadow-[0_30px_70px_-30px_rgba(21,35,28,.45)]">
        {children}
      </div>
    </div>
  );
}

/** A text that looks exactly like the menu and becomes an input on click. */
function EditableText({
  slot,
  value,
  placeholder,
  onChange,
}: {
  slot: MenuTextSlot;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  });
  return (
    <div className={slot.className}>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(slot.multiline ? e.target.value : e.target.value.replace(/\n/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !slot.multiline) e.currentTarget.blur();
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        className="-mx-1.5 block w-[calc(100%+12px)] resize-none overflow-hidden rounded-md bg-transparent px-1.5 outline-none transition-[background,box-shadow] [font:inherit] [letter-spacing:inherit] [color:inherit] placeholder:text-current placeholder:opacity-35 hover:bg-primary/[.06] focus:bg-white focus:text-ink focus:shadow-[0_0_0_2px_rgba(24,107,65,.45)]"
      />
    </div>
  );
}
