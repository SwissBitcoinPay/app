// The public values of an EAS environment that a web export needs, for a GitHub job that holds no
// token (the web app's deploy on EAS Hosting). The job that holds the Expo token runs
// `eas env:pull` and this script only, never the project's packages; it hands these values to the
// export job, which runs them (`npm ci`, `expo export`) without any token. Each value is inlined in
// the web bundle or served in the passkeys' association files: none is a secret.
//
//   node scripts/eas-public-env.js <file written by eas env:pull>
//
// Writes `NAME=value` lines to $GITHUB_OUTPUT (stdout without it). Fails when a required value is
// missing, or when a value could break out of its line. Needs Node.js only: no package.
const fs = require("node:fs");

/** What the web export reads (app.config.ts, scripts/passkey-association.js), and whether it must be set. */
const PUBLIC_EXPORT_VARIABLES = [
  { name: "EXPO_PUBLIC_BREEZ_API_KEY", required: true },
  // Without it, the Open Food Facts User-Agent names the source repository.
  { name: "EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL", required: false },
  { name: "PASSKEY_RP_ID", required: true },
  { name: "PASSKEY_APPLE_TEAM_ID", required: true },
  { name: "PASSKEY_ANDROID_CERT_SHA256", required: true }
];

/**
 * The variables of a file `eas env:pull` wrote (EAS CLI 24.8.0, commands/env/pull.js): a comment
 * line, then one `NAME=value` per variable, the value as is; a secret variable is a comment.
 */
function parseEnvFile(text) {
  const variables = new Map();
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) throw new Error("The env file has a line that is not NAME=value.");
    variables.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return variables;
}

/** The export's values among `variables`, in a stable order. Throws on a missing required one. */
function publicExportValues(variables) {
  return PUBLIC_EXPORT_VARIABLES.map(({ name, required }) => {
    const value = (variables.get(name) ?? "").trim();
    if (required && value === "") {
      throw new Error(`${name} is not set in the EAS environment.`);
    }
    // One line each in $GITHUB_OUTPUT: a value with a line break could set another output.
    if (/[\r\n]/.test(value)) throw new Error(`${name} spans several lines.`);
    return { name, value };
  });
}

if (require.main === module) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error("Usage: node scripts/eas-public-env.js <env file>");
    const values = publicExportValues(parseEnvFile(fs.readFileSync(file, "utf8")));
    const lines = values.map(({ name, value }) => `${name}=${value}\n`).join("");
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines);
    else process.stdout.write(lines);
    console.error(`Read ${values.map(({ name }) => name).join(", ")}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { PUBLIC_EXPORT_VARIABLES, parseEnvFile, publicExportValues };
