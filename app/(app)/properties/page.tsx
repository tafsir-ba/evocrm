import Link from "next/link";

import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { AvatarWithName } from "@/components/ui/avatar";
import { FilterBar } from "@/components/layout/filter-bar";
import { IconImage, IconPlus, IconChevronRight, IconChevronLeft } from "@/lib/icons";
import { properties } from "@/lib/mock-data";

export const metadata = { title: "Properties — EvoHome CRM" };

export default function PropertiesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Properties"
        description="Inventory of available, reserved and sold listings, grouped by project."
        meta={
          <Badge tone="muted" size="sm">
            {properties.length} listings
          </Badge>
        }
        actions={<Button leadingIcon={<IconPlus size={14} />}>New property</Button>}
      />

      <div className="mb-4">
        <FilterBar
          search
          searchPlaceholder="Search properties by title, project or city…"
          selects={[
            { label: "All projects", options: ["Green View", "Lake Residences", "Sunset Villas"] },
            { label: "All types", options: ["Apartment", "Villa", "House", "Plot"] },
            { label: "All statuses", options: ["Available", "Reserved", "Sold"] },
          ]}
        />
      </div>

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
                <th className="text-right font-semibold px-5 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]">
              {properties.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-[var(--color-canvas)] transition-colors"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/properties/${p.id}`}
                      className="flex items-center gap-3 min-w-0"
                    >
                      <span className="w-10 h-10 rounded-md overflow-hidden bg-[var(--color-muted)] shrink-0 inline-flex items-center justify-center text-[var(--color-ink-faint)]">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <IconImage size={16} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-[var(--color-ink)] truncate group-hover:text-[var(--color-brand-700)]">
                          {p.title}
                        </span>
                        <span className="block text-[12px] text-[var(--color-ink-muted)] truncate">
                          {p.area ?? "—"}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                    {p.project}
                  </td>
                  <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                    {p.type}
                  </td>
                  <td className="px-2 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-2 py-3 font-semibold text-[var(--color-ink)] tabular">
                    {p.price}
                  </td>
                  <td className="px-2 py-3 text-[var(--color-ink-soft)] tabular">
                    {p.rooms}
                  </td>
                  <td className="px-2 py-3 text-[var(--color-ink-soft)]">
                    {p.city}
                  </td>
                  <td className="px-2 py-3">
                    <AvatarWithName user={p.assigned} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/properties/${p.id}`}
                      aria-label={`Open ${p.title}`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]"
                    >
                      <IconChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-canvas)]">
          <p className="text-[12.5px] text-[var(--color-ink-muted)]">
            Showing <span className="text-[var(--color-ink)] font-medium">1–7</span> of{" "}
            <span className="text-[var(--color-ink)] font-medium">86</span> properties
          </p>
          <div className="inline-flex items-center gap-1">
            <button className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)]" disabled>
              <IconChevronLeft size={14} />
            </button>
            {[1, 2, 3, "…", 13].map((p, i) => (
              <button
                key={i}
                className={
                  p === 1
                    ? "w-8 h-8 inline-flex items-center justify-center rounded-md bg-[var(--color-brand-600)] text-white text-[12.5px] font-semibold"
                    : "w-8 h-8 inline-flex items-center justify-center rounded-md text-[var(--color-ink-soft)] text-[12.5px] hover:bg-[var(--color-muted)]"
                }
              >
                {p}
              </button>
            ))}
            <button className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-muted)]">
              <IconChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
