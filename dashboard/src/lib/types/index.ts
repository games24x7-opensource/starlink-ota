/**
 * Represents a CodePush package/release with its configuration and metadata
 */
export interface TPackage {
  /** Description of the release */
  description: string;
  /** Whether the release is disabled */
  isDisabled: boolean;
  /** Whether the update is mandatory for users */
  isMandatory: boolean;
  /** Percentage of users who should receive the update (0-100) */
  rollout: number;
  /** Target application version */
  appVersion: string;
  /** Unique hash of the package content */
  packageHash: string;
  /** URL where the package content can be downloaded */
  blobUrl: string;
  /** Size of the package in bytes */
  size: number;
  /** How the release was created (e.g., "Upload") */
  releaseMethod: string;
  /** Timestamp of when the release was uploaded */
  uploadTime: number;
  /** Version label of the release */
  label: string;
  /** Email of the user who created the release */
  releasedBy: string;
}

/**
 * Represents a deployment environment (e.g., Production, Staging)
 */
export interface TDeployment {
  /** Unique identifier for the deployment */
  id: string;
  /** Deployment key used for CodePush SDK configuration */
  key: string;
  /** Name of the deployment environment */
  name: string;
  /** Current package/release in this deployment, if any */
  package: TPackage | null;
}

/**
 * API response format for deployments endpoint
 */
export interface TDeploymentsResponse {
  /** List of available deployments */
  deployments: TDeployment[];
}

/**
 * Statistics about a release's adoption and performance
 */
export interface TReleaseMetric {
  /** Number of users currently running this release */
  active: number;
  /** Total number of successful installations */
  installed: number;
  /** Number of times the release was downloaded */
  downloaded: number;
  /** Number of failed installations */
  failed: number;
  /** Version label of the release */
  label: string;
}

export type TRelease = {
  label: string;
  appVersion: string;
  releasedBy: string;
  isDisabled: boolean;
};
