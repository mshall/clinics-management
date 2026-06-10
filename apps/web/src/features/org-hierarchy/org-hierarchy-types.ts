export type OrgHierarchyNodeType = "platform" | "organization" | "clinic" | "users_group" | "user";

export type OrgHierarchyNode = {
  id: string;
  nodeType: OrgHierarchyNodeType;
  label: string;
  subtitle?: string;
  counts?: {
    organizations?: number;
    users?: number;
    clinics?: number;
    patients?: number;
    branches?: number;
  };
  meta?: {
    role?: string;
    kind?: "parent" | "branch";
    email?: string;
    city?: string;
    currency?: string;
  };
  children: OrgHierarchyNode[];
};
