import { getConfig } from "../config/loader";

export async function listProjects() {
  const cfg = getConfig();
  return { projects: cfg.projects, total: cfg.projects.length, config_version: cfg.version };
}
