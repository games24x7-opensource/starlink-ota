import { getCurrentEnvironment } from "components/environment-selector";

interface DeploymentsListProps {
  deployments: string[];
}

export function DeploymentsList({
  deployments: _deployments,
}: DeploymentsListProps) {
  return (
    <div className="flex items-center gap-2">
      {getCurrentEnvironment().toLocaleLowerCase() === "production"
        ? "Production"
        : "Staging"}
    </div>
  );
}
