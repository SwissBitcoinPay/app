/**
 * Test helper: runs `run` with these environment variables set (undefined: unset), then restores
 * their previous values, even when it throws. Returns what `run` returns.
 */
export function withEnv<T>(variables: Record<string, string | undefined>, run: () => T): T {
  const previous = Object.fromEntries(
    Object.keys(variables).map((name) => [name, process.env[name]])
  );
  const assign = (values: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(values)) {
      // Assigning undefined would store the string "undefined": delete instead.
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  assign(variables);
  try {
    return run();
  } finally {
    assign(previous);
  }
}
