import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  publicDir: 'assets-built',
  manifest: ({ browser }) => ({
    permissions:
      browser === 'firefox'
        ? ['activeTab', 'contextMenus', 'nativeMessaging', 'storage', 'tabs']
        : ['activeTab', 'contextMenus', 'nativeMessaging', 'offscreen', 'storage', 'tabs'],
    icons: {
      16: 'icon16_on.png',
      32: 'icon32_on.png',
      48: 'icon48_on.png',
      128: 'icon128_on.png',
    },
    action: {
      default_icon: {
        16: 'icon16_on.png',
        32: 'icon32_on.png',
        48: 'icon48_on.png',
        128: 'icon128_on.png',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        css: ['content.css'],
        js: ['html-analyzer-common.js', 'text-preprocessor.js', 'ttsManager.js'],
      },
    ],
    web_accessible_resources: [
      {
        resources: ['icon*.png', 'speaker.svg', 'kittenTTS/*', 'supertonic/onnx/*', 'supertonic/ort/*', 'reader.html', 'reader.js', 'reader-init.js', 'supertonic/voice_styles/*'],
        matches: ['<all_urls>'],
      },
    ],
    ...(process.env.CHROME_WEBSTORE === 'true'
      ? {}
      : {
          // Fixed Chrome manifest key so the extension ID stays stable across reloads/installations.
          key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtEuVjn5roFsujzFfifQV0WLdvrDc5AVWHZlKwRHaZuj0yk61ZVY5aOjT0qo+BzpBiWvhHGpa1qshsq6G5plt3vjbBfajcDSxIhlFTwyJcleq1BDHWW24nAb7HOnUFicXuhfx9KaoXnN7o36dM16bpv1PUO3hsM2rCsWJKsbgpBIg1nWUtHBkdLGOWcWudmBu7O7VSY3ADS2QQaXM2p0MM0q+ggxan5zvZ8r3kHmDzhGMwGdRoMFlVBazKMv6kyCN0GQg0TPG8X1Nx8lcFTWvnvoVcMRKoRJUamiK7/RBglxw1qjsBZbzmH+ZYEdUwGDfAda1pyO647gu9Gz6M/gCzwIDAQAB',
        }),
    browser_specific_settings: {
      gecko: {
        // This ID must match the native host manifest's allowed_extensions entry.
        id: 'anything-reader@local',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  }),
});
