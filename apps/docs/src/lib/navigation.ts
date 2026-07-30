export type DocLink = {
  id: string;
  label: string;
  path: string;
  group: "kiorly" | "reference";
};

export const DOC_LINKS: DocLink[] = [
  { id: "readme", label: "Documentation index", path: "/kiorly/readme", group: "kiorly" },
  { id: "prd", label: "Product requirements (PRD)", path: "/kiorly/prd", group: "kiorly" },
  { id: "rfc", label: "Technical RFC", path: "/kiorly/rfc", group: "kiorly" },
  { id: "test-users", label: "Test data & QA users", path: "/kiorly/test-users", group: "kiorly" },
  { id: "aws", label: "AWS deployment guide", path: "/kiorly/aws", group: "kiorly" },
  { id: "portal", label: "Documentation portal", path: "/kiorly/portal", group: "kiorly" },
  { id: "compare", label: "Architecture comparison", path: "/reference/architecture", group: "reference" },
  { id: "piggymetrics", label: "PiggyMetrics (synced)", path: "/reference/piggymetrics", group: "reference" },
];

export const KIORLY_DOC_FILES: Record<string, string> = {
  readme: "../../../Docs/README.md",
  prd: "../../../Docs/Clinic_Management_System_PRD.md",
  rfc: "../../../Docs/Clinic_Management_System_RFC.md",
  "test-users": "../../../Docs/Test_Data_Users.md",
  aws: "../../../Docs/AWS_Cloud_Deployment_Guide.md",
  portal: "../../../Docs/Documentation_Portal.md",
};

export const REFERENCE_DOC_FILES: Record<string, string> = {
  architecture: "../content/architecture-comparison.md",
  piggymetrics: "../content/piggymetrics/README.md",
};
