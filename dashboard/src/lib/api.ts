import { TDeployment, TMetricsResponse, TRelease } from "./types";
import config from "./config/index";
import type {
  UpdateReleaseRequest,
  UpdateReleaseResponse,
  DeploymentKeyResponse,
} from "./types";

const API_URL = config.apiUrl;

// Update the fetchReleases function to return the new Release type
export async function fetchReleases({
  appName,
  environment = "Staging",
}: {
  appName: string;
  environment?: string;
}): Promise<TRelease[]> {
  try {
    const response = await fetch(
      `${API_URL}/apps/${appName}/deployments/${environment}/history`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch releases");
    }

    const data = await response.json();
    return data.history || [];
  } catch (error) {
    console.error("Error fetching releases:", error);
    return [];
  }
}

export async function updateRelease(release: TRelease): Promise<TRelease> {
  // For now, we'll just return the updated release
  return new Promise((resolve) => {
    setTimeout(() => resolve(release), 500);
  });
}

// Define the Collaborator type
interface Collaborator {
  isCurrentAccount: boolean;
  permission: string;
}

// Define the App type
interface App {
  name: string;
  collaborators: {
    [email: string]: Collaborator;
  };
  deployments: string[];
}

// Update the API response type
interface AppResponse {
  apps: App[];
}

export async function getApps(): Promise<App[]> {
  try {
    const response = await fetch(`${API_URL}/apps`, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch apps");
    }

    const data: AppResponse = await response.json();
    return data.apps || [];
  } catch (error) {
    console.error("Error fetching apps:", error);
    return []; // Return empty array instead of throwing
  }
}

export async function getApp(appName: string) {
  try {
    const response = await fetch(`${API_URL}/apps/${appName}`, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch app details");
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching app details:", error);
    throw error;
  }
}

export async function fetchReleaseMetrics(
  appName?: string,
  deploymentName?: string
): Promise<TMetricsResponse> {
  try {
    const response = await fetch(
      `${API_URL}/apps/${appName}/deployments/${deploymentName}/metrics`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch release metrics");
    }

    const data: TMetricsResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching release metrics:", error);
    return { metrics: {} };
  }
}

// Helper function to calculate total active devices
export function calculateTotalActiveDevices(metrics: TMetricsResponse): number {
  const allMetrics = metrics.metrics || {};
  return Object.values(allMetrics).reduce((sum, versionMetrics) => {
    const activeCount = versionMetrics?.active || 0;
    return sum + (activeCount > 0 ? activeCount : 0);
  }, 0);
}

// Add this function
export async function fetchDeployments(
  appName: string
): Promise<TDeployment[]> {
  try {
    const response = await fetch(`${API_URL}/apps/${appName}/deployments`, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch deployments");
    }

    const data = await response.json();
    return data.deployments || [];
  } catch (error) {
    console.error("Error fetching deployments:", error);
    return [];
  }
}

export async function fetchDeploymentKey(
  appName: string,
  environment: string
): Promise<DeploymentKeyResponse> {
  try {
    const response = await fetch(
      `${API_URL}/apps/${appName}/deployments/${environment}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch deployment key for ${environment}`);
    }

    const data: DeploymentKeyResponse = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching deployment key for ${environment}:`, error);
    throw error;
  }
}

export async function updateSpecificReleaseDetails(
  appName: string,
  environment: string,
  updateData: UpdateReleaseRequest
): Promise<UpdateReleaseResponse | null> {
  try {
    const response = await fetch(
      `${API_URL}/apps/${appName}/deployments/${environment}/release`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update release: ${response.statusText}`);
    }

    // Return null for 204 responses (no content)
    if (response.status === 204) {
      return null;
    }

    const data: UpdateReleaseResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error updating release details:", error);
    throw error;
  }
}
