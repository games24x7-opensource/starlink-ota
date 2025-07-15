import React, { createContext, useContext, useState, ReactNode } from "react";

interface AppNameContextType {
  appName?: string;
  setAppName: (name: string) => void;
}

const AppNameContext = createContext<AppNameContextType | undefined>(undefined);

export function AppNameProvider({ children }: { children: ReactNode }) {
  const [appName, setAppName] = useState<string>();

  return (
    <AppNameContext.Provider value={{ appName, setAppName }}>
      {children}
    </AppNameContext.Provider>
  );
}

export function useAppName() {
  const context = useContext(AppNameContext);
  if (context === undefined) {
    throw new Error("useAppName must be used within an AppNameProvider");
  }
  return context;
}
