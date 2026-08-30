export const WORKBOOK_COMPANY_SOURCE = "workbook-derived mapping (operator-approved)";

export const BILLED_LINKED_NOTE =
  "Establishes a billed/linked company relationship. Does not claim legal ownership.";

export type WorkbookCompanyKind = "apply" | "hold" | "person_review" | "no_project";

export type WorkbookCompanyEntry = {
  key: string;
  projectName: string;
  kind: WorkbookCompanyKind;
  companyName?: string;
  candidates?: string[];
  sourceValue?: string;
  note: string;
};

export const WORKBOOK_COMPANY_MAPPING: WorkbookCompanyEntry[] = [
  {
    key: "arbora",
    projectName: "Arbora",
    kind: "apply",
    companyName: "Losinger Marazzi SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "avant-scene",
    projectName: "Avant-Scène",
    kind: "apply",
    companyName: "Cardis- Sotheby's International Realty",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "campanules",
    projectName: "Campanules",
    kind: "apply",
    companyName: "Fondation des Logements pour Personnes Âgées ou Isolées",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "carawina",
    projectName: "Carawina",
    kind: "apply",
    companyName: "LEAD",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "cardinal",
    projectName: "Cardinal",
    kind: "apply",
    companyName: "Johnston Development Group",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "corsier-sur-vevey",
    projectName: "Corsier-sur-Vevey",
    kind: "apply",
    companyName: "Swissroc Investment SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "eleven-41",
    projectName: "Eleven 41",
    kind: "apply",
    companyName: "Tailwind Corporation (Jamaica) Limited",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "floreal",
    projectName: "Floréal",
    kind: "apply",
    companyName: "ROC INVEST VD 1 SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "jardin-des-nations",
    projectName: "Jardin des Nations",
    kind: "apply",
    companyName: "Steiner AG",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "le-parc-des-crets",
    projectName: "Le Parc des Crêts",
    kind: "apply",
    companyName: "Naef Immobilier Genève Arcade de vente",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "mathod",
    projectName: "Mathod",
    kind: "apply",
    companyName: "NewHome Services SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "namaya",
    projectName: "Namaya",
    kind: "apply",
    companyName: "Voisirel Immo SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "ormet",
    projectName: "Ormet",
    kind: "apply",
    companyName: "Swissroc Properties SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "osmose",
    projectName: "Osmose",
    kind: "apply",
    companyName: "Halter AG",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "portes-du-lac",
    projectName: "Portes du Lac",
    kind: "apply",
    companyName: "GEFISWISS SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "residence-symbiose",
    projectName: "Résidence Symbiose",
    kind: "apply",
    companyName: "NewHome Services SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "seymaz-44",
    projectName: "Seymaz 44",
    kind: "apply",
    companyName: "Swissroc Construction SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "smarthill",
    projectName: "Smarthill",
    kind: "apply",
    companyName: "Realitim II SCPC",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "tannay-horizon",
    projectName: "Tannay Horizon",
    kind: "apply",
    companyName: "Projectim SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "v77",
    projectName: "V77",
    kind: "apply",
    companyName: "Swissroc Construction SA",
    note: BILLED_LINKED_NOTE,
  },
  {
    key: "grosvenor-vistas",
    projectName: "Grosvenor Vistas",
    kind: "person_review",
    sourceValue: "Nigel Benjamin",
    note: "Source value is an individual, not a company. Held for correct person/company review. Do not create a Company.",
  },
  {
    key: "collex-bossy",
    projectName: "Collex-Bossy",
    kind: "hold",
    candidates: ["Swissroc Properties SA", "M3 Real Estate"],
    note: "Multiple billed/linked candidates. Do not assign a primary company.",
  },
  {
    key: "defne",
    projectName: "Defne",
    kind: "hold",
    candidates: ["Courvoisier SA", "Nestima SA"],
    note: "Multiple billed/linked candidates. Do not assign a primary company.",
  },
  {
    key: "jardins-pala",
    projectName: "Jardins Pala",
    kind: "hold",
    candidates: ["GEROFINANCE-DUNAND COURTAGE SA", "City West SA", "BARNES Suisse SA"],
    note: "Multiple billed/linked candidates. Do not assign a primary company.",
  },
  {
    key: "rubix",
    projectName: "Rubix",
    kind: "hold",
    candidates: ["Halter AG", "HIG Asset Management AG"],
    note: "Multiple billed/linked candidates. Do not assign a primary company.",
  },
  {
    key: "versoix",
    projectName: "Versoix",
    kind: "hold",
    candidates: ["Swissroc Properties SA", "Pilet Renaud", "Pilet Renaud Transactions SA"],
    note: "Multiple billed/linked candidates. Do not assign a primary company.",
  },
  {
    key: "payerne-envergure",
    projectName: "Payerne-Envergure",
    kind: "no_project",
    note: "No exact CRM project match. Do not create a project.",
  },
];

export function workbookCompanyApplyEntries(): WorkbookCompanyEntry[] {
  return WORKBOOK_COMPANY_MAPPING.filter((entry) => entry.kind === "apply");
}

export function workbookCompanyCatalogSummary() {
  return {
    total: WORKBOOK_COMPANY_MAPPING.length,
    apply: workbookCompanyApplyEntries().length,
    hold: WORKBOOK_COMPANY_MAPPING.filter((entry) => entry.kind === "hold").length,
    personReview: WORKBOOK_COMPANY_MAPPING.filter((entry) => entry.kind === "person_review")
      .length,
    noProject: WORKBOOK_COMPANY_MAPPING.filter((entry) => entry.kind === "no_project").length,
    keys: WORKBOOK_COMPANY_MAPPING.map((entry) => entry.key),
  };
}
