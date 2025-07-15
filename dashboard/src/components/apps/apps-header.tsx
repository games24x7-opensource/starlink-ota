import { Button } from "../ui/button";
import { Search, X } from "lucide-react";
import { Input } from "../ui/input";

interface AppsHeaderProps {
  searchQuery: string;
  roleFilter: string;
  onSearchChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
}

export function AppsHeader({ searchQuery, onSearchChange }: AppsHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Apps</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search apps..."
              className="w-64 pl-8 pr-8"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => onSearchChange("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {/* 
          TODO: Add role filter back in
           */}
          {/* <Select value={roleFilter} onValueChange={onRoleFilterChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="Owner">Owner</SelectItem>
              <SelectItem value="Collaborator">Collaborator</SelectItem>
            </SelectContent>
          </Select> */}
        </div>
      </div>
    </div>
  );
}
