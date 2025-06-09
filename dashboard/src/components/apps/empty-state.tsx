import { Button } from "../ui/button";
import { Link } from "react-router-dom";

export function EmptyState() {
  return (
    <div className="text-center py-12">
      <h3 className="text-lg font-semibold mb-2">No apps found</h3>
      <p className="text-muted-foreground mb-4">
        Get started by creating your first app
      </p>
      <Button asChild>
        <Link to="/new">Create App</Link>
      </Button>
    </div>
  );
} 