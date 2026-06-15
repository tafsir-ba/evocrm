"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { OpportunitiesSection } from "@/components/opportunities/opportunities-section";
import { ActivitiesSection } from "@/components/activities/activities-section";
import { DocumentsSection } from "@/components/documents/documents-section";
import { StatusBadge } from "@/components/domain/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { StateView } from "@/components/states/state-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { formatSurfaceValue } from "@/lib/surface-unit";
import {
  IconBath,
  IconBed,
  IconBuilding,
  IconCalendar,
  IconImage,
  IconMapPin,
  IconRuler,
} from "@/lib/icons";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
};

type PropertyDetail = {
  id: string;
  title: string;
  reference: string | null;
  price: number | null;
  currency: string;
  address: string | null;
  city: string | null;
  country: string | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  surface: number | null;
  surfaceUnit: "sqm" | "sqft";
  floor: number | null;
  description: string | null;
  features: string[];
  createdAt: string;
  status: DictionaryItem | null;
  type: DictionaryItem | null;
  project: { id: string; name: string; reference: string | null } | null;
  tagsResolved: Array<{ id: string; name: string; color: string }>;
  tags: string[];
  assignedUser: { id: string; name: string | null; email: string } | null;
  ownerUser: { id: string; name: string | null; email: string } | null;
  statusId: string;
  typeId: string | null;
  projectId: string | null;
};

type PropertyDetailPanelProps = {
  workspaceSlug: string;
  propertyId: string;
  defaultCurrency: string;
  workspaceTimezone: string;
  canUpdate: boolean;
  canArchive: boolean;
  canReadOpportunities: boolean;
  canCreateOpportunity: boolean;
  canReadActivities: boolean;
  canCreateActivity: boolean;
  canUpdateActivity: boolean;
  canArchiveActivity: boolean;
  canReadDocuments: boolean;
  canCreateDocument: boolean;
  canArchiveDocument: boolean;
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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function PropertyDetailPanel({
  workspaceSlug,
  propertyId,
  defaultCurrency,
  workspaceTimezone,
  canUpdate,
  canArchive,
  canReadOpportunities,
  canCreateOpportunity,
  canReadActivities,
  canCreateActivity,
  canUpdateActivity,
  canArchiveActivity,
  canReadDocuments,
  canCreateDocument,
  canArchiveDocument,
}: PropertyDetailPanelProps) {
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}`;

  const loadProperty = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    setNotFound(false);

    try {
      const response = await fetch(`${apiBase}/properties/${propertyId}`);
      const payload = await response.json();

      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load property.");
      }

      setProperty(payload.data.property as PropertyDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, propertyId]);

  useEffect(() => {
    void loadProperty();
  }, [loadProperty]);

  async function handleArchive() {
    if (!property || !canArchive) {
      return;
    }
    if (!window.confirm(`Archive property "${property.title}"?`)) {
      return;
    }

    const response = await fetch(`${apiBase}/properties/${propertyId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      window.alert(body.error?.message ?? "Failed to archive property.");
      return;
    }

    window.location.href = workspacePath(workspaceSlug, "properties");
  }

  if (forbidden) {
    return (
      <PermissionDenied
        title="Property unavailable"
        description="You do not have permission to view this property."
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (notFound) {
    return (
      <StateView
        variant="empty"
        title="Property not found"
        description="This property does not exist in this workspace or may have been archived."
        primaryAction={{
          label: "Back to properties",
          onClick: () => {
            window.location.href = workspacePath(workspaceSlug, "properties");
          },
        }}
      />
    );
  }

  if (error || !property) {
    return (
      <ErrorState
        title="Could not load property"
        description={error ?? "Failed to load property."}
        primaryAction={{ label: "Retry", onClick: () => void loadProperty() }}
      />
    );
  }

  const locationParts = [property.city, property.country].filter(Boolean);

  return (
    <>
      <PageHeader
        back={{
          href: workspacePath(workspaceSlug, "properties"),
          label: "Back to properties",
        }}
        title={
          <span className="flex items-center gap-2.5 flex-wrap">
            {property.title}
            {property.status && (
              <StatusBadge
                label={property.status.label}
                color={property.status.color}
                size="sm"
              />
            )}
          </span>
        }
        description={[
          property.type?.label,
          property.project?.name,
          locationParts.join(", "),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {canUpdate && (
              <Link href={workspacePath(workspaceSlug, "properties", propertyId, "edit")}>
                <Button variant="secondary">Edit</Button>
              </Link>
            )}
            {canArchive && (
              <Button variant="ghost" onClick={() => void handleArchive()}>
                Archive
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col md:flex-row gap-3 mb-4 md:h-[280px]">
        <div className="md:flex-[2] aspect-[16/9] md:aspect-auto md:h-full rounded-xl overflow-hidden bg-[var(--color-muted)] relative flex items-center justify-center text-[var(--color-ink-faint)]">
          <IconImage size={32} />
          <span className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-[#0f172a]/60 text-white text-[11.5px] font-medium backdrop-blur-sm">
            {formatSurfaceValue(property.surface, property.surfaceUnit ?? "sqm")} ·{" "}
            {property.rooms !== null ? `${property.rooms} rooms` : "—"}
          </span>
        </div>
        <div className="md:flex-1 md:h-full grid grid-cols-3 md:grid-cols-1 md:grid-rows-3 gap-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="aspect-[16/10] md:aspect-auto md:h-full rounded-lg overflow-hidden bg-[var(--color-muted)] flex items-center justify-center text-[var(--color-ink-faint)]"
            >
              <IconImage size={20} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1 self-start">
          <div className="flex items-end justify-between gap-2 mb-4">
            <div>
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold">
                Asking price
              </p>
              <p className="text-[26px] font-bold tracking-tight text-[var(--color-ink)] tabular">
                {formatPrice(property.price, property.currency)}
              </p>
            </div>
            {property.type && (
              <Badge tone="info" size="sm">
                {property.type.label}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-5">
            <Fact
              icon={<IconBed size={14} />}
              label="Rooms"
              value={property.rooms !== null ? String(property.rooms) : "—"}
            />
            <Fact
              icon={<IconBath size={14} />}
              label="Baths"
              value={property.bathrooms !== null ? String(property.bathrooms) : "—"}
            />
            <Fact
              icon={<IconRuler size={14} />}
              label="Area"
              value={formatSurfaceValue(property.surface, property.surfaceUnit ?? "sqm")}
            />
          </div>

          <div className="space-y-2.5 text-[13px]">
            <Row icon={<IconBuilding size={14} />} label="Project">
              {property.project?.name ?? "—"}
            </Row>
            <Row icon={<IconMapPin size={14} />} label="Address">
              {property.address ?? (locationParts.join(", ") || "—")}
            </Row>
            <Row icon={<IconCalendar size={14} />} label="Created">
              {formatDate(property.createdAt)}
            </Row>
          </div>

          <div className="border-t border-[var(--color-line)] my-5" />

          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
            Assigned agent
          </p>
          <p className="text-[13px] text-[var(--color-ink)]">
            {property.assignedUser?.name ?? property.assignedUser?.email ?? "Unassigned"}
          </p>

          <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mt-5 mb-2">
            Owner
          </p>
          <p className="text-[13px] text-[var(--color-ink)]">
            {property.ownerUser?.name ?? property.ownerUser?.email ?? "Unassigned"}
          </p>

          {property.tagsResolved.length > 0 && (
            <>
              <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mt-5 mb-2">
                Tags
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {property.tagsResolved.map((tag) => (
                  <Badge key={tag.id} tone="muted" size="sm">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </Card>

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
                        {property.description ??
                          "No description yet. Add details when editing this property."}
                      </p>
                    </div>
                    {property.features.length > 0 && (
                      <div>
                        <p className="text-[11.5px] uppercase tracking-wide text-[var(--color-ink-muted)] font-semibold mb-2">
                          Features
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {property.features.map((feature) => (
                            <Badge key={feature} tone="info" size="sm">
                              {feature}
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
                    <Info label="Reference" value={property.reference ?? "—"} />
                    <Info label="Floor" value={property.floor !== null ? String(property.floor) : "—"} />
                    <Info label="Type" value={property.type?.label ?? "—"} />
                    <Info label="Status" value={property.status?.label ?? "—"} />
                    <Info label="Rooms" value={property.rooms !== null ? String(property.rooms) : "—"} />
                    <Info
                      label="Bedrooms"
                      value={property.bedrooms !== null ? String(property.bedrooms) : "—"}
                    />
                    <Info
                      label="Bathrooms"
                      value={property.bathrooms !== null ? String(property.bathrooms) : "—"}
                    />
                    <Info
                      label="Surface"
                      value={formatSurfaceValue(property.surface, property.surfaceUnit ?? "sqm")}
                    />
                    <Info label="City" value={property.city ?? "—"} />
                    <Info label="Country" value={property.country ?? "—"} />
                  </div>
                ),
              },
              {
                key: "media",
                label: "Media",
                content: (
                  <div className="px-5 pb-5">
                    <StateView
                      variant="empty"
                      compact
                      title="No media yet"
                      description="Property gallery upload will be available in a later phase."
                    />
                  </div>
                ),
              },
              {
                key: "files",
                label: "Files",
                content: (
                  <DocumentsSection
                    workspaceSlug={workspaceSlug}
                    linkedEntityType="property"
                    linkedEntityId={propertyId}
                    canRead={canReadDocuments}
                    canCreate={canCreateDocument}
                    canArchive={canArchiveDocument}
                  />
                ),
              },
              {
                key: "notes",
                label: "Notes",
                content: (
                  <div className="px-5 pb-5">
                    <StateView
                      variant="empty"
                      compact
                      title="Notes coming soon"
                      description="Persisted timeline notes for properties will arrive in a later phase."
                    />
                  </div>
                ),
              },
              {
                key: "opps",
                label: "Opportunities",
                content: (
                  <OpportunitiesSection
                    workspaceSlug={workspaceSlug}
                    defaultCurrency={defaultCurrency}
                    propertyId={propertyId}
                    canRead={canReadOpportunities}
                    canCreate={canCreateOpportunity}
                  />
                ),
              },
              {
                key: "acts",
                label: "Activities",
                content: (
                  <ActivitiesSection
                    workspaceSlug={workspaceSlug}
                    workspaceTimezone={workspaceTimezone}
                    propertyId={propertyId}
                    canRead={canReadActivities}
                    canCreate={canCreateActivity}
                    canUpdate={canUpdateActivity}
                    canArchive={canArchiveActivity}
                    compact
                  />
                ),
              },
            ]}
          />
        </Card>
      </div>

    </>
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
