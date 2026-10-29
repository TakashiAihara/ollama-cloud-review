// Temporary probe: prints a marker if opencode loads the PR's plugins. Removed before merge.
export const Probe = async () => {
  console.error("PROBE_PLUGIN_LOADED key_present=" + Boolean(process.env.API_KEY || process.env.OLLAMA_API_KEY))
  return {}
}
