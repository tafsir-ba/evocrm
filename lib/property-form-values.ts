import { sqmToInputValue, type SurfaceUnit } from "@/lib/surface-unit";

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
  totalSurface: string;
  balconyTerraceSurface: string;
  surfaceUnit: SurfaceUnit;
  floor: string;
  building: string;
  lot: string;
  description: string;
  features: string;
  tagIds: string[];
  assignedTo: string;
};

/** Shared server/client helper — must stay outside `"use client"` modules. */
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
    totalSurface: number | null;
    balconyTerraceSurface: number | null;
    surfaceUnit?: SurfaceUnit;
    floor: number | null;
    building: string | null;
    lot: string | null;
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
    totalSurface: sqmToInputValue(property.totalSurface, surfaceUnit),
    balconyTerraceSurface: sqmToInputValue(property.balconyTerraceSurface, surfaceUnit),
    surfaceUnit,
    floor: property.floor?.toString() ?? "",
    building: property.building ?? "",
    lot: property.lot ?? "",
    description: property.description ?? "",
    features: property.features.join(", "),
    tagIds: property.tags,
    assignedTo: property.assignedUser?.id ?? "",
  };
}
