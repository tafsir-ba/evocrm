"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MemberSelector, type MemberSelectorMember } from "@/components/domain/member-selector";
import { ProjectSelector, type ProjectSelectorProject } from "@/components/domain/project-selector";
import { TagSelector, type TagSelectorTag } from "@/components/domain/tag-selector";
import {
  FocusedFormActions,
  FocusedFormLayout,
} from "@/components/layout/focused-form-layout";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import {
  parseSurfaceInput,
  sqmToInputValue,
  SURFACE_UNITS,
  SURFACE_UNIT_LABELS,
  type SurfaceUnit,
} from "@/lib/surface-unit";
import { workspacePath } from "@/lib/workspace-paths";

type DictionaryItem = {
  id: string;
  label: string;
  color: string;
  key: string;
  isDefault?: boolean;
};

export type PropertyFormInitialValues = {
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
  surfaceUnit: SurfaceUnit;
  floor: string;
  description: string;
  features: string;
  tagIds: string[];
  assignedTo: string;
};

type PropertyFormPageProps = {
  workspaceSlug: string;
  defaultCurrency: string;
  mode: "create" | "edit";
  propertyId?: string;
  initialValues?: PropertyFormInitialValues;
  cancelHref: string;
  back?: { href: string; label?: string };
};

const emptyForm = (defaultCurrency: string): PropertyFormInitialValues => ({
  title: "",
  reference: "",
  projectId: "",
  statusId: "",
  typeId: "",
  price: "",
  currency: defaultCurrency,
  address: "",
  city: "",
  country: "",
  rooms: "",
  bedrooms: "",
  bathrooms: "",
  surface: "",
  surfaceUnit: "sqm",
  floor: "",
  description: "",
  features: "",
  tagIds: [],
  assignedTo: "",
});

export function PropertyFormPage({
  workspaceSlug,
  defaultCurrency,
  mode,
  propertyId,
  initialValues,
  cancelHref,
  back,
}: PropertyFormPageProps) {
  const router = useRouter();
  const [form, setForm] = useState<PropertyFormInitialValues>(
    initialValues ?? emptyForm(defaultCurrency),
  );
  const [statuses, setStatuses] = useState<DictionaryItem[]>([]);
  const [types, setTypes] = useState<DictionaryItem[]>([]);
  const [projects, setProjects] = useState<ProjectSelectorProject[]>([]);
  const [tags, setTags] = useState<TagSelectorTag[]>([]);
  const [members, setMembers] = useState<MemberSelectorMember[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const apiBase = `/api/workspaces/${workspaceSlug}`;
  const formId = mode === "create" ? "create-property-form" : "edit-property-form";
  const isEdit = mode === "edit";

  const defaultStatusId = useMemo(
    () => statuses.find((item) => item.isDefault)?.id ?? statuses[0]?.id ?? "",
    [statuses],
  );

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
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
    } finally {
      setLoadingOptions(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (initialValues) {
      setForm(initialValues);
    }
  }, [initialValues]);

  useEffect(() => {
    if (!isEdit && !form.statusId && defaultStatusId) {
      setForm((current) => ({ ...current, statusId: defaultStatusId }));
    }
  }, [defaultStatusId, form.statusId, isEdit]);

  useEffect(() => {
    if (isEdit || form.projectId || projects.length === 0) {
      return;
    }

    if (projects.length === 1) {
      setForm((current) => ({ ...current, projectId: projects[0].id }));
    }
  }, [form.projectId, isEdit, projects]);

  function toggleTag(tagId: string) {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId)
        ? current.tagIds.filter((id) => id !== tagId)
        : [...current.tagIds, tagId],
    }));
  }

  function buildPayload() {
    const surfaceSqm = parseSurfaceInput(form.surface, form.surfaceUnit);
    const features = form.features
      ? form.features.split(",").map((feature) => feature.trim()).filter(Boolean)
      : isEdit
        ? []
        : undefined;

    return {
      title: form.title,
      statusId: form.statusId,
      reference: form.reference.trim() || (isEdit ? null : undefined),
      projectId: form.projectId || (isEdit ? null : undefined),
      typeId: form.typeId || (isEdit ? null : undefined),
      price: form.price ? Number(form.price) : isEdit ? null : undefined,
      currency: form.currency || defaultCurrency,
      address: form.address.trim() || (isEdit ? null : undefined),
      city: form.city.trim() || (isEdit ? null : undefined),
      country: form.country.trim() || (isEdit ? null : undefined),
      rooms: form.rooms ? Number(form.rooms) : isEdit ? null : undefined,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : isEdit ? null : undefined,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : isEdit ? null : undefined,
      surface: surfaceSqm ?? (isEdit ? null : undefined),
      surfaceUnit: form.surfaceUnit,
      floor: form.floor ? Number(form.floor) : isEdit ? null : undefined,
      description: form.description.trim() || (isEdit ? null : undefined),
      features,
      tags: form.tagIds,
      assignedTo: form.assignedTo || (isEdit ? null : undefined),
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(
        isEdit ? `${apiBase}/properties/${propertyId}` : `${apiBase}/properties`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        },
      );
      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error?.message ?? `Failed to ${isEdit ? "update" : "create"} property.`,
        );
      }

      const savedPropertyId = isEdit ? propertyId : body.data.property?.id;
      if (savedPropertyId) {
        router.push(workspacePath(workspaceSlug, "properties", savedPropertyId));
        router.refresh();
      } else {
        router.push(workspacePath(workspaceSlug, "properties"));
        router.refresh();
      }
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "Failed to save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FocusedFormLayout
      title={isEdit ? "Edit property" : "New property"}
      description={
        isEdit
          ? "Update listing details, location, and assignment."
          : "Add a new property listing to your workspace."
      }
      back={back}
      maxWidth="3xl"
    >
      <form id={formId} className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <div>
          <Label htmlFor="title" required>
            Title
          </Label>
          <Input
            id="title"
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            required
            disabled={loadingOptions}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              value={form.reference}
              onChange={(event) =>
                setForm((current) => ({ ...current, reference: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="statusId" required>
              Status
            </Label>
            <Select
              id="statusId"
              value={form.statusId}
              onChange={(event) =>
                setForm((current) => ({ ...current, statusId: event.target.value }))
              }
              required
              disabled={loadingOptions}
            >
              <option value="">Select status</option>
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
            <Label htmlFor="typeId">Type</Label>
            <Select
              id="typeId"
              value={form.typeId}
              onChange={(event) =>
                setForm((current) => ({ ...current, typeId: event.target.value }))
              }
              disabled={loadingOptions}
            >
              <option value="">{isEdit ? "No type" : "Select type"}</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="projectId">Project</Label>
            <ProjectSelector
              projects={projects}
              selectedProjectId={form.projectId || null}
              onChange={(projectId) =>
                setForm((current) => ({ ...current, projectId: projectId ?? "" }))
              }
              placeholder="No project"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              type="number"
              min={0}
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({ ...current, price: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              value={form.currency}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  currency: event.target.value.toUpperCase(),
                }))
              }
              maxLength={3}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="address">Address</Label>
          <Input
            id="address"
            value={form.address}
            onChange={(event) =>
              setForm((current) => ({ ...current, address: event.target.value }))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={form.city}
              onChange={(event) =>
                setForm((current) => ({ ...current, city: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={form.country}
              onChange={(event) =>
                setForm((current) => ({ ...current, country: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="rooms">Rooms</Label>
            <Input
              id="rooms"
              type="number"
              min={0}
              value={form.rooms}
              onChange={(event) =>
                setForm((current) => ({ ...current, rooms: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="bedrooms">Bedrooms</Label>
            <Input
              id="bedrooms"
              type="number"
              min={0}
              value={form.bedrooms}
              onChange={(event) =>
                setForm((current) => ({ ...current, bedrooms: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="bathrooms">Bathrooms</Label>
            <Input
              id="bathrooms"
              type="number"
              min={0}
              value={form.bathrooms}
              onChange={(event) =>
                setForm((current) => ({ ...current, bathrooms: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="surface">Surface</Label>
            <Input
              id="surface"
              type="number"
              min={0}
              value={form.surface}
              onChange={(event) =>
                setForm((current) => ({ ...current, surface: event.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="surfaceUnit">Unit</Label>
            <Select
              id="surfaceUnit"
              value={form.surfaceUnit}
              onChange={(event) => {
                const nextUnit = event.target.value as SurfaceUnit;
                const currentSqm = parseSurfaceInput(form.surface, form.surfaceUnit);
                setForm((current) => ({
                  ...current,
                  surfaceUnit: nextUnit,
                  surface: sqmToInputValue(currentSqm, nextUnit),
                }));
              }}
            >
              {SURFACE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {SURFACE_UNIT_LABELS[unit]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="floor">Floor</Label>
          <Input
            id="floor"
            type="number"
            value={form.floor}
            onChange={(event) =>
              setForm((current) => ({ ...current, floor: event.target.value }))
            }
          />
        </div>

        <div>
          <Label htmlFor="assignedTo">Assigned to</Label>
          <MemberSelector
            members={members}
            selectedUserId={form.assignedTo || null}
            onChange={(userId) =>
              setForm((current) => ({
                ...current,
                assignedTo: userId ?? "",
              }))
            }
            placeholder="Unassigned"
          />
        </div>

        <div>
          <Label htmlFor="features">Features</Label>
          <Input
            id="features"
            placeholder="Lake view, Balcony, Parking"
            value={form.features}
            onChange={(event) =>
              setForm((current) => ({ ...current, features: event.target.value }))
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
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            rows={4}
          />
        </div>

        {formError && (
          <p className="text-[13px] text-[var(--color-danger-fg)]">{formError}</p>
        )}

        <FocusedFormActions
          cancelHref={cancelHref}
          formId={formId}
          submitLabel={isEdit ? "Save changes" : "Create property"}
          submitting={submitting}
          submitDisabled={loadingOptions || !form.statusId || !form.title.trim()}
        />
      </form>
    </FocusedFormLayout>
  );
}

export function propertyFormValuesFromSqm(
  property: {
    title: string;
    reference: string | null;
    projectId: string | null;
    statusId: string;
    typeId: string | null;
    price: number | null;
    currency: string;
    address: string | null;
    city: string | null;
    country: string | null;
    rooms: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    surface: number | null;
    surfaceUnit?: SurfaceUnit;
    floor: number | null;
    description: string | null;
    features: string[];
    tags: string[];
    assignedUser: { id: string } | null;
  },
  defaultCurrency: string,
): PropertyFormInitialValues {
  const surfaceUnit = property.surfaceUnit ?? "sqm";
  return {
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
    surface: sqmToInputValue(property.surface, surfaceUnit),
    surfaceUnit,
    floor: property.floor?.toString() ?? "",
    description: property.description ?? "",
    features: property.features.join(", "),
    tagIds: property.tags,
    assignedTo: property.assignedUser?.id ?? "",
  };
}
