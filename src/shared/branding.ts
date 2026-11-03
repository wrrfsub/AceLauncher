/**
 * Everything brand-specific lives here so a fork can rebrand in one place.
 * Distribution identifiers (appId, publisher, update feed) live in electron-builder.yml.
 */
export const BRANDING = {
  name: 'Ace Launcher',
  /** Sent as the User-Agent to Modrinth/CurseForge/Mojang; Modrinth asks for a way to contact you. */
  userAgentProduct: 'AceLauncher',
  contact: 'https://github.com/wrrfsub/AceLauncher',
  /** Optional JSON feed of launcher announcements: [{ id, title, summary, url?, imageUrl?, date }] */
  announcementsUrl: '',
} as const
