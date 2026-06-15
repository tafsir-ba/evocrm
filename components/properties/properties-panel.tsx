"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { StatusBadge } from "@/components/domain/status-badge";
import type { MemberSelectorMember } from "@/components/domain/member-selector";
import type { TagSelectorTag } from "@/components/domain/tag-selector";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { IconChevronLeft, IconChevronRight, IconImage, IconPlus } from "@/lib/icons";
import { appendProjectIdToSearchParams } from "@/lib/project-scope";
import { useWorkspaceProjectFilter } from "@/lib/use-workspace-project-filter";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  isDefault?: boolean;
};

type PropertyListItem = {
  id: string;
  title: string;
  reference: string | null;
  price: number | null;
  currency: string;
  rooms: number | null;
  city: string | null;
  createdAt: string;
  status: DictionaryItem | null;
  type: DictionaryItem | null;
  project: { id: string; name: string; reference: string | null } | null;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  assignedUser: { id: string; name: string | null; email: string } | null;
};

type PropertiesPanelProps = {
  workspaceSlug: string;
  defaultCurrency: string;
  canCreate: boolean;
  canArchive: boolean;
};

function formatPrice(price: number | null, currency: string): string {
  if (price === null) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency} ${price.toLocaleString()}`;
  }
}

export function PropertiesPanel({
  workspaceSlug,
  defaultCurrency,
  canCreate,
  canArchive,
}: PropertiesPanelProps) {
  const router = useRouter();
  const projectId = useWorkspaceProjectFilter();
  const [properties, setProperties] = useState<PropertyListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [types, setTypes] = useState<DictionaryItem[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadOptions = useCallback(async () => {
    try {
      const [statusRes, typeRes, tagsRes, membersRes] = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=property_status`),
        fetch(`${apiBase}/dictionary-items?type=property_type`),
        fetch(`${apiBase}/tags?entityType=property`),
        fetch(`${apiBase}/members`),
      ]);

      const [statusPayload, typePayload, tagsPayload, membersPayload] =
        await Promise.all([
          statusRes.json(),
          typeRes.json(),
          tagsRes.json(),
          membersRes.json(),
        ]);

      if (statusRes.ok) {
        setStatuses(statusPayload.data.items as DictionaryItem[]);
      }
      if (typeRes.ok) {
        setTypes(typePayload.data.items as DictionaryItem[]);
      }
      if (tagsRes.ok) {
        setTags(tagsPayload.data.tags as TagSelectorTag[]);
      }
      if (membersRes.ok) {
        setMembers(membersPayload.data.members as MemberSelectorMember[]);
      }
    } catch {
      // Options are non-blocking for list view.
    }
  }, [apiBase]);

  const loadProperties = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (statusFilter) {
        params.set("statusId", statusFilter);
      }
      if (typeFilter) {
        params.set("typeId", typeFilter);
      }
      appendProjectIdToSearchParams(params, projectId);
      if (tagFilter) {
        params.set("tagId", tagFilter);
      }
      if (assignedFilter) {
        params.set("assignedTo", assignedFilter);
      }

      const response = await fetch(`${apiBase}/properties?${params.toString()}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load properties.");
      }

      setProperties(payload.data as PropertyListItem[]);
      setTotal(payload.pagination?.total ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    assignedFilter,
    page,
    pageSize,
    projectId,
    search,
    statusFilter,
    tagFilter,
    typeFilter,
  ]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  async function handleArchive(propertyId: string, propertyTitle: string) {
    if (!canArchive) {
      return;
    }
    if (!window.confirm(`Archive property "${propertyTitle}"?`)) {
      return;
    }

    const response = await fetch(`${apiBase}/properties/${propertyId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error?.message ?? "Failed to archive property.");
      return;
    }

    await loadProperties();
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Properties unavailable"
        description="You do not have permission to view properties."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Properties"
        description="Inventory of available, reserved and sold listings, grouped by project."
        meta={
          !loading ? (
            <Badge tone="muted" size="sm">
              {total} total
            </Badge>
          ) : undefined
        }
        actions={
          canCreate ? (
            <Button
              leadingIcon={<IconPlus size={14} />}
              onClick={() => router.push(workspacePath(workspaceSlug, "properties", "new"))}
            >
              New property
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] max-w-md">
          <Input
            placeholder="Search properties by title, reference, city…"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            fieldSize="sm"
          />
        </div>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          value={statusFilter}
          onChange={(event) => {
            setPage(1);
            setStatusFilter(event.target.value);
          }}
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.label}
            </option>
          ))}
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          value={typeFilter}
          onChange={(event) => {
            setPage(1);
            setTypeFilter(event.target.value);
          }}
        >
          <option value="">All types</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          value={assignedFilter}
          onChange={(event) => {
            setPage(1);
            setAssignedFilter(event.target.value);
          }}
        >
          <option value="">All assigned</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name ?? member.email}
            </option>
          ))}
        </Select>
        <Select
          fieldSize="sm"
          className="w-auto min-w-[140px]"
          value={tagFilter}
          onChange={(event) => {
            setPage(1);
            setTagFilter(event.target.value);
          }}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          title="Could not load properties"
          description={error}
          primaryAction={{ label: "Retry", onClick: () => void loadProperties() }}
        />
      ) : properties.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Create your first property to start capturing supply in this workspace."
          primaryAction={
            canCreate
              ? {
                  label: "New property",
                  onClick: () => router.push(workspacePath(workspaceSlug, "properties", "new")),
                }
              : undefined
          }
        />
      ) : (
        <div className="bg-white border border-[var(--color-line)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] bg-[var(--color-canvas)] border-b border-[var(--color-line)]">
                  <th className="text-left font-semibold px-5 py-3">Title</th>
                  <th className="text-left font-semibold px-2 py-3">Project</th>
                  <th className="text-left font-semibold px-2 py-3">Type</th>
                  <th className="text-left font-semibold px-2 py-3">Status</th>
                  <th className="text-left font-semibold px-2 py-3">Price</th>
                  <th className="text-left font-semibold px-2 py-3">Rooms</th>
                  <th className="text-left font-semibold px-2 py-3">City</th>
                  <th className="text-left font-semibold px-2 py-3">Assigned</th>
                  <th className="text-left font-semibold px-2 py-3">Tags</th>
                  <th className="text-right font-semibold px-5 py-3 w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {properties.map((property) => (
                  <tr
                    key={property.id}
                    className="hover:bg-[var(--color-canvas)] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={workspacePath(workspaceSlug, "properties", property.id)}
                        className="flex items-center gap-3 min-w-0"
                      >
                        <span className="w-10 h-10 rounded-md overflow-hidden bg-[var(--color-muted)] shrink-0 inline-flex items-center justify-center text-[var(--color-ink-faint)]">
                          <IconImage size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-[var(--color-ink)] truncate hover:text-[var(--color-brand-700)]">
                            {property.title}
                          </span>
                          {property.reference && (
                            <span className="block text-[12px] text-[var(--color-ink-muted)] truncate">
                              {property.reference}
                            </span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                      {property.project?.name ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                      {property.type?.label ?? "—"}
                    </td>
                    <td className="px-2 py-3">
                      {property.status ? (
                        <StatusBadge
                          label={property.status.label}
                          color={property.status.color}
                          size="sm"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-3 font-semibold text-[var(--color-ink)] tabular">
                      {formatPrice(property.price, property.currency)}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)] tabular">
                      {property.rooms ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                      {property.city ?? "—"}
                    </td>
                    <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                      {property.assignedUser?.name ?? property.assignedUser?.email ?? "—"}
                    </td>
                    <td className="px-2 py-3">
                      {property.tagsResolved.length === 0 ? (
                        <span className="text-[var(--color-ink-faint)]">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {property.tagsResolved.map((tag) => (
                            <Badge key={tag.id} tone="muted" size="sm">
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          href={workspacePath(workspaceSlug, "properties", property.id)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
                          aria-label={`Open ${property.title}`}
                        >
                          <IconChevronRight size={14} />
                        </Link>
                        {canArchive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleArchive(property.id, property.title)}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-canvas)]">
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">
              Showing{" "}
              <span className="text-[var(--color-ink)] font-medium">
                {total === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, total)}
              </span>{" "}
              of <span className="text-[var(--color-ink)] font-medium">{total}</span> properties
            </p>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <IconChevronLeft size={14} />
              </button>
              <span className="px-2 text-[12.5px] text-[var(--color-ink-soft)] tabular">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                <IconChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
