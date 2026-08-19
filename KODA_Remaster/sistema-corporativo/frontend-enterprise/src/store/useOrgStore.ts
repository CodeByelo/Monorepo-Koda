import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface OrgState {
  currentOrg: Organization | null;
  organizations: Organization[];
  setOrganizations: (orgs: Organization[]) => void;
  setCurrentOrg: (org: Organization | null) => void;
  clear: () => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set: (fn: (state: OrgState) => Partial<OrgState>) => void) => ({
      currentOrg: null,
      organizations: [],
      setOrganizations: (organizations: Organization[]) => set(() => ({ organizations })),
      setCurrentOrg: (currentOrg: Organization | null) => set(() => ({ currentOrg })),
      clear: () => set(() => ({ currentOrg: null, organizations: [] })),
    }),
    {
      name: "org-storage", // Persistencia local segura
    },
  ),
);
