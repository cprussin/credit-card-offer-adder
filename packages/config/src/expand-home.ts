/**
 * Resolve a leading `~` against a home directory. The config file is written by
 * hand, and `~/.local/state/...` is what someone naturally types for a path
 * that has to survive reboots.
 */
export const expandHome = (path: string, home: string): string => {
  if (path === "~") {
    return home;
  } else if (path.startsWith("~/")) {
    return `${home}${path.slice(1)}`;
  } else {
    return path;
  }
};
