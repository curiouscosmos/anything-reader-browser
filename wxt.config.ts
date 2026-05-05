import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['activeTab', 'tabs', 'nativeMessaging'],
    // Fixed Chrome manifest key so the extension ID stays stable across reloads/installations.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtEuVjn5roFsujzFfifQV0WLdvrDc5AVWHZlKwRHaZuj0yk61ZVY5aOjT0qo+BzpBiWvhHGpa1qshsq6G5plt3vjbBfajcDSxIhlFTwyJcleq1BDHWW24nAb7HOnUFicXuhfx9KaoXnN7o36dM16bpv1PUO3hsM2rCsWJKsbgpBIg1nWUtHBkdLGOWcWudmBu7O7VSY3ADS2QQaXM2p0MM0q+ggxan5zvZ8r3kHmDzhGMwGdRoMFlVBazKMv6kyCN0GQg0TPG8X1Nx8lcFTWvnvoVcMRKoRJUamiK7/RBglxw1qjsBZbzmH+ZYEdUwGDfAda1pyO647gu9Gz6M/gCzwIDAQAB',
    browser_specific_settings: {
      gecko: {
        // This ID must match the native host manifest's allowed_extensions entry.
        id: 'anything-reader@local',
      },
    },
  },
});
