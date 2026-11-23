/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BUILD_ID?: string;
  /** DEV ONLY: set to "false" to hide the Test users quick-pick panel in `vite dev` (it is never in production builds). */
  readonly VITE_DEV_TEST_USERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
