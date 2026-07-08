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

interface ShellContextValue {
  action: PageAction | null;
  setAction: (action: PageAction | null) => void;
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
    () => ({ action, setAction, search, setSearch }),
    [action, search],
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
