export interface Collaborator {
  isCurrentAccount: boolean;
  permission: string;
}

export interface App {
  name: string;
  collaborators: {
    [email: string]: Collaborator;
  };
  deployments: string[];
}

export type Role = "Owner" | "Collaborator" | "Unknown"; 