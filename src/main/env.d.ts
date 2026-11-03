/// <reference types="electron-vite/node" />

// Build-time configuration, read from .env / the environment by electron-vite (see .env.example).
interface ImportMetaEnv {
  readonly MAIN_VITE_MS_CLIENT_ID?: string
  readonly MAIN_VITE_CURSEFORGE_API_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
