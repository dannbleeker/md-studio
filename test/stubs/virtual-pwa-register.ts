// Vitest stand-in for the `virtual:pwa-register` module vite-plugin-pwa
// generates at build time. The vitest alias in vite.config.ts routes the
// import here only when VITEST is set.
type RegisterSWOptions = {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
};

export const registerSW = (_options: RegisterSWOptions = {}) => {
  return async (_reloadPage?: boolean) => {};
};
