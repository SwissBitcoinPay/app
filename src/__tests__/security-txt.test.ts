// The web app's /.well-known/security.txt (RFC 9116, SECURITY.md): the web export copies public/ as
// is. Its Expires must be renewed in time: this test fails 30 days before it passes.
declare const __dirname: string;
const { readFileSync } = jest.requireActual<{
  readFileSync(path: string, encoding: "utf8"): string;
}>("fs");
const { join } = jest.requireActual<{ join(...segments: string[]): string }>("path");
type Hash = { update(data: Uint8Array): Hash; digest(encoding: "hex"): string };
const { createHash } = jest.requireActual<{ createHash(algorithm: "sha1"): Hash }>("crypto");
const { Buffer } = jest.requireActual<{
  Buffer: { from(data: string, encoding: "base64"): Uint8Array };
}>("buffer");

const text = readFileSync(join(__dirname, "../../public/.well-known/security.txt"), "utf8");
const day = 24 * 3600 * 1000;
const fields = text
  .split("\n")
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map((line) => line.split(": "));

// The fingerprint of an armored OpenPGP v4 public key (RFC 4880, 12.2): SHA-1 over 0x99, the
// length and the body of its first packet, which must be a public key (tag 6), never a secret one.
function fingerprint(armored: string): string {
  const base64 = armored
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("-----") && !line.startsWith("="))
    .join("");
  const key = Buffer.from(base64, "base64");
  if (key[0] !== 0xc6 || (key[1] ?? 255) >= 192) throw new Error("not a public key packet first");
  const body = key.subarray(2, 2 + (key[1] ?? 0));
  const length = Uint8Array.of(body.length >> 8, body.length & 255);
  return createHash("sha1").update(Uint8Array.of(0x99)).update(length).update(body).digest("hex");
}

describe(".well-known/security.txt", () => {
  it("has only fields, each with a value", () => {
    for (const field of fields) expect(field).toHaveLength(2);
  });

  it("names the security contact", () => {
    expect(fields).toContainEqual(["Contact", "mailto:security@sattle.me"]);
  });

  it("expires once, in 30 days to a year (RFC 9116, 2.5.5)", () => {
    const expires = fields.filter(([name]) => name === "Expires").map(([, value]) => value ?? "");
    expect(expires).toHaveLength(1);
    const date = Date.parse(expires[0] ?? "");
    expect(date).toBeGreaterThan(Date.now() + 30 * day);
    expect(date).toBeLessThan(Date.now() + 366 * day);
  });

  it("names the fingerprint of the OpenPGP key served beside it", () => {
    const key = readFileSync(join(__dirname, "../../public/.well-known/pgp-key.txt"), "utf8");
    expect(key).toContain("-----BEGIN PGP PUBLIC KEY BLOCK-----");
    expect(fields).toContainEqual(["Encryption", `openpgp4fpr:${fingerprint(key)}`]);
  });
});
