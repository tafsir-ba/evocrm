import { notFound } from "next/navigation";

import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { AvatarWithName } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/tabs";
import { StateView } from "@/components/states/state-view";
import {
  IconBath,
  IconBed,
  IconBuilding,
  IconCamera,
  IconImage,
  IconMapPin,
  IconRuler,
  IconBriefcase,
} from "@/lib/icons";
import { properties, opportunities, activities } from "@/lib/mock-data";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params;
  const p = properties.find((x) => x.id === id);
  return { title: p ? `${p.title} — Property` : "Property" };
}

export default async function PropertyDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const p = properties.find((x) => x.id === id);
  if (!p) notFound();

  return (
    <PageContainer>
      <PageHeader
        back={{ href: "/properties", label: "Back to properties" }}
        title={
          <span className="flex items-center gap-2.5 flex-wrap">
            {p.title}
            <StatusBadge status={p.status} />
          </span>
        }
        description={`${p.type} · ${p.project} · ${p.city}`}
        actions={
          <>
            <Button variant="secondary" leadingIcon={<IconCamera size={14} />}>
              Add media
            </Button>
            <Button leadingIcon={<IconBriefcase size={14} />}>
              New opportunity
            </Button>
          </>
        }
      />

      {/* Gallery */}
      <div className="flex flex-col md:flex-row gap-3 mb-4 md:h-[420px]">
        <div className="md:flex-[2] aspect-[16/9] md:aspect-auto md:h-full rounded-xl overflow-hidden bg-[var(--color-muted)] relative">
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt={p.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--color-ink-faint)]">
              <IconImage size={32} />
            </div>
          )}
          <span className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-[#0f172a]/60 text-white text-[11.5px] font-medium backdrop-blur-sm">
            {p.area ?? "—"} · {p.rooms} rooms
          </span>
        </div>
        <div className="md:flex-1 md:h-full grid grid-cols-3 md:grid-cols-1 md:grid-rows-3 gap-3">
          {(p.gallery ?? [p.imageUrl, p.imageUrl, p.imageUrl]).slice(0, 3).map((src, i) => (
            <div
              key={i}
              className="aspect-[16/10] md:aspect-auto md:h-full rounded-lg overflow-hidden bg-[var(--color-muted)] relative cursor-pointer hover:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
              {i === 2 && (
                <div className="absolute inset-0 bg-[#0f172a]/55 flex items-center justify-center text-white text-[12.5px] font-semibold">
                  +5 more
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Facts */}
        <Card className="xl:col-span-1 self-start">
          <div className="flex items-end justify-between gap-2 mb-4">
            <div>
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold">
                Asking price
              </p>
              <p className="text-[26px] font-bold tracking-tight text-[var(--color-ink)] tabular">
                {p.price}
              </p>
            </div>
            <Badge tone="info" size="sm">{p.type}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-5">
            <Fact icon={<IconBed size={14} />} label="Rooms" value={String(p.rooms)} />
            <Fact icon={<IconBath size={14} />} label="Baths" value={String(p.bathrooms ?? "—")} />
            <Fact icon={<IconRuler size={14} />} label="Area" value={p.area ?? "—"} />
          </div>

          <div className="space-y-2.5 text-[13px]">
            <Row icon={<IconBuilding size={14} />} label="Project">
              {p.project}
            </Row>
            <Row icon={<IconMapPin size={14} />} label="Address">
              {p.address ?? `${p.city}, Switzerland`}
            </Row>
          </div>

          <div className="border-t border-[var(--color-line)] my-5" />

          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
            Assigned agent
          </p>
          <AvatarWithName user={p.assigned} size={26} />
        </Card>

        {/* Main */}
        <Card padded={false} className="xl:col-span-2">
          <Tabs
            className="px-5"
            items={[
              {
                key: "overview",
                label: "Overview",
                content: (
                  <div className="px-5 pb-5 space-y-5">
                    <div>
                      <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
                        Description
                      </p>
                      <p className="text-[13.5px] text-[var(--color-ink-soft)] leading-relaxed">
                        {p.description ??
                          "A bright property with quality finishes. Detailed description will be available once the listing is enriched in the workspace."}
                      </p>
                    </div>
                    {p.features && p.features.length > 0 && (
                      <div>
                        <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
                          Features
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {p.features.map((f) => (
                            <Badge key={f} tone="info" size="sm">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: "details",
                label: "Details",
                content: (
                  <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Info label="Floor" value={p.floor ?? "—"} />
                    <Info label="Type" value={p.type} />
                    <Info label="Rooms" value={String(p.rooms)} />
                    <Info label="Area" value={p.area ?? "—"} />
                    <Info label="Bathrooms" value={String(p.bathrooms ?? "—")} />
                    <Info label="City" value={p.city} />
                  </div>
                ),
              },
              {
                key: "media",
                label: "Media",
                count: (p.gallery?.length ?? 0) + 1,
                content: (
                  <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {[p.imageUrl, ...(p.gallery ?? [])].map((src, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded-lg overflow-hidden bg-[var(--color-muted)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: "files",
                label: "Files",
                content: (
                  <div className="px-5 pb-5">
                    <StateView
                      variant="empty"
                      compact
                      title="No files attached"
                      description="Floor plans, contracts and brochures will live here. Document handling comes online in a later phase."
                      primaryAction={{ label: "Upload file" }}
                    />
                  </div>
                ),
              },
              {
                key: "notes",
                label: "Notes",
                content: (
                  <div className="px-5 pb-5">
                    <textarea
                      placeholder="Add a private note about this property…"
                      className="w-full min-h-[110px] rounded-lg border border-[var(--color-line)] p-3 text-[13.5px] focus:outline-none focus:border-[var(--color-brand-500)] focus:ring-4 focus:ring-[var(--color-brand-100)]"
                    />
                  </div>
                ),
              },
              {
                key: "opps",
                label: "Opportunities",
                count: 3,
                content: (
                  <div className="px-5 pb-5 space-y-2">
                    {opportunities.slice(0, 3).map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--color-line)]"
                      >
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
                            {o.leadName}
                          </p>
                          <p className="text-[12px] text-[var(--color-ink-muted)] tabular">
                            {o.value} · {o.probability}% · {o.expectedClose}
                          </p>
                        </div>
                        <Badge tone="info" size="sm">{o.stage}</Badge>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                key: "acts",
                label: "Activities",
                count: 4,
                content: (
                  <div className="px-5 pb-5 space-y-3">
                    {activities.slice(0, 4).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-[var(--color-line)]"
                      >
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
                            {a.title}
                          </p>
                          <p className="text-[12px] text-[var(--color-ink-muted)] tabular">
                            {a.dueDate}
                          </p>
                        </div>
                        <StatusBadge status={a.status} size="sm" />
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </PageContainer>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-canvas)] p-2.5 text-center">
      <span className="inline-flex items-center justify-center text-[var(--color-ink-muted)]">
        {icon}
      </span>
      <p className="text-[15px] font-semibold text-[var(--color-ink)] tabular mt-1">
        {value}
      </p>
      <p className="text-[10.5px] uppercase tracking-wide text-[var(--color-ink-faint)] font-semibold">
        {label}
      </p>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-[var(--color-ink-muted)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-faint)] font-semibold">
          {label}
        </p>
        <p className="text-[13px] text-[var(--color-ink)]">{children}</p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-1">
        {label}
      </p>
      <p className="text-[13.5px] text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
