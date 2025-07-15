import { createContext, useContext, useState, ReactNode } from "react";
import type { TDeployment } from "lib/types";

interface AppContextType {
  // Environment related
  selectedEnvironment: string | undefined;
  setSelectedEnvironment: (environment: string) => void;
  environments: string[];

  // Deployments related
  deployments: TDeployment[];
  setDeployments: (deployments: TDeployment[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  // Environment state
  const [selectedEnvironment, setSelectedEnvironment] = useState<
    string | undefined
  >(undefined);
  const [environments] = useState<string[]>([]);

  // Deployments state
  const [deployments, setDeployments] = useState<TDeployment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <AppContext.Provider
      value={{
        selectedEnvironment,
        setSelectedEnvironment,
        environments,
        deployments,
        setDeployments,
        isLoading,
        setIsLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
