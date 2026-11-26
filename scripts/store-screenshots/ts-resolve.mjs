// A module resolution hook for capture.mjs (registered with node:module's `register`), which reads
// the app's translations from their TypeScript sources: those import each other without an
// extension ("../swiss-spelling"), as Metro and Jest resolve them; Node does not. A relative
// specifier that Node cannot find is tried again with ".ts". Nothing else changes.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    if (!relative || error?.code !== "ERR_MODULE_NOT_FOUND" || specifier.endsWith(".ts"))
      throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
}
