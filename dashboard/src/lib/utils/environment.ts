export const getEnvironmentColor = (envName: string) => {
  switch (envName.toLowerCase()) {
    case "production":
      return "bg-red-500";
    case "staging":
      return "bg-green-500";
    case "development":
      return "bg-yellow-500";
    default:
      return "bg-gray-500";
  }
};

export const getDefaultEnvironment = (environments: { name: string }[]) => {
  return environments.find((env) => env.name === "Staging") || environments[0];
};
