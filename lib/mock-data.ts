/**
 * Phase 1 mock data.
 *
 * IMPORTANT: All values here are *visual placeholders only*.
 * Real statuses, pipeline stages, sources, tags, roles, dictionaries
 * and pricing will come from backend APIs / workspace dictionaries
 * in later phases. Do not treat this as canonical product taxonomy.
 */

import type { StatusTone } from "@/components/ui/badge";

export type { StatusTone };

export type LeadStatus = "New" | "Contacted" | "Qualified" | "Lost";
export type PipelineStage =
  | "New"
  | "Qualified"
  | "Visit"
  | "Offer"
  | "Negotiation"
  | "Won"
  | "Lost";

export type PropertyStatus = "Available" | "Reserved" | "Sold" | "Off-market";
export type ActivityType =
  | "Call"
  | "Email"
  | "Meeting"
  | "Visit"
  | "Task"
  | "Note";
export type ActivityStatus = "Upcoming" | "Done" | "Pending" | "Overdue";

export type User = {
  id: string;
  name: string;
  initials: string;
  email: string;
};

export const currentUser: User = {
  id: "u1",
  name: "John Doe",
  initials: "JD",
  email: "john.doe@evohome.example",
};

export const teamUsers: User[] = [
  currentUser,
  { id: "u2", name: "Jane Roe", initials: "JR", email: "jane.roe@evohome.example" },
  { id: "u3", name: "Marc Berger", initials: "MB", email: "marc.berger@evohome.example" },
  { id: "u4", name: "Sofia Keller", initials: "SK", email: "sofia.keller@evohome.example" },
];

export const workspaces = [
  {
    id: "ws1",
    name: "Demo Workspace",
    slug: "demo-workspace",
    initials: "DW",
  },
  { id: "ws2", name: "Lausanne Office", slug: "lausanne", initials: "LA" },
];

/* ---------- Dashboard metrics ---------- */
export const dashboardMetrics = [
  { key: "leads", label: "New Leads", value: "128", delta: 12, hint: "vs last 30 days" },
  { key: "ops", label: "Opportunities", value: "74", delta: 8, hint: "vs last 30 days" },
  { key: "won", label: "Won Deals", value: "18", delta: 20, hint: "vs last 30 days" },
  { key: "revenue", label: "Revenue", value: "CHF 2.45M", delta: 19, hint: "vs last 30 days" },
];

export const pipelineOverview = [
  { stage: "New", count: 28 },
  { stage: "Qualified", count: 18 },
  { stage: "Visit", count: 12 },
  { stage: "Offer", count: 9 },
  { stage: "Negotiation", count: 5 },
  { stage: "Won", count: 2 },
];

export const leadsBySource = [
  { label: "Website", value: 40, color: "#2563eb" },
  { label: "Google Ads", value: 30, color: "#7c3aed" },
  { label: "Referral", value: 20, color: "#10b981" },
  { label: "Portal", value: 18, color: "#f59e0b" },
  { label: "Others", value: 14, color: "#64748b" },
];

/* ---------- Leads ---------- */
export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  source: string;
  status: LeadStatus;
  assigned: User;
  created: string;
  tags: { label: string; tone: StatusTone }[];
  budget?: string;
  interest?: string;
  preferredAreas?: string[];
  language?: string;
  notes?: string;
};

export const leads: Lead[] = [
  {
    id: "L-1042",
    name: "John Smith",
    email: "john.smith@email.com",
    phone: "+41 79 123 45 67",
    city: "Geneva",
    source: "Website",
    status: "New",
    assigned: teamUsers[0],
    created: "May 28, 2024",
    tags: [{ label: "Investor", tone: "info" }],
    budget: "CHF 800K – 1.2M",
    interest: "Apartments, 2–3 rooms",
    preferredAreas: ["Geneva", "Nyon"],
    language: "English",
  },
  {
    id: "L-1041",
    name: "Sarah Johnson",
    email: "sarah.j@email.com",
    phone: "+41 78 220 11 03",
    city: "Lausanne",
    source: "Google Ads",
    status: "Contacted",
    assigned: teamUsers[1],
    created: "May 27, 2024",
    tags: [{ label: "Hot", tone: "danger" }],
    budget: "CHF 600K – 900K",
    interest: "Villa with garden",
    preferredAreas: ["Lausanne", "Pully"],
    language: "French",
  },
  {
    id: "L-1040",
    name: "Michael Lee",
    email: "m.lee@email.com",
    phone: "+41 76 401 90 12",
    city: "Zurich",
    source: "Referral",
    status: "Qualified",
    assigned: teamUsers[0],
    created: "May 26, 2024",
    tags: [{ label: "Investor", tone: "info" }],
    budget: "CHF 1.5M – 2.2M",
    interest: "Multi-unit residential",
    preferredAreas: ["Zurich", "Zug"],
    language: "English",
  },
  {
    id: "L-1039",
    name: "Emma Brown",
    email: "emma.brown@email.com",
    phone: "+41 79 887 22 55",
    city: "Geneva",
    source: "Portal",
    status: "New",
    assigned: teamUsers[1],
    created: "May 25, 2024",
    tags: [],
  },
  {
    id: "L-1038",
    name: "David Wilson",
    email: "d.wilson@email.com",
    phone: "+41 79 600 14 78",
    city: "Nyon",
    source: "Website",
    status: "Contacted",
    assigned: teamUsers[0],
    created: "May 24, 2024",
    tags: [{ label: "Hot", tone: "danger" }],
  },
  {
    id: "L-1037",
    name: "Olivia Davis",
    email: "olivia.d@email.com",
    phone: "+41 79 311 90 66",
    city: "Geneva",
    source: "Google Ads",
    status: "New",
    assigned: teamUsers[1],
    created: "May 23, 2024",
    tags: [],
  },
  {
    id: "L-1036",
    name: "Daniel Garcia",
    email: "d.garcia@email.com",
    phone: "+41 76 720 18 02",
    city: "Lausanne",
    source: "Referral",
    status: "Qualified",
    assigned: teamUsers[0],
    created: "May 22, 2024",
    tags: [{ label: "Investor", tone: "info" }],
  },
];

/* ---------- Properties ---------- */
export type Property = {
  id: string;
  title: string;
  project: string;
  type: "Apartment" | "Villa" | "House" | "Plot" | "Office";
  status: PropertyStatus;
  price: string;
  rooms: number;
  bathrooms?: number;
  area?: string;
  floor?: string;
  city: string;
  address?: string;
  description?: string;
  features?: string[];
  assigned: User;
  tags: { label: string; tone: StatusTone }[];
  imageUrl: string;
  gallery?: string[];
  created?: string;
};

const stockImg = (id: number) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=70`;
void stockImg;

export const properties: Property[] = [
  {
    id: "P-2201",
    title: "Green View Apt. 12",
    project: "Green View",
    type: "Apartment",
    status: "Available",
    price: "CHF 875,000",
    rooms: 3,
    bathrooms: 2,
    area: "96 m²",
    floor: "Floor 2",
    city: "Geneva",
    address: "Route de Florissant 12, 1206 Geneva",
    description:
      "Beautiful 3-room apartment with lake view, located on the 2nd floor of the Green View residence. High-end finishes and quiet environment.",
    features: ["Lake View", "Balcony", "Parking", "Elevator", "Cellar"],
    assigned: teamUsers[0],
    tags: [{ label: "New listing", tone: "info" }],
    imageUrl:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=70",
    gallery: [
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=400&q=70",
      "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=400&q=70",
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=400&q=70",
    ],
    created: "May 10, 2024",
  },
  {
    id: "P-2202",
    title: "Lake Residences 2A",
    project: "Lake Residences",
    type: "Apartment",
    status: "Available",
    price: "CHF 920,000",
    rooms: 4,
    bathrooms: 2,
    area: "112 m²",
    floor: "Floor 4",
    city: "Lausanne",
    assigned: teamUsers[1],
    tags: [],
    imageUrl:
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=70",
  },
  {
    id: "P-2203",
    title: "Sunset Villas 7",
    project: "Sunset Villas",
    type: "Villa",
    status: "Available",
    price: "CHF 1,850,000",
    rooms: 5,
    bathrooms: 3,
    area: "240 m²",
    city: "Nyon",
    assigned: teamUsers[2],
    tags: [{ label: "Premium", tone: "warn" }],
    imageUrl:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70",
  },
  {
    id: "P-2204",
    title: "Green View Apt. 5",
    project: "Green View",
    type: "Apartment",
    status: "Reserved",
    price: "CHF 700,000",
    rooms: 3,
    bathrooms: 1,
    area: "84 m²",
    city: "Geneva",
    assigned: teamUsers[0],
    tags: [],
    imageUrl:
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=70",
  },
  {
    id: "P-2205",
    title: "Lake Residences 3B",
    project: "Lake Residences",
    type: "Apartment",
    status: "Available",
    price: "CHF 954,000",
    rooms: 4,
    bathrooms: 2,
    area: "118 m²",
    city: "Lausanne",
    assigned: teamUsers[3],
    tags: [],
    imageUrl:
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1200&q=70",
  },
  {
    id: "P-2206",
    title: "Sunset Villas 1",
    project: "Sunset Villas",
    type: "Villa",
    status: "Sold",
    price: "CHF 1,720,000",
    rooms: 5,
    bathrooms: 3,
    area: "260 m²",
    city: "Nyon",
    assigned: teamUsers[2],
    tags: [],
    imageUrl:
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=70",
  },
  {
    id: "P-2207",
    title: "Green View Apt. 2",
    project: "Green View",
    type: "Apartment",
    status: "Available",
    price: "CHF 810,000",
    rooms: 3,
    bathrooms: 2,
    area: "92 m²",
    city: "Geneva",
    assigned: teamUsers[1],
    tags: [],
    imageUrl:
      "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=70",
  },
];

/* ---------- Opportunities / Pipeline ---------- */
export type Opportunity = {
  id: string;
  leadName: string;
  propertyName: string;
  value: string;
  stage: PipelineStage;
  probability: number;
  expectedClose: string;
  assigned: User;
};

export const opportunities: Opportunity[] = [
  { id: "O-301", leadName: "John Smith", propertyName: "Green View Apt. 12", value: "CHF 850K", stage: "New", probability: 20, expectedClose: "Jun 28, 2024", assigned: teamUsers[0] },
  { id: "O-302", leadName: "Emma Brown", propertyName: "Lake Residences 2B", value: "CHF 620K", stage: "New", probability: 15, expectedClose: "Jul 02, 2024", assigned: teamUsers[1] },
  { id: "O-303", leadName: "Michael Lee", propertyName: "Sunset Villas 7", value: "CHF 1.63M", stage: "New", probability: 18, expectedClose: "Jul 12, 2024", assigned: teamUsers[0] },
  { id: "O-304", leadName: "Sarah Johnson", propertyName: "Green View Apt. 5", value: "CHF 700K", stage: "Qualified", probability: 35, expectedClose: "Jun 22, 2024", assigned: teamUsers[1] },
  { id: "O-305", leadName: "David Wilson", propertyName: "Lake Residences 2A", value: "CHF 920K", stage: "Qualified", probability: 32, expectedClose: "Jul 01, 2024", assigned: teamUsers[0] },
  { id: "O-306", leadName: "Laura Martin", propertyName: "Sunset Villas 4", value: "CHF 1.55M", stage: "Qualified", probability: 40, expectedClose: "Jul 14, 2024", assigned: teamUsers[2] },
  { id: "O-307", leadName: "Daniel Garcia", propertyName: "Green View Apt. 8", value: "CHF 720K", stage: "Visit", probability: 55, expectedClose: "Jun 18, 2024", assigned: teamUsers[0] },
  { id: "O-308", leadName: "Olivia Davis", propertyName: "Lake Residences 1C", value: "CHF 580K", stage: "Visit", probability: 50, expectedClose: "Jun 25, 2024", assigned: teamUsers[1] },
  { id: "O-309", leadName: "Robert Taylor", propertyName: "Sunset Villas 3", value: "CHF 530K", stage: "Visit", probability: 48, expectedClose: "Jul 05, 2024", assigned: teamUsers[2] },
  { id: "O-310", leadName: "James Anderson", propertyName: "Green View Apt. 2", value: "CHF 680K", stage: "Offer", probability: 65, expectedClose: "Jun 30, 2024", assigned: teamUsers[1] },
  { id: "O-311", leadName: "Sophia Martinez", propertyName: "Lake Residences 2B", value: "CHF 580K", stage: "Offer", probability: 60, expectedClose: "Jun 27, 2024", assigned: teamUsers[3] },
  { id: "O-312", leadName: "William Thomas", propertyName: "Green View Apt. 1", value: "CHF 670K", stage: "Negotiation", probability: 75, expectedClose: "Jun 20, 2024", assigned: teamUsers[0] },
  { id: "O-313", leadName: "Charlotte White", propertyName: "Sunset Villas 6", value: "CHF 1.56M", stage: "Negotiation", probability: 78, expectedClose: "Jul 03, 2024", assigned: teamUsers[2] },
];

/* ---------- Activities ---------- */
export type Activity = {
  id: string;
  title: string;
  type: ActivityType;
  status: ActivityStatus;
  dueDate: string;
  related?: string;
  assigned: User;
  note?: string;
};

export const activities: Activity[] = [
  {
    id: "A-901",
    title: "Property Visit — Green View Apt. 12",
    type: "Visit",
    status: "Upcoming",
    dueDate: "May 30, 2024 — 2:00 PM",
    related: "John Smith",
    assigned: teamUsers[0],
  },
  {
    id: "A-902",
    title: "Call with Sarah Johnson",
    type: "Call",
    status: "Upcoming",
    dueDate: "May 29, 2024 — 11:00 AM",
    related: "Sarah Johnson",
    assigned: teamUsers[1],
  },
  {
    id: "A-903",
    title: "Send documents",
    type: "Task",
    status: "Pending",
    dueDate: "May 29, 2024 — 9:30 AM",
    related: "David Wilson",
    assigned: teamUsers[0],
  },
  {
    id: "A-904",
    title: "Follow up email",
    type: "Email",
    status: "Done",
    dueDate: "May 28, 2024 — 3:00 PM",
    related: "Emma Brown",
    assigned: teamUsers[1],
  },
  {
    id: "A-905",
    title: "Meeting — Project Update",
    type: "Meeting",
    status: "Upcoming",
    dueDate: "May 31, 2024 — 10:00 AM",
    related: "Internal",
    assigned: teamUsers[0],
  },
  {
    id: "A-906",
    title: "Call client about offer",
    type: "Call",
    status: "Overdue",
    dueDate: "May 24, 2024 — 4:30 PM",
    related: "Michael Lee",
    assigned: teamUsers[2],
  },
];

/* ---------- Dripping campaigns ---------- */
export type Campaign = {
  id: string;
  name: string;
  status: "Active" | "Scheduled" | "Paused" | "Draft";
  audience: string;
  steps: number;
  enrolled: number;
  lastSent?: string;
};

export const campaigns: Campaign[] = [
  { id: "C-501", name: "Investor Campaign", status: "Active", audience: "Investors", steps: 5, enrolled: 12, lastSent: "May 28, 2024" },
  { id: "C-502", name: "New Project Launch", status: "Active", audience: "Qualified leads", steps: 4, enrolled: 25, lastSent: "May 27, 2024" },
  { id: "C-503", name: "Q2 Newsletter", status: "Scheduled", audience: "All contacts", steps: 1, enrolled: 40, lastSent: "—" },
  { id: "C-504", name: "Lake Residences Drip", status: "Paused", audience: "Lake Residences leads", steps: 6, enrolled: 18, lastSent: "May 20, 2024" },
  { id: "C-505", name: "Cold lead reactivation", status: "Draft", audience: "Cold leads (60d+)", steps: 3, enrolled: 0 },
];

/* ---------- Settings sections ---------- */
export const settingsSections = [
  { key: "workspace", label: "Workspace", desc: "Name, branding, locale, currency" },
  { key: "users", label: "Users", desc: "Members, invitations, status" },
  { key: "roles", label: "Roles", desc: "Permissions and access policies" },
  { key: "dictionaries", label: "Dictionaries", desc: "Statuses, sources, activity types" },
  { key: "tags", label: "Tags", desc: "Reusable tags across leads and properties" },
  { key: "projects", label: "Projects", desc: "Lightweight property groupings" },
  { key: "billing", label: "Billing", desc: "Plan, invoices and payment method" },
];

export const settingsUsers = [
  { id: "u1", name: "John Doe", email: "john.doe@evohome.example", role: "Admin", status: "Active" },
  { id: "u2", name: "Jane Roe", email: "jane.roe@evohome.example", role: "Manager", status: "Active" },
  { id: "u3", name: "Marc Berger", email: "marc.berger@evohome.example", role: "Agent", status: "Active" },
  { id: "u4", name: "Sofia Keller", email: "sofia.keller@evohome.example", role: "Agent", status: "Invited" },
];

export const settingsRoles = [
  { id: "r1", name: "Admin", members: 1, desc: "Full access to workspace and settings" },
  { id: "r2", name: "Manager", members: 1, desc: "Pipeline, leads, properties and dripping" },
  { id: "r3", name: "Agent", members: 2, desc: "Own leads, opportunities and activities" },
];

export const settingsDictionaries = [
  { id: "d1", name: "Lead status", count: 5 },
  { id: "d2", name: "Lead source", count: 8 },
  { id: "d3", name: "Pipeline stages", count: 7 },
  { id: "d4", name: "Property status", count: 4 },
  { id: "d5", name: "Activity types", count: 6 },
];

export const settingsTags = [
  { id: "t1", name: "Investor", tone: "info" as StatusTone, used: 24 },
  { id: "t2", name: "Hot", tone: "danger" as StatusTone, used: 11 },
  { id: "t3", name: "Cold", tone: "muted" as StatusTone, used: 14 },
  { id: "t4", name: "VIP", tone: "warn" as StatusTone, used: 6 },
  { id: "t5", name: "First-time buyer", tone: "neutral" as StatusTone, used: 9 },
];

export const settingsProjects = [
  { id: "pr1", name: "Green View", properties: 12, city: "Geneva" },
  { id: "pr2", name: "Lake Residences", properties: 18, city: "Lausanne" },
  { id: "pr3", name: "Sunset Villas", properties: 7, city: "Nyon" },
];
