// Packaging config. Distribution identity lives here; in-app branding lives in src/shared/branding.ts.
// The auto-update feed is opt-in: set ACE_UPDATE_URL when packaging to embed it.
const updateUrl = process.env.ACE_UPDATE_URL

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'io.github.wrrfsub.acelauncher',
  productName: 'Ace Launcher',
  copyright: 'Copyright © 2026 subway',
  directories: { buildResources: 'build', output: 'dist' },
  files: ['out/**', 'package.json', '!**/*.map'],
  extraResources: [{ from: 'build/icon.png', to: 'icon.png' }],
  publish: updateUrl ? [{ provider: 'generic', url: updateUrl }] : null,
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',

  win: { target: [{ target: 'nsis', arch: ['x64', 'arm64'] }] },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },

  mac: {
    // zip is required for auto-updates on macOS; dmg is for first installs.
    target: [{ target: 'dmg', arch: ['universal'] }, { target: 'zip', arch: ['universal'] }],
    category: 'public.app-category.games',
    hardenedRuntime: true,
  },

  linux: {
    target: ['AppImage', 'deb'],
    category: 'Game',
    maintainer: 'subway <sysnyxx7@gmail.com>',
    synopsis: 'A modern Minecraft: Java Edition launcher',
  },
}
