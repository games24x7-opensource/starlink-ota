export type TRelease = {
  label: string;
  appVersion: string;
  releasedBy: string;
  isDisabled: boolean;
  description?: string;
  isMandatory?: boolean;
  size?: number;
  uploadTime?: string;
  rolloutPercentage?: number;
};

export type TDeployment = {
  name: string;
  key: string;
};

export type TDeploymentsResponse = {
  deployments: TDeployment[];
};

export type TPackage = {
  // Add fields based on your API response
};

// Update the response type to match exact API format

export type TReleaseMetric = {
  active: number;
  installed: number;
  downloaded: number;
  failed: number;
  label: string;
};
export interface TMetricsResponse {
  metrics: {
    [label: string]: TReleaseMetric;
  };
}

export interface UpdateReleaseRequest {
  packageInfo: {
    description?: string;
    isDisabled: boolean;
    isMandatory?: boolean;
    appVersion: string;
    label: string;
    rollout?: number;
  };
}

export interface UpdateReleaseResponse {
  package: {
    description: string;
    isDisabled: boolean;
    isMandatory: boolean;
    rollout: number;
    appVersion: string;
    packageHash: string;
    blobUrl: string;
    size: number;
    releaseMethod: string;
    uploadTime: number;
    label: string;
    releasedBy: string;
  };
}

export interface DeploymentKeyResponse {
  deployment: {
    name: string;
    key: string;
    package: null | TPackage; // Use TPackage type instead of any
  };
}
