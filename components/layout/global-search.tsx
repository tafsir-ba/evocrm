"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { useWorkspaceShell } from "@/components/layout/workspace-shell-context";
import { Input } from "@/components/ui/input";
import { IconSearch } from "@/lib/icons";
import { appendProjectIdToSearchParams } from "@/lib/project-scope";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { workspacePath } from "@/lib/workspace-paths";
import { cn } from "@/lib/utils";

type SearchHit = {
  id: string;
  type: "lead" | "property" | "activity";
  label: string;
  meta: string;
  href: string;
};

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  lead: "Lead",
  property: "Property",
  activity: "Activity",
};

export function GlobalSearch() {
  return (
    <Suspense
      fallback={
        <div className="relative flex-1 min-w-0 max-w-md">
          <Input
            placeholder="Search leads, properties, activities…"
            leadingIcon={<IconSearch size={15} />}
            trailingIcon={<span className="kbd hidden sm:inline">⌘K</span>}
            fieldSize="sm"
            disabled
            aria-hidden
          />
        </div>
      }
    >
      <GlobalSearchInner />
    </Suspense>
  );
}

function GlobalSearchInner() {
  const router = useRouter();
  const { workspace } = useWorkspaceShell();
  const projectId = useWorkspaceProjectFilter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const apiBase = `/api/workspaces/${workspace.slug}`;

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();
      if (trimmed.length < 2) {
        setHits([]);
        setError(null);
        setLoading(false);
        return;
      }

      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          search: trimmed,
          pageSize: "5",
        });
        appendProjectIdToSearchParams(params, projectId);

        const [leadsRes, propertiesRes, activitiesRes] = await Promise.all([
          fetch(`${apiBase}/leads?${params.toString()}`),
          fetch(`${apiBase}/properties?${params.toString()}`),
          fetch(`${apiBase}/activities?${params.toString()}`),
        ]);

        const [leadsPayload, propertiesPayload, activitiesPayload] = await Promise.all([
          leadsRes.json(),
          propertiesRes.json(),
          activitiesRes.json(),
        ]);

        if (requestId !== requestIdRef.current) {
          return;
        }

        const nextHits: SearchHit[] = [];

        if (leadsRes.ok && Array.isArray(leadsPayload.data)) {
          for (const lead of leadsPayload.data as Array<{
            id: string;
            fullName: string;
            email: string | null;
          }>) {
            nextHits.push({
              id: lead.id,
              type: "lead",
              label: lead.fullName,
              meta: lead.email ?? "Lead",
              href: workspacePath(workspace.slug, "leads", lead.id),
            });
          }
        }

        if (propertiesRes.ok && Array.isArray(propertiesPayload.data)) {
          for (const property of propertiesPayload.data as Array<{
            id: string;
            title: string;
            reference: string | null;
            city: string | null;
          }>) {
            nextHits.push({
              id: property.id,
              type: "property",
              label: property.title,
              meta: property.reference ?? property.city ?? "Property",
              href: workspacePath(workspace.slug, "properties", property.id),
            });
          }
        }

        if (activitiesRes.ok && Array.isArray(activitiesPayload.data)) {
          for (const activity of activitiesPayload.data as Array<{
            id: string;
            title: string;
            dueDate: string | null;
          }>) {
            nextHits.push({
              id: activity.id,
              type: "activity",
              label: activity.title || "Untitled activity",
              meta: activity.dueDate
                ? `Due ${new Date(activity.dueDate).toLocaleDateString()}`
                : "Activity",
              href: workspacePath(workspace.slug, "activities", activity.id),
            });
          }
        }

        setHits(nextHits);
        setActiveIndex(0);
        if (!leadsRes.ok && !propertiesRes.ok && !activitiesRes.ok) {
          setError("Search is unavailable right now.");
        }
      } catch {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setHits([]);
        setError("Search failed. Try again.");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [apiBase, projectId, workspace.slug],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setError(null);
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(trimmed);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") {
        return;
      }

      const input =
        inputRef.current ??
        containerRef.current?.querySelector<HTMLInputElement>("input");
      if (!input || input.offsetParent === null) {
        return;
      }

      event.preventDefault();
      input.focus();
      setOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function navigateToHit(hit: SearchHit) {
    setOpen(false);
    setQuery("");
    setHits([]);
    router.push(hit.href);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (hits[activeIndex]) {
      navigateToHit(hits[activeIndex]);
      return;
    }
    void runSearch(query);
    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
    }

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!open || hits.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + hits.length) % hits.length);
    }
  }

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0 max-w-md">
      <form onSubmit={handleSubmit}>
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={(event) => {
            inputRef.current = event.currentTarget;
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search leads, properties, activities…"
          leadingIcon={<IconSearch size={15} />}
          trailingIcon={<span className="kbd hidden sm:inline">⌘K</span>}
          fieldSize="sm"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
        />
      </form>

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border border-[var(--color-line)] bg-white shadow-[var(--shadow-lg)]"
        >
          {loading ? (
            <p className="px-3 py-2.5 text-[13px] text-[var(--color-ink-muted)]">Searching…</p>
          ) : error ? (
            <p className="px-3 py-2.5 text-[13px] text-[var(--color-danger-fg)]">{error}</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2.5 text-[13px] text-[var(--color-ink-muted)]">
              No matches for “{query.trim()}”.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {hits.map((hit, index) => (
                <li key={`${hit.type}-${hit.id}`} role="option" aria-selected={index === activeIndex}>
                  <Link
                    href={hit.href}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2 text-left hover:bg-[var(--color-muted)] focus-ring",
                      index === activeIndex && "bg-[var(--color-muted)]",
                    )}
                    onClick={(event) => {
                      event.preventDefault();
                      navigateToHit(hit);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="mt-0.5 rounded bg-[var(--color-canvas)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                      {TYPE_LABEL[hit.type]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[var(--color-ink)]">
                        {hit.label}
                      </span>
                      <span className="block truncate text-[12px] text-[var(--color-ink-muted)]">
                        {hit.meta}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
