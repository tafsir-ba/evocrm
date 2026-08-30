"use client";

import Link from "next/link";

import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { isValidHexColor } from "@/lib/dictionary-colors";
import { formatPrice } from "@/lib/format-price";
import { visibleOverflowItems } from "@/lib/list-view";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
};

type PropertyTableItem = {
  id: string;
  title: string;
  reference: string | null;
  price: number | null;
  currency: string;
  rooms: number | null;
  city: string | null;
  status: DictionaryItem | null;
  type: DictionaryItem | null;
  project: { id: string; name: string; reference: string | null } | null;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  assignedUser: { id: string; name: string | null; email: string } | null;
};

type PropertiesTableProps = {
  workspaceSlug: string;
  properties: PropertyTableItem[];
  canArchive: boolean;
  onArchive: (propertyId: string, propertyTitle: string) => void;
};

function TagChip({ tag }: { tag: { id: string; name: string; color: string } }) {
  const color = isValidHexColor(tag.color) ? tag.color : null;
  return (
    <span
      title={tag.name}
      className="inline-flex max-w-[6.5rem] truncate rounded border px-1.5 py-px text-[10.5px] font-medium leading-4"
      style={
        color
          ? { color, borderColor: `${color}55`, backgroundColor: `${color}18` }
          : undefined
      }
    >
      {tag.name}
    </span>
  );
}

export function PropertiesTable({
  workspaceSlug,
  properties,
  canArchive,
  onArchive,
}: PropertiesTableProps) {
  const showType = properties.some((property) => Boolean(property.type?.label));
  const showRooms = properties.some((property) => property.rooms != null);
  const showTags = properties.some((property) => property.tagsResolved.length > 0);

  return (
    <>
      <div className="hidden md:block">
        <Table density="compact">
          <TableHead>
            <TableRow>
              <TableHeaderCell>Property</TableHeaderCell>
              <TableHeaderCell className="w-[8.5rem]">Project</TableHeaderCell>
              {showType ? <TableHeaderCell className="w-[6.5rem]">Type</TableHeaderCell> : null}
              <TableHeaderCell className="w-[7rem]">Status</TableHeaderCell>
              <TableHeaderCell className="w-[7rem]">Price</TableHeaderCell>
              {showRooms ? (
                <TableHeaderCell className="w-[3.5rem] text-right">Rooms</TableHeaderCell>
              ) : null}
              <TableHeaderCell className="w-[7rem]">City</TableHeaderCell>
              <TableHeaderCell className="w-[7.5rem]">Owner</TableHeaderCell>
              {showTags ? <TableHeaderCell className="w-[6.5rem]">Tags</TableHeaderCell> : null}
              <TableHeaderCell className="w-[4.5rem] text-right">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {properties.map((property) => {
              const { visible, overflow } = visibleOverflowItems(property.tagsResolved, 1);
              const owner =
                property.assignedUser?.name?.trim() || property.assignedUser?.email || "—";

              return (
                <TableRow key={property.id}>
                  <TableCell className="min-w-[12rem]">
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <Link
                        href={workspacePath(workspaceSlug, "properties", property.id)}
                        className="min-w-0 truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
                      >
                        {property.title}
                      </Link>
                      {property.reference ? (
                        <span className="shrink-0 truncate text-[11.5px] text-[var(--color-ink-muted)]">
                          {property.reference}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="truncate text-[var(--color-ink-soft)]">
                      {property.project?.name ?? "—"}
                    </p>
                  </TableCell>
                  {showType ? (
                    <TableCell>
                      <p className="truncate text-[var(--color-ink-soft)]">
                        {property.type?.label ?? "—"}
                      </p>
                    </TableCell>
                  ) : null}
                  <TableCell>
                    {property.status ? (
                      <StatusBadge
                        label={property.status.label}
                        color={property.status.color}
                        size="sm"
                      />
                    ) : (
                      <span className="text-[var(--color-ink-faint)]">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular text-[var(--color-ink)]">
                    {formatPrice(property.price, property.currency)}
                  </TableCell>
                  {showRooms ? (
                    <TableCell className="text-right tabular text-[var(--color-ink-soft)]">
                      {property.rooms ?? "—"}
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <p className="truncate text-[var(--color-ink-soft)]">{property.city ?? "—"}</p>
                  </TableCell>
                  <TableCell>
                    <p className="truncate text-[var(--color-ink-soft)]">{owner}</p>
                  </TableCell>
                  {showTags ? (
                    <TableCell>
                      {property.tagsResolved.length === 0 ? (
                        <span className="text-[var(--color-ink-faint)]">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {visible.map((tag) => (
                            <TagChip key={tag.id} tag={tag} />
                          ))}
                          {overflow > 0 ? (
                            <span className="text-[10.5px] text-[var(--color-ink-muted)]">
                              +{overflow}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    {canArchive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[12px]"
                        onClick={() => onArchive(property.id, property.title)}
                      >
                        Archive
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-[var(--color-line)] md:hidden">
        {properties.map((property) => (
          <li key={property.id} className="px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={workspacePath(workspaceSlug, "properties", property.id)}
                className="min-w-0 truncate font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-700)]"
              >
                {property.title}
              </Link>
              {property.status ? (
                <StatusBadge
                  label={property.status.label}
                  color={property.status.color}
                  size="sm"
                />
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-muted)]">
              {[
                property.reference,
                property.project?.name,
                property.city,
                formatPrice(property.price, property.currency),
              ]
                .filter((value) => value && value !== "—")
                .join(" · ")}
            </p>
            {canArchive ? (
              <button
                type="button"
                className="mt-1.5 text-[12px] font-medium text-[var(--color-danger-fg)]"
                onClick={() => onArchive(property.id, property.title)}
              >
                Archive
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
