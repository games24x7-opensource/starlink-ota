import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Header } from "./components/header";
import { Releases } from "./components/releases";
import { Apps } from "components/apps/apps";
import { AppNameProvider } from "./contexts/AppNameContext";
import { Toaster } from "components/ui/toaster";
import { ThemeProvider } from "./components/theme-provider";
import { AppProvider } from "./contexts/app-context";

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="ui-theme">
      <Router>
        <AppProvider>
          <AppNameProvider>
            <div className="min-h-screen flex flex-col">
              <Header />
              <main className="flex-grow container mx-auto px-4 py-8">
                <Routes>
                  <Route path="/" element={<Apps />} />
                  <Route
                    path="apps/:appName/deployments"
                    element={<Releases />}
                  />
                </Routes>
              </main>
            </div>
          </AppNameProvider>
        </AppProvider>
        <Toaster />
      </Router>
    </ThemeProvider>
  );
}

export default App;
