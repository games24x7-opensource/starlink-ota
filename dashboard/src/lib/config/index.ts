/**
 * Environment variables configuration
 */
const config = {
  /** Base URL for the API */
  apiUrl: import.meta.env.VITE_OTA_SERVER_URL,
} as const;

/**
 * Validate required environment variables
 */
const validateConfig = () => {
  if (!config.apiUrl) {
    throw new Error("VITE_OTA_SERVER_URL environment variable is required");
  }
};

// Validate config in non-production environments
if (import.meta.env.MODE !== "production") {
  validateConfig();
}

export default config;
