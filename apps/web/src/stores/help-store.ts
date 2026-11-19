import { create } from "zustand";

type HelpState = {
  drawerOpen: boolean;
  tourOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  setTourOpen: (open: boolean) => void;
};

export const useHelpStore = create<HelpState>()((set) => ({
  drawerOpen: false,
  tourOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setTourOpen: (tourOpen) => set({ tourOpen }),
}));
