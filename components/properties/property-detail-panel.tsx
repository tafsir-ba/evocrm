"use client";

import { useCallback, useEffect, useState } from "react";

import { OpportunitiesSection } from "@/components/opportunities/opportunities-section";
import { ActivitiesSection } from "@/components/activities/activities-section";
import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { ProjectSelector, type ProjectSelectorProject } from "@/components/domain/project-selector";
import { StatusBadge } from "@/components/domain/status-badge";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import { PageHeader } from "@/components/layout/page-header";
import { StateView } from "@/components/states/state-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PermissionDenied } from "@/components/ui/permission-denied";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
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

type PropertyFormState = {
  title: string;
  reference: string;
  projectId: string;
  statusId: string;
  typeId: string;
  price: string;
  currency: string;
  address: string;
  city: string;
  country: string;
  rooms: string;
  bedrooms: string;
  bathrooms: string;
  surface: string;
  floor: string;
  description: string;
  features: string;
  tagIds: string[];
  assignedTo: string;
};

type PropertyDetailPanelProps = {
  workspaceSlug: string;
  propertyId: string;
  defaultCurrency: string;
  canUpdate: boolean;
  canArchive: boolean;
  canReadOpportunities: boolean;
  canCreateOpportunity: boolean;
  canReadActivities: boolean;
  canCreateActivity: boolean;
  canUpdateActivity: boolean;
  canArchiveActivity: boolean;
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
  canUpdate,
  canArchive,
  canReadOpportunities,
  canCreateOpportunity,
  canReadActivities,
  canCreateActivity,
  canUpdateActivity,
  canArchiveActivity,
}: PropertyDetailPanelProps) {
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [types, setTypes] = useState<DictionaryItem[]>([]);
  const [projects, setProjects] = useState<ProjectSelectorProject[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<PropertyFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const loadOptions = useCallback(async () => {
    try {
      const [statusRes, typeRes, projectsRes, tagsRes, membersRes] = await Promise.all([
        fetch(`${apiBase}/dictionary-items?type=property_status`),
        fetch(`${apiBase}/dictionary-items?type=property_type`),
        fetch(`${apiBase}/projects`),
        fetch(`${apiBase}/tags?entityType=property`),
        fetch(`${apiBase}/members`),
      ]);
      const [statusPayload, typePayload, projectsPayload, tagsPayload, membersPayload] =
        await Promise.all([
          statusRes.json(),
          typeRes.json(),
          projectsRes.json(),
          tagsRes.json(),
          membersRes.json(),
        ]);
      if (statusRes.ok) {
        setStatuses(statusPayload.data.items as DictionaryItem[]);
      }
      if (typeRes.ok) {
        setTypes(typePayload.data.items as DictionaryItem[]);
      }
      if (projectsRes.ok) {
        setProjects(projectsPayload.data.projects as ProjectSelectorProject[]);
      }
      if (tagsRes.ok) {
        setTags(tagsPayload.data.tags as TagSelectorTag[]);
      }
      if (membersRes.ok) {
        setMembers(membersPayload.data.members as MemberSelectorMember[]);
      }
    } catch {
      // Non-blocking.
    }
  }, [apiBase]);

  useEffect(() => {
    void loadProperty();
    void loadOptions();
  }, [loadProperty, loadOptions]);

  function openEditDrawer() {
    if (!property) {
      return;
    }
    setFormError(null);
    setForm({
      title: property.title,
      reference: property.reference ?? "",
      projectId: property.projectId ?? "",
      statusId: property.statusId,
      typeId: property.typeId ?? "",
      price: property.price?.toString() ?? "",
      currency: property.currency || defaultCurrency,
      address: property.address ?? "",
      city: property.city ?? "",
      country: property.country ?? "",
      rooms: property.rooms?.toString() ?? "",
      bedrooms: property.bedrooms?.toString() ?? "",
      bathrooms: property.bathrooms?.toString() ?? "",
      surface: property.surface?.toString() ?? "",
      floor: property.floor?.toString() ?? "",
      description: property.description ?? "",
      features: property.features.join(", "),
      tagIds: property.tags,
      assignedTo: property.assignedUser?.id ?? "",
    });
    setDrawerOpen(true);
  }

  function toggleTag(tagId: string) {
    setForm((current) =>
      current
        ? {
            ...current,
            tagIds: current.tagIds.includes(tagId)
              ? current.tagIds.filter((id) => id !== tagId)
              : [...current.tagIds, tagId],
          }
        : current,
    );
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!form) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const payload = {
        title: form.title,
        statusId: form.statusId,
        reference: form.reference.trim() || null,
        projectId: form.projectId || null,
        typeId: form.typeId || null,
        price: form.price ? Number(form.price) : null,
        currency: form.currency || defaultCurrency,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        rooms: form.rooms ? Number(form.rooms) : null,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
        surface: form.surface ? Number(form.surface) : null,
        floor: form.floor ? Number(form.floor) : null,
        description: form.description.trim() || null,
        features: form.features
          ? form.features.split(",").map((feature) => feature.trim()).filter(Boolean)
          : [],
        tags: form.tagIds,
        assignedTo: form.assignedTo || null,
      };

      const response = await fetch(`${apiBase}/properties/${propertyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to update property.");
      }

      setProperty(body.data.property as PropertyDetail);
      setDrawerOpen(false);
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "Failed to update.");
    } finally {
      setSubmitting(false);
    }
  }

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
              <Button variant="secondary" onClick={openEditDrawer}>
                Edit
              </Button>
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
            {property.surface ? `${property.surface} m²` : "—"} ·{" "}
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
              value={property.surface !== null ? `${property.surface} m²` : "—"}
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
                      value={property.surface !== null ? `${property.surface} m²` : "—"}
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
                  <div className="px-5 pb-5">
                    <StateView
                      variant="empty"
                      compact
                      title="No files attached"
                      description="Floor plans, contracts and brochures will live here. Document handling comes online in a later phase."
                    />
                  </div>
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

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Edit property"
        className="w-[min(100%,480px)]"
      >
        {form && (
          <form className="space-y-4" onSubmit={(event) => void handleUpdate(event)}>
            <div>
              <Label htmlFor="edit-title" required>
                Title
              </Label>
              <Input
                id="edit-title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-reference">Reference</Label>
                <Input
                  id="edit-reference"
                  value={form.reference}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, reference: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-statusId" required>
                  Status
                </Label>
                <Select
                  id="edit-statusId"
                  value={form.statusId}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, statusId: event.target.value } : current,
                    )
                  }
                  required
                >
                  {statuses.map((status) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-typeId">Type</Label>
                <Select
                  id="edit-typeId"
                  value={form.typeId}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, typeId: event.target.value } : current,
                    )
                  }
                >
                  <option value="">No type</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-projectId">Project</Label>
                <ProjectSelector
                  projects={projects}
                  selectedProjectId={form.projectId || null}
                  onChange={(projectId) =>
                    setForm((current) =>
                      current ? { ...current, projectId: projectId ?? "" } : current,
                    )
                  }
                  placeholder="No project"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-price">Price</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, price: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-currency">Currency</Label>
                <Input
                  id="edit-currency"
                  value={form.currency}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, currency: event.target.value.toUpperCase() }
                        : current,
                    )
                  }
                  maxLength={3}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={form.address}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, address: event.target.value } : current,
                  )
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-city">City</Label>
                <Input
                  id="edit-city"
                  value={form.city}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, city: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-country">Country</Label>
                <Input
                  id="edit-country"
                  value={form.country}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, country: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="edit-rooms">Rooms</Label>
                <Input
                  id="edit-rooms"
                  type="number"
                  min={0}
                  value={form.rooms}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, rooms: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-bedrooms">Bedrooms</Label>
                <Input
                  id="edit-bedrooms"
                  type="number"
                  min={0}
                  value={form.bedrooms}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, bedrooms: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-bathrooms">Bathrooms</Label>
                <Input
                  id="edit-bathrooms"
                  type="number"
                  min={0}
                  value={form.bathrooms}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, bathrooms: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-surface">Surface (m²)</Label>
                <Input
                  id="edit-surface"
                  type="number"
                  min={0}
                  value={form.surface}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, surface: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-floor">Floor</Label>
                <Input
                  id="edit-floor"
                  type="number"
                  value={form.floor}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, floor: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-assignedTo">Assigned to</Label>
              <MemberSelector
                members={members}
                selectedUserId={form.assignedTo || null}
                onChange={(userId) =>
                  setForm((current) =>
                    current ? { ...current, assignedTo: userId ?? "" } : current,
                  )
                }
                placeholder="Unassigned"
              />
            </div>

            <div>
              <Label htmlFor="edit-features">Features</Label>
              <Input
                id="edit-features"
                placeholder="Lake view, Balcony, Parking"
                value={form.features}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, features: event.target.value } : current,
                  )
                }
              />
            </div>

            <div>
              <Label>Tags</Label>
              <TagSelector
                tags={tags}
                entityType="property"
                selectedTagIds={form.tagIds}
                onToggle={toggleTag}
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )
                }
                rows={4}
              />
            </div>

            {formError && (
              <p className="text-[13px] text-[var(--color-danger-fg)]">{formError}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        )}
      </Drawer>
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
