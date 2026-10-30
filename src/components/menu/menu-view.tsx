import type { HTMLAttributes, ReactNode } from "react";
import { SeletLeaf } from "@/components/shell/selet-mark";
import { formatBRL } from "@/lib/format";
import { MENU_TAG_LABELS, photoUrl, type MenuDoc, type ResolvedEntry, type ResolvedSection } from "@/lib/menu";
import { qrPath } from "@/lib/qr";
import { cn } from "@/lib/utils";

/** Which text a slot is editing. */
export type MenuField =
  | { kind: "title" }
  | { kind: "tagline" }
  | { kind: "section"; si: number; key: "title" | "kicker" | "note" }
  | { kind: "entry"; si: number; ei: number; key: "name" | "description" | "caption" };

export interface MenuTextSlot {
  field: MenuField;
  value: string;
  /** What shows when the value is empty (the catalog text for entries). */
  placeholder: string;
  className: string;
  multiline?: boolean;
}

/** The editor plugs these in; without them the view is the plain customer menu. */
export interface MenuEditSlots {
  text: (p: MenuTextSlot) => ReactNode;
  entryChrome: (e: ResolvedEntry, si: number, ei: number) => ReactNode;
  entryFooter: (e: ResolvedEntry, si: number, ei: number) => ReactNode;
  entryProps: (si: number, ei: number) => HTMLAttributes<HTMLDivElement>;
  sectionChrome: (si: number) => ReactNode;
  sectionEnd: (si: number) => ReactNode;
  menuEnd: () => ReactNode;
  /** Cover photo control (upload / replace / remove). */
  coverPhoto: () => ReactNode;
}

export interface MenuStoreInfo {
  name: string;
  whatsapp?: string;
  address?: string;
}

interface Props {
  storeId: string;
  doc: MenuDoc;
  sections: ResolvedSection[];
  store: MenuStoreInfo;
  /** Public link, printed as a QR on the cover. */
  url: string;
  updatedAt: string | null;
  /** "print": A4 cover page + page breaks; "screen": the phone/web menu. */
  mode: "screen" | "print";
  edit?: MenuEditSlots;
}

const monthYear = (iso: string | null) =>
  new Date(iso ?? Date.now()).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Read-only text: an entry with no override reads the catalog text (its placeholder). */
function Plain({ field, value, placeholder, className }: MenuTextSlot) {
  const v = value || (field.kind === "entry" && field.key !== "caption" ? placeholder : "");
  return v ? <div className={className}>{v}</div> : null;
}

export function MenuQr({ url, className }: { url: string; className?: string }) {
  const { size, d } = qrPath(url);
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className={className} role="img" aria-label={`QR code para ${url}`} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      <path d={d} fill="#15231C" />
    </svg>
  );
}

type T = (p: MenuTextSlot) => ReactNode;

/**
 * The customer menu — the same markup for the public link, the editor canvas
 * and the printed A4, so what the store edits is exactly what it ships.
 * Columns follow the container width (@container), not the viewport, so the
 * editor's phone frame and A4 sheet render like the real thing.
 */
export function MenuView({ storeId, doc, sections, store, url, updatedAt, mode, edit }: Props) {
  const T = edit?.text ?? Plain;
  const print = mode === "print";
  const visible = sections.filter((s) => edit || s.entries.length > 0);
  const cover = doc.coverPhoto ? photoUrl(storeId, doc.coverPhoto) : null;

  return (
    <div className="@container bg-white font-sans text-ink [print-color-adjust:exact]">
      {print ? (
        <Cover doc={doc} store={store} url={url} updatedAt={updatedAt} T={T} cover={cover} edit={edit} />
      ) : (
        <header className="relative overflow-hidden bg-gradient-to-br from-[#1C7A4A] via-primary to-deep px-5 pb-7 pt-6 text-white">
          <Stripes />
          <div className="relative flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-white text-primary">
              <SeletLeaf className="size-[18px]" />
            </span>
            <span className="font-display text-[24px] font-semibold leading-none">Selet</span>
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-[2.5px] text-leaf">{store.name}</span>
          </div>
          <T field={{ kind: "title" }} value={doc.title} placeholder="Cardápio" className="relative mt-7 font-display text-[46px] font-semibold leading-[0.95] text-leaf" />
          <T field={{ kind: "tagline" }} value={doc.tagline} placeholder="Uma frase sobre a casa (opcional)" multiline className="relative mt-2.5 max-w-[440px] text-[14px] leading-snug text-white/75" />
          {(cover || edit) && (
            <div className="relative mt-5">
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element -- our own route, already resized; next/image adds nothing here
                <img src={cover} alt="" className="h-[200px] w-full rounded-2xl object-cover shadow-[0_24px_60px_-24px_rgba(0,0,0,.55)] @[640px]:h-[280px]" />
              )}
              {edit?.coverPhoto()}
            </div>
          )}
        </header>
      )}

      {!print && !edit && visible.length > 1 && (
        <nav aria-label="Seções do cardápio" className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-[#E7EEE6] bg-white/95 px-4 py-2.5 backdrop-blur">
          {visible.map((s) => (
            <a key={s.section.id} href={`#${s.section.id}`} className="shrink-0 rounded-full bg-mist px-3.5 py-1.5 text-[12.5px] font-semibold text-primary no-underline">
              {s.section.title}
            </a>
          ))}
        </nav>
      )}

      <div className={cn("flex flex-col gap-9", print ? "px-[53px] py-[48px] print:p-0" : "px-4 py-7 @[640px]:px-8")}>
        {visible.map(({ section, entries, uniformPrice }) => {
          const si = sections.findIndex((s) => s.section.id === section.id);
          return (
            <section
              key={section.id}
              id={section.id}
              className={cn("group/section relative scroll-mt-16", print && section.newPage && si > 0 && "break-before-page")}
            >
              {edit?.sectionChrome(si)}
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 break-after-avoid">
                <div className="min-w-0 flex-1">
                  <T field={{ kind: "section", si, key: "kicker" }} value={section.kicker ?? ""} placeholder="Chamada (opcional)" className="text-[11px] font-bold uppercase tracking-[2px] text-primary" />
                  <T field={{ kind: "section", si, key: "title" }} value={section.title} placeholder="Nome da seção" className="mt-1 font-display text-[34px] font-semibold leading-[1.05] text-ink @[640px]:text-[40px]" />
                </div>
                {uniformPrice !== null ? (
                  <div className="rounded-[14px] bg-primary px-5 py-2.5 text-center text-white">
                    <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-leaf">Preço único</div>
                    <div className="font-mono text-[20px] font-semibold">{formatBRL(uniformPrice)}</div>
                  </div>
                ) : (
                  <T field={{ kind: "section", si, key: "note" }} value={section.note ?? ""} placeholder="Uma linha sobre a seção (opcional)" multiline className="max-w-[300px] text-[13px] text-ink-soft @[640px]:text-right" />
                )}
              </div>
              {uniformPrice !== null && (
                <T field={{ kind: "section", si, key: "note" }} value={section.note ?? ""} placeholder="Uma linha sobre a seção (opcional)" multiline className="mt-2 text-[13px] text-ink-soft" />
              )}

              <div className="mt-5 grid grid-flow-dense grid-cols-1 gap-2.5 @[640px]:grid-cols-2 @[640px]:gap-3">
                {entries.map((e, ei) => (
                  <div
                    key={e.key}
                    {...edit?.entryProps(si, ei)}
                    className={cn(
                      "group/entry relative break-inside-avoid rounded-[14px] border border-[#E7EEE6] bg-paper",
                      e.kind === "table" ? "px-6 py-5 @[640px]:col-span-2" : e.entry.photo ? "flex flex-col @[640px]:row-span-3" : "px-[18px] py-[14px]",
                      !e.available && "border-dashed opacity-55",
                    )}
                  >
                    {edit?.entryChrome(e, si, ei)}
                    {e.kind === "table" ? (
                      <Table e={e} si={si} ei={ei} T={T} />
                    ) : e.entry.photo ? (
                      <Highlight e={e} si={si} ei={ei} T={T} src={photoUrl(storeId, e.entry.photo)} hidePrice={uniformPrice !== null} />
                    ) : (
                      <Item e={e} si={si} ei={ei} T={T} hidePrice={uniformPrice !== null} />
                    )}
                    {edit?.entryFooter(e, si, ei)}
                  </div>
                ))}
              </div>
              {edit?.sectionEnd(si)}
            </section>
          );
        })}
        {edit?.menuEnd()}
      </div>

      {!print && (
        <footer className="border-t border-[#E7EEE6] bg-paper px-5 py-7 text-center text-[12.5px] text-ink-soft">
          <div className="font-display text-[22px] font-semibold text-primary">Selet · {store.name}</div>
          {store.address && <p className="mt-1.5">{store.address}</p>}
          {store.whatsapp && <p className="mt-0.5">WhatsApp {store.whatsapp}</p>}
          <p className="mt-3 text-[11px] text-ink-faint">Preços atualizados em {monthYear(updatedAt)}</p>
        </footer>
      )}
    </div>
  );
}

interface EntryProps {
  e: ResolvedEntry;
  si: number;
  ei: number;
  T: T;
}

function NameRow({ e, si, ei, T, hidePrice, small }: EntryProps & { hidePrice: boolean; small?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        {e.available && (
          <span className="font-mono text-[10.5px] font-medium tracking-[.5px] text-[#A9B5AB]">{String(e.number).padStart(2, "0")}</span>
        )}
        <T field={{ kind: "entry", si, ei, key: "name" }} value={e.entry.name ?? ""} placeholder={e.name} className={cn("min-w-0 flex-1 font-bold leading-snug", small ? "text-[14px]" : "text-[15px]")} />
      </div>
      {!hidePrice && e.available && (
        <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-primary">{formatBRL(e.price)}</span>
      )}
    </div>
  );
}

function Tag({ e }: { e: ResolvedEntry }) {
  return e.tag ? (
    <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-[1px] text-amber">{MENU_TAG_LABELS[e.tag]}</span>
  ) : null;
}

function Description({ e, si, ei, T }: EntryProps) {
  return (
    <T field={{ kind: "entry", si, ei, key: "description" }} value={e.entry.description ?? ""} placeholder={e.description} multiline className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft" />
  );
}

function Item(p: EntryProps & { hidePrice: boolean }) {
  return (
    <>
      <NameRow {...p} />
      <Tag e={p.e} />
      <Description {...p} />
    </>
  );
}

/** Item with a photo: a tall card, photo on top, caption and the item below (spans 3 rows in two columns). */
function Highlight(p: EntryProps & { hidePrice: boolean; src: string }) {
  return (
    <>
      <div className="relative min-h-[190px] flex-1 overflow-hidden rounded-t-[13px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own route, already resized */}
        <img src={p.src} alt={p.e.name} className="absolute inset-0 size-full object-cover" />
      </div>
      <div className="border-t border-[#E7EEE6] px-4 pb-3.5 pt-3">
        <p.T field={{ kind: "entry", si: p.si, ei: p.ei, key: "caption" }} value={p.e.entry.caption ?? ""} placeholder="Chamada, ex.: Combo da casa" className="mb-1 text-[10px] font-bold uppercase tracking-[1.5px] text-primary" />
        <NameRow {...p} small />
        <Tag e={p.e} />
        <Description {...p} />
      </div>
    </>
  );
}

/** Extras price table: one dotted row per adicional/borda quantity, two columns when there is room. */
function Table({ e, si, ei, T }: EntryProps) {
  return (
    <>
      <T field={{ kind: "entry", si, ei, key: "name" }} value={e.entry.name ?? ""} placeholder={e.name} className="border-b border-[#EEF3EA] pb-3 text-[11px] font-bold uppercase tracking-[1.5px] text-primary" />
      <div className="mt-3.5 gap-x-10 @[640px]:columns-2">
        {e.rows.map((r) => (
          <div key={r.label} className="flex break-inside-avoid items-baseline gap-2 py-[5px] text-[13px]">
            <span>{r.label}</span>
            <span className="flex-1 border-b border-dotted border-[#C9D6C9]" />
            <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-primary">+ {formatBRL(r.price)}</span>
          </div>
        ))}
        {!e.rows.length && <p className="text-[12.5px] text-ink-faint">Nenhum adicional ativo.</p>}
      </div>
    </>
  );
}

function Stripes() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.045)_0,rgba(255,255,255,.045)_1px,transparent_1px,transparent_12px)]"
    />
  );
}

function Cover({
  doc,
  store,
  url,
  updatedAt,
  T,
  cover,
  edit,
}: {
  doc: MenuDoc;
  store: MenuStoreInfo;
  url: string;
  updatedAt: string | null;
  T: T;
  cover: string | null;
  edit?: MenuEditSlots;
}) {
  return (
    <section className="relative flex aspect-[210/296.5] flex-col overflow-hidden bg-gradient-to-br from-[#1C7A4A] via-primary to-deep px-16 pb-14 pt-16 text-white break-after-page">
      <Stripes />
      <div aria-hidden className="absolute -left-[70px] -top-20 size-[340px] rounded-full bg-leaf/15" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-white text-primary">
            <SeletLeaf className="size-6" />
          </span>
          <span className="font-display text-[34px] font-semibold tracking-[.5px]">Selet</span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[3px] text-leaf">{store.name}</span>
      </div>
      <div className={cn("relative", cover || edit ? "mt-[52px]" : "mt-auto")}>
        <T field={{ kind: "title" }} value={doc.title} placeholder="Cardápio" className="font-display text-[96px] font-semibold leading-[0.96] tracking-[.5px] text-leaf" />
        <T field={{ kind: "tagline" }} value={doc.tagline} placeholder="Uma frase sobre a casa (opcional)" multiline className="mt-4 max-w-[430px] text-[15px] text-white/75" />
      </div>
      {(cover || edit) && (
        <div className={cn("relative mt-9 overflow-hidden rounded-[20px]", cover ? "flex-1 shadow-[0_24px_60px_-24px_rgba(0,0,0,.55)]" : "")}>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- our own route, already resized
            <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          {edit?.coverPhoto()}
        </div>
      )}
      <div className={cn("relative flex items-end gap-8 border-t border-white/15 pt-6 text-[12.5px] text-white/75", cover ? "mt-8" : "mt-auto")}>
        <div className="flex flex-1 flex-col gap-1.5">
          {store.whatsapp && (
            <span>
              <strong className="font-semibold text-white">WhatsApp</strong>&nbsp;&nbsp;{store.whatsapp}
            </span>
          )}
          {store.address && (
            <span>
              <strong className="font-semibold text-white">Endereço</strong>&nbsp;&nbsp;{store.address}
            </span>
          )}
          <span>
            <strong className="font-semibold text-white">Atualizado</strong>&nbsp;&nbsp;{monthYear(updatedAt)}
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="max-w-[120px] text-right text-[11px] leading-snug text-white/75">Aponte a câmera: cardápio sempre atualizado</span>
          <MenuQr url={url} className="size-[104px] rounded-lg" />
        </div>
      </div>
    </section>
  );
}

/** A4 pages: the cover bleeds to the edge, the rest gets a 14mm margin (the editor sheet mirrors this). */
export function MenuPrintStyles() {
  return <style>{`@page{size:A4;margin:14mm}@page:first{margin:0}`}</style>;
}
