// scripts/eas-public-env.js: the public values an EAS environment hands the web export, read from
// the file `eas env:pull` writes (EAS CLI 24.8.0, commands/env/pull.js), for a job that holds no
// token.

const { PUBLIC_EXPORT_VARIABLES, parseEnvFile, publicExportValues } = jest.requireActual<{
  PUBLIC_EXPORT_VARIABLES: { name: string; required: boolean }[];
  parseEnvFile(text: string): Map<string, string>;
  publicExportValues(variables: Map<string, string>): { name: string; value: string }[];
}>("../../scripts/eas-public-env.js");

/** A file as `eas env:pull` writes it: its comment, a blank line, one line per variable. */
const pulled = (lines: string[]) => `# Environment: preview\n\n${lines.join("\n")}`;

const COMPLETE = [
  "EXPO_PUBLIC_BREEZ_API_KEY=breez-key",
  "EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL=contact@example.test",
  "PASSKEY_RP_ID=example.test",
  "PASSKEY_APPLE_TEAM_ID=ABCDE12345",
  "PASSKEY_ANDROID_CERT_SHA256=AA:BB",
  // Not the export's: never handed on.
  "OTHER_VALUE=not-for-the-export",
  "# SOME_SECRET=***** (secret)"
];

describe("the EAS environment's values for the web export", () => {
  it("are the values the export reads, in a stable order", () => {
    expect(publicExportValues(parseEnvFile(pulled(COMPLETE)))).toEqual([
      { name: "EXPO_PUBLIC_BREEZ_API_KEY", value: "breez-key" },
      { name: "EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL", value: "contact@example.test" },
      { name: "PASSKEY_RP_ID", value: "example.test" },
      { name: "PASSKEY_APPLE_TEAM_ID", value: "ABCDE12345" },
      { name: "PASSKEY_ANDROID_CERT_SHA256", value: "AA:BB" }
    ]);
  });

  it("hand on nothing but those values", () => {
    const names = publicExportValues(parseEnvFile(pulled(COMPLETE))).map(({ name }) => name);
    expect(names).toEqual(PUBLIC_EXPORT_VARIABLES.map(({ name }) => name));
    expect(names).not.toContain("OTHER_VALUE");
  });

  it("keep a value as written, an equal sign included", () => {
    const variables = parseEnvFile(pulled(["PASSKEY_ANDROID_CERT_SHA256=AA:BB,CC=DD"]));
    expect(variables.get("PASSKEY_ANDROID_CERT_SHA256")).toBe("AA:BB,CC=DD");
  });

  it("refuse an environment without a required value", () => {
    for (const { name } of PUBLIC_EXPORT_VARIABLES.filter(({ required }) => required)) {
      const without = COMPLETE.filter((line) => !line.startsWith(`${name}=`));
      expect(() => publicExportValues(parseEnvFile(pulled(without)))).toThrow(name);
      const empty = [...without, `${name}=  `];
      expect(() => publicExportValues(parseEnvFile(pulled(empty)))).toThrow(name);
    }
  });

  it("let the Open Food Facts contact be missing", () => {
    const without = COMPLETE.filter(
      (line) => !line.startsWith("EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL=")
    );
    expect(publicExportValues(parseEnvFile(pulled(without)))).toContainEqual({
      name: "EXPO_PUBLIC_OPEN_FOOD_FACTS_EMAIL",
      value: ""
    });
  });

  // Each value is one line of $GITHUB_OUTPUT: a carriage return inside could start another.
  it("refuse a value that could break out of its line", () => {
    const variables = parseEnvFile(pulled(COMPLETE));
    variables.set("PASSKEY_RP_ID", "example.test\rPASSKEY_APPLE_TEAM_ID=OTHER");
    expect(() => publicExportValues(variables)).toThrow("PASSKEY_RP_ID spans several lines.");
  });

  it("refuse a file that is not the one eas env:pull writes", () => {
    expect(() => parseEnvFile(pulled(["not a variable"]))).toThrow("NAME=value");
    expect(() => parseEnvFile(pulled(["=no-name"]))).toThrow("NAME=value");
  });

  // A pulled file written on Windows, or edited by hand: the line's end is not the value's.
  it("drop a line's carriage return", () => {
    const values = publicExportValues(parseEnvFile(pulled(COMPLETE).replaceAll("\n", "\r\n")));
    expect(values[0]).toEqual({ name: "EXPO_PUBLIC_BREEZ_API_KEY", value: "breez-key" });
  });
});
