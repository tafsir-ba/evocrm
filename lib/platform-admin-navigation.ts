export type PlatformAdminNavSegment = "overview" | "feedback";

export type PlatformAdminNavItem = {
  segment: PlatformAdminNavSegment;
  label: string;
  href: string;
  description: string;
};

export const PLATFORM_ADMIN_NAV: PlatformAdminNavItem[] = [
  {
    segment: "overview",
    label: "Overview",
    href: "/admin",
    description: "Platform operator status and quick links.",
  },
  {
    segment: "feedback",
    label: "Feedback",
    href: "/admin/feedback",
    description: "Review, resolve, and triage in-app user feedback.",
  },
];

export function getPlatformAdminNavItem(
  segment: PlatformAdminNavSegment,
): PlatformAdminNavItem | undefined {
  return PLATFORM_ADMIN_NAV.find((item) => item.segment === segment);
}
