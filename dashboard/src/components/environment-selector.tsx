import { useEffect } from "react";
import { useApp } from "../contexts/app-context";

// Get environment from build variable or default to staging
export const getCurrentEnvironment = (): string => {
  const buildEnv = import.meta.env.VITE_ENV;

  switch (buildEnv) {
    case "production":
      return "Production";
    case "development":
      return "Development";
    case "staging":
    default:
      return "Staging";
  }
};

export function useEnvironmentSelector() {
  const { deployments, selectedEnvironment, setSelectedEnvironment } = useApp();

  useEffect(() => {
    if (deployments.length > 0 && !selectedEnvironment) {
      setSelectedEnvironment(getCurrentEnvironment());
    }
  }, [deployments, selectedEnvironment, setSelectedEnvironment]);

  // Filter deployments to only show the current environment
  const filteredDeployments = deployments.filter(
    (env) => env.name === getCurrentEnvironment()
  );

  return {
    selectedEnvironment: getCurrentEnvironment(),
    filteredDeployments,
  };
}
