/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OTA_SERVER_URL: string;
  readonly VITE_ENV: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
