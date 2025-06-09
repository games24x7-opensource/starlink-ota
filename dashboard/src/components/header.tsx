import { Button } from "components/ui/button";
import { Settings, ChevronLeft } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { useLocation, useNavigate } from "react-router-dom";
import { EnvironmentBadge } from "./common/environment-badge";
import { useAppName } from "../contexts/AppNameContext";

export function Header() {
  const location = useLocation();
  const { appName } = useAppName();
  const isReleasesRoute = location.pathname.includes("/deployments");
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container px-2 sm:px-4">
        {/* Mobile Header */}
        <div className="md:hidden flex flex-col">
          {/* Top Bar */}
          <div className="flex items-center justify-between h-12 -mx-2">
            <div className="flex items-center">
              {isReleasesRoute && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => navigate("/")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <span className="font-bold text-base">
                {isReleasesRoute ? appName : "CodePush"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <EnvironmentBadge variant="compact" />
              <ThemeToggle />
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex h-14 items-center justify-between">
          <div className="mr-4 flex items-center">
            {isReleasesRoute && (
              <Button
                variant="ghost"
                size="icon"
                className="mr-2 text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/")}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            )}
            <Button
              variant="link"
              className="mr-6 flex items-center space-x-2"
              onClick={() => navigate("/")}
            >
              <span className="font-bold text-xl">CodePush</span>
            </Button>
            {isReleasesRoute && appName && (
              <div className="flex items-center">
                <div className="h-4 w-[1px] bg-border mx-4" />
                <span className="font-semibold text-lg text-foreground">
                  {appName}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <EnvironmentBadge showLabel={true} />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
                <span className="sr-only">Settings</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
