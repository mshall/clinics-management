export type GuideVisualKind =
  | "search"
  | "navigate"
  | "form"
  | "board"
  | "payment"
  | "clinical"
  | "admin"
  | "chart"
  | "reports"
  | "support"
  | "operations"
  | "dashboard";

export type GuideStep = {
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  /** Extended walkthrough copy shown in the guide wizard. */
  detailEn?: string;
  detailAr?: string;
  path?: string;
  visual?: GuideVisualKind;
};

export type GuideSection = {
  id: string;
  titleEn: string;
  titleAr: string;
  summaryEn: string;
  summaryAr: string;
  steps: GuideStep[];
  tipsEn?: string[];
  tipsAr?: string[];
  /** Feature deep-dive sections animate in the wizard carousel. */
  featured?: boolean;
};

export type RoleGuide = {
  headlineEn: string;
  headlineAr: string;
  subtitleEn: string;
  subtitleAr: string;
  sections: GuideSection[];
};