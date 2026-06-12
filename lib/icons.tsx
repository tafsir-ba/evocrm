import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (props: IconProps) => ({
  width: props.size ?? 16,
  height: props.size ?? 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export function IconLogo(props: IconProps) {
  return (
    <svg {...base({ ...props, fill: "currentColor", stroke: "none" })}>
      <path d="M5 11.5 12 5l7 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-3a1 1 0 0 1-1-1V15h-3v4.5a1 1 0 0 1-1 1h-3A1.5 1.5 0 0 1 5 19v-7.5Z" />
    </svg>
  );
}
export function IconDashboard(p: IconProps) { return (<svg {...base(p)}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>); }
export function IconPipeline(p: IconProps) { return (<svg {...base(p)}><rect x="3" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/></svg>); }
export function IconLeads(p: IconProps) { return (<svg {...base(p)}><circle cx="9" cy="8" r="3.5"/><path d="M3 20c.5-3 3-5 6-5s5.5 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M21 19c-.4-2-1.8-3.5-4-3.9"/></svg>); }
export function IconProperties(p: IconProps) { return (<svg {...base(p)}><path d="M4 10 12 4l8 6v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9Z"/></svg>); }
export function IconActivities(p: IconProps) { return (<svg {...base(p)}><path d="M9 11l2 2 4-4"/><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M8 2v4M16 2v4M3 9h18"/></svg>); }
export function IconDripping(p: IconProps) { return (<svg {...base(p)}><path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10Z"/></svg>); }
export function IconSettings(p: IconProps) { return (<svg {...base(p)}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>); }
export function IconSearch(p: IconProps) { return (<svg {...base(p)}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>); }
export function IconFilter(p: IconProps) { return (<svg {...base(p)}><path d="M3 5h18M6 12h12M10 19h4"/></svg>); }
export function IconPlus(p: IconProps) { return (<svg {...base(p)}><path d="M12 5v14M5 12h14"/></svg>); }
export function IconChevronDown(p: IconProps) { return (<svg {...base(p)}><path d="m6 9 6 6 6-6"/></svg>); }
export function IconChevronRight(p: IconProps) { return (<svg {...base(p)}><path d="m9 6 6 6-6 6"/></svg>); }
export function IconChevronLeft(p: IconProps) { return (<svg {...base(p)}><path d="m15 6-6 6 6 6"/></svg>); }
export function IconArrowLeft(p: IconProps) { return (<svg {...base(p)}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>); }
export function IconMore(p: IconProps) { return (<svg {...base(p)}><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>); }
export function IconClose(p: IconProps) { return (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18"/></svg>); }
export function IconCheck(p: IconProps) { return (<svg {...base(p)}><path d="m5 12 5 5 9-11"/></svg>); }
export function IconMail(p: IconProps) { return (<svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/></svg>); }
export function IconPhone(p: IconProps) { return (<svg {...base(p)}><path d="M5 4h3l2 5-2 1a11 11 0 0 0 6 6l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>); }
export function IconCalendar(p: IconProps) { return (<svg {...base(p)}><rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>); }
export function IconClock(p: IconProps) { return (<svg {...base(p)}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>); }
export function IconMapPin(p: IconProps) { return (<svg {...base(p)}><path d="M12 21s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>); }
export function IconBuilding(p: IconProps) { return (<svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>); }
export function IconBed(p: IconProps) { return (<svg {...base(p)}><path d="M3 18v-3a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v3M3 18v3M21 18v3M7 12V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/></svg>); }
export function IconBath(p: IconProps) { return (<svg {...base(p)}><path d="M3 13h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3ZM6 13V6a2 2 0 0 1 2-2h1M9 6h3"/></svg>); }
export function IconRuler(p: IconProps) { return (<svg {...base(p)}><path d="m3 17 14-14 4 4L7 21l-4-4Z"/><path d="m7 7 2 2M10 10l2 2M13 13l2 2"/></svg>); }
export function IconFile(p: IconProps) { return (<svg {...base(p)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg>); }
export function IconNote(p: IconProps) { return (<svg {...base(p)}><path d="M5 4h10l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 10h6M8 14h8M8 18h5"/></svg>); }
export function IconImage(p: IconProps) { return (<svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 19 6-7 5 6 3-3 2 2"/></svg>); }
export function IconAlert(p: IconProps) { return (<svg {...base(p)}><path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v5M12 18.5h0"/></svg>); }
export function IconShield(p: IconProps) { return (<svg {...base(p)}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/></svg>); }
export function IconInbox(p: IconProps) { return (<svg {...base(p)}><path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/><path d="M3 13 6 4h12l3 9"/><path d="M3 13h5l2 3h4l2-3h5"/></svg>); }
export function IconCamera(p: IconProps) { return (<svg {...base(p)}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/></svg>); }
export function IconHash(p: IconProps) { return (<svg {...base(p)}><path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16"/></svg>); }
export function IconGoogle(p: IconProps) {
  const size = p.size ?? 18;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden {...p}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3A12 12 0 1 1 24 12a12 12 0 0 1 7.9 3l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5Z"/>
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12a12 12 0 0 1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7Z"/>
      <path fill="#4CAF50" d="M24 44a20 20 0 0 0 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5A20 20 0 0 0 24 44Z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39 35.5 44 30.4 44 24c0-1.2-.1-2.4-.4-3.5Z"/>
    </svg>
  );
}
export function IconEye(p: IconProps) { return (<svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>); }
export function IconUser(p: IconProps) { return (<svg {...base(p)}><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></svg>); }
export function IconLogout(p: IconProps) { return (<svg {...base(p)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 17-5-5 5-5M5 12h11"/></svg>); }
export function IconMenu(p: IconProps) { return (<svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16"/></svg>); }
export function IconBell(p: IconProps) { return (<svg {...base(p)}><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>); }
export function IconArrowUp(p: IconProps) { return (<svg {...base(p)}><path d="m6 14 6-6 6 6"/></svg>); }
export function IconArrowDown(p: IconProps) { return (<svg {...base(p)}><path d="m6 10 6 6 6-6"/></svg>); }
export function IconExternalLink(p: IconProps) { return (<svg {...base(p)}><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M14 4h6v6M20 4 11 13"/></svg>); }
export function IconTag(p: IconProps) { return (<svg {...base(p)}><path d="M12 2H4a2 2 0 0 0-2 2v8l10 10 10-10L14 2h-2Z"/><circle cx="7" cy="7" r="1.5"/></svg>); }
export function IconFolder(p: IconProps) { return (<svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/></svg>); }
export function IconCreditCard(p: IconProps) { return (<svg {...base(p)}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>); }
export function IconShieldUser(p: IconProps) { return (<svg {...base(p)}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><circle cx="12" cy="11" r="2.5"/><path d="M8 17c.5-2 2-3 4-3s3.5 1 4 3"/></svg>); }
export function IconBriefcase(p: IconProps) { return (<svg {...base(p)}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>); }
export function IconSparkles(p: IconProps) { return (<svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.5 5.5l2.5 2.5M16 16l2.5 2.5M5.5 18.5 8 16M16 8l2.5-2.5"/></svg>); }
