"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** A page's contextual primary action, surfaced in the shell top-bar. */
export interface PageAction {
  /** Button label, e.g. "Novo pedido" (hidden on mobile — icon only). */
  label: string;
  onClick: () => void;
}

/** A page's dynamic title/subtitle, overriding the static per-segment map. */
export interface PageHeader {
  title: string;
  subtitle: string;
}

interface ShellContextValue {
  action: PageAction | null;
  setAction: (action: PageAction | null) => void;
  headerOverride: PageHeader | null;
  setHeaderOverride: (header: PageHeader | null) => void;
  /** Global header search query (shared by the shell + consuming pages). */
  search: string;
  setSearch: (value: string) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function AppShellProvider({
  children,
  /** Resets the search box whenever the route changes. */
  routeKey,
}: {
  children: React.ReactNode;
  routeKey: string;
}) {
  const [action, setAction] = useState<PageAction | null>(null);
  const [headerOverride, setHeaderOverride] = useState<PageHeader | null>(null);
  const [search, setSearch] = useState("");

  // A new route → clear stale search so it can't hide the new list. Adjusting
  // state during render (guarded) is the sanctioned React pattern; it avoids an
  // extra commit and the setState-in-effect smell.
  const [prevRoute, setPrevRoute] = useState(routeKey);
  if (routeKey !== prevRoute) {
    setPrevRoute(routeKey);
    setSearch("");
  }

  const value = useMemo(
    () => ({ action, setAction, headerOverride, setHeaderOverride, search, setSearch }),
    [action, headerOverride, search],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within AppShellProvider");
  return ctx;
}

/** Read the shell state (used by the top-bar). */
export function useShellState() {
  return useShell();
}

/**
 * Register this page's contextual "add" action with the shell top-bar.
 * The latest onClick is always invoked (kept in a ref), so callers need not
 * memoize it; re-registration only happens when the label changes. Pass
 * `null` (e.g. dashboard/financeiro) to render no add button.
 */
export function usePageAction(action: PageAction | null) {
  const { setAction } = useShell();
  const label = action?.label ?? null;
  const onClick = action?.onClick;
  const onClickRef = useRef(onClick);

  // Keep the latest onClick in a ref (updated after commit), so the registered
  // wrapper always calls the current handler without re-registering per render.
  useEffect(() => {
    onClickRef.current = onClick;
  });

  useEffect(() => {
    if (!label) {
      setAction(null);
      return;
    }
    setAction({ label, onClick: () => onClickRef.current?.() });
    return () => setAction(null);
  }, [label, setAction]);
}

/** Read the global header search query (for pages that filter by it). */
export function useShellSearch(): string {
  return useShell().search;
}

/**
 * Override the shell top-bar's title/subtitle with page-computed text (e.g. a
 * lançamento count), in place of the static per-segment map. Pass `null` to
 * fall back to the static map. Mirrors usePageAction's ref+effect structure,
 * but keys off the primitive title/subtitle strings (not object identity)
 * since callers pass a fresh `{title, subtitle}` literal every render.
 */
export function usePageHeader(header: PageHeader | null) {
  const { setHeaderOverride } = useShell();
  const title = header?.title ?? null;
  const subtitle = header?.subtitle ?? null;

  useEffect(() => {
    if (title === null || subtitle === null) {
      setHeaderOverride(null);
      return;
    }
    setHeaderOverride({ title, subtitle });
    return () => setHeaderOverride(null);
  }, [title, subtitle, setHeaderOverride]);
}
