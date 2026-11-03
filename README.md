# Ace Launcher

A modern, open-source Minecraft: Java Edition launcher built with Electron, React and TypeScript.

Real installs, real Microsoft sign-in, isolated instances, and Modrinth/CurseForge content: no offline mode, no ownership bypass.

> **Status: early development.** The core (installing, launching, auth, instances, mods, IPC) and the UI base (Home, Instances, Discover, Console, Settings) are in place. Installs have been run against the live Mojang and loader servers for vanilla, Fabric, Quilt and NeoForge on 1.21.1 and Forge on 1.20.1. Signing in and launching need your own approved Azure client ID (see below) and haven't been tested end to end yet. See the [TODO](#todo) and [Roadmap](#roadmap).

## Features

| Area | What works today |
| --- | --- |
| **Versions** | Vanilla (releases, snapshots, old alpha/beta), Fabric, Quilt, Forge, NeoForge |
| **Interface** | Dark/light/system themes, five accent colours, reduced motion, live task progress with cancel |
| **Install & repair** | Version JSON, client jar, libraries, assets, loader installers. Every file is checksummed, so running an install again resumes it or repairs it |
| **Java** | Detects system installs and downloads Mojang's official runtime matching each version's required major version |
| **Instances** | Each instance has its own game folder (saves, mods, configs), memory, Java and launch args. Versions/libraries/assets are shared, so nothing downloads twice |
| **Accounts** | Microsoft → Xbox Live → XSTS → Minecraft Services sign-in, ownership and profile checks, token refresh, multiple accounts |
| **Mods** | Modrinth search/install with required-dependency resolution and incompatibility checks; CurseForge with an API key; enable/disable/remove; resource packs and shaders |
| **Modpacks** | Modrinth `.mrpack` → a new instance with the right loader, files and overrides |
| **Console** | Live game output (Minecraft's log4j XML parsed into readable lines), crash detection, process status |
| **News** | Minecraft Java patch notes from Mojang's launcher feed, plus an optional announcements feed |
| **Updates** | electron-updater wiring; reports "unconfigured" when no update feed is set instead of pretending to check |

## Tech stack

Electron 45 · React 19 · TypeScript (strict) · Vite via electron-vite · Tailwind CSS 4 · Motion · SQLite through Node's built-in `node:sqlite` (no native module to rebuild) · zod for IPC validation · [`@xmcl/core` / `@xmcl/installer`](https://github.com/Voxelum/x-minecraft-launcher) for Minecraft installation and launching.

## Getting started

Requirements: Node.js 24+ and npm.

```bash
npm install
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run dev
```

## Configuration

Copy `.env.example` to `.env`. Both keys can also be set at runtime in **Settings → Advanced**.

### Microsoft sign-in (required to play)

Minecraft only accepts tokens from Azure apps that Mojang has approved, so you need your own:

1. In the [Azure portal](https://portal.azure.com) → **App registrations** → **New registration**.
2. Supported account types: **Personal Microsoft accounts only**.
3. Under **Authentication**, add the **Mobile and desktop applications** platform with the redirect URI
   `https://login.microsoftonline.com/common/oauth2/nativeclient`, and turn on **Allow public client flows**.
4. Copy the **Application (client) ID** into `MAIN_VITE_MS_CLIENT_ID`.
5. Request Minecraft API access for that client ID at <https://aka.ms/mce-reviewappid>. Until Mojang approves it, sign-in fails at the Minecraft step with a message that says so.

Tokens are encrypted with Electron `safeStorage` (Keychain, DPAPI, or libsecret/kwallet) and never reach the renderer. On Linux without a keyring, Electron falls back to a weak built-in key, and the app reports this.

### CurseForge (optional)

Get a key at <https://console.curseforge.com> and put it in `MAIN_VITE_CURSEFORGE_API_KEY`. Some authors block third-party downloads; those files show a clear error with a link instead.

### Auto-updates (optional)

Set `ACE_UPDATE_URL` to a static host for the electron-builder `generic` provider when packaging. Without it the updater stays off. Branding (name, User-Agent contact, announcements feed) lives in `src/shared/branding.ts`.

## Project layout

```
src/
  main/       Electron entry, window, IPC handlers (zod-validated), updater
  preload/    contextBridge: allowlisted invoke + event subscription only
  renderer/   React UI (in progress)
  shared/     Types, IPC contract, branding: used by both sides
  services/   App services: accounts, instances, game/launch, content, tasks, settings, news
  database/   node:sqlite connection + versioned migrations
  minecraft/  Version lists, install pipeline, Java, log parsing (pure, testable)
  auth/       Microsoft/Xbox/Minecraft token chain (pure, testable)
  mods/       Modrinth, CurseForge, .mrpack handling (pure, testable)
  utils/      HTTP and argument helpers
vendor/
  xmcl-unzip/ @xmcl/unzip 2.2.0 with a fixed package.json (see below)
```

### Security model

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The preload exposes only `invoke` and `on`, both checked against channel allowlists.
- Every IPC payload is validated with zod in the main process, and calls from frames other than the app's own renderer are rejected.
- The renderer never sees tokens. Sign-in runs in a separate window with a throwaway session, PKCE, and a state check.
- Modpack and content file paths are resolved with a traversal guard. Only `https://` links open externally.

## Development notes

- **Node 26 zip bug.** On Node 26, inflating large zip entries through `yauzl` stalls just before the end, which hangs the Forge/NeoForge installer step. Electron's bundled Node 24 isn't affected, so the app is fine. Run install integration scripts under Electron's Node:
  ```bash
  ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --experimental-strip-types path/to/script.ts
  ```
- **Vendored `@xmcl/unzip`.** The npm release of 2.2.0 points `main` at `./index.ts` and depends on `workspace:^*`, so it can't be installed. `vendor/xmcl-unzip` is the same build with a corrected `package.json`. Remove it once upstream publishes a fixed release.
- Main-process code uses relative `.ts` imports, so the pure modules run directly under `node --test`.

## TODO

### Now
- [x] Renderer: app shell (sidebar, title bar, theme tokens, accent colours, light/dark)
- [x] Dashboard: featured instance, Play button, install status/progress, account, recent activity, news
- [x] Instances: grid, create dialog (version + loader picker), detail view with settings
- [x] Installed content view: mods / resource packs / shaders with toggle and remove
- [x] Discover: Modrinth/CurseForge search, filters, install into an instance, modpacks
- [x] Console: live log with level filter, copy, open folder, kill
- [x] Settings: Java list/picker, memory, downloads, game directory, appearance, updates, advanced
- [x] Account switcher with skin heads rendered from the profile skin
- [x] Task/progress tray with cancel
- [ ] Forge 52.1.21 for 1.21.1 fails post-processing. Forge's own installer fails the same way (an upstream bug); older 1.21.1 builds need testing, and the UI could steer away from known-bad builds
- [ ] Drag-and-drop mods/packs into an instance
- [ ] Keyboard shortcuts and a command palette

### Next
- [ ] `electron-builder.yml`: Windows (NSIS), macOS (dmg, notarisation hooks), Linux (AppImage, deb)
- [ ] App icons for all platforms
- [ ] End-to-end launch test with a real account
- [ ] Integration test script for all loaders, run under Electron's Node
- [ ] Better errors when Mojang/loader servers are down (offline cache of version lists)

## Roadmap

**v0.1: Playable** · UI shell, instances, install, sign in, launch, console. *(UI base done; end-to-end sign-in and launch next.)*

**v0.2: Content** · Discover page, mod management, Modrinth modpacks, CurseForge with API key.

**v0.3: Distribution** · Installers for Windows/macOS/Linux, signed builds, auto-update feed.

**v0.4: Quality of life**
- Content update checks ("2 mods have updates")
- Instance import/export (`.mrpack` export, Prism/MultiMC import)
- CurseForge modpacks
- Per-instance screenshots and worlds browser
- Download mirrors / proxy settings
- Translations (i18n infrastructure plus first languages)

**Later**
- Skin viewer and changer through the Minecraft Services API
- Quick Play into servers and worlds
- Server instances
- Crash-report analysis with suggested fixes (known mod conflicts, wrong Java)

## License

MIT. See [LICENSE](LICENSE).
