import {
  isPayersNode,
  isPlainHttp,
  nodeApiUrl,
  nodeSocketUrl,
  nodeTxPageUrl,
  normalizeNodeUrl,
  parseBitcoinNode,
  parsePayerNode,
  payerNodeOf,
  sameBitcoinNode
} from "@/lib/onchain/node";

// HTTPS only: an address saved in http:// before
// is still read (the settings and channels that name it stay valid), never asked in clear.
describe("an address saved in http://", () => {
  it("is still read when it is a local network's, as it was accepted until then", () => {
    for (const url of [
      "http://10.0.0.5",
      "http://172.16.0.1:3006",
      "http://172.31.255.254",
      "http://192.168.1.20:3006",
      "http://100.64.0.1/m",
      "http://100.127.255.254",
      "http://umbrel.local:3006",
      "http://mempool.umbrel.local"
    ]) {
      expect(parseBitcoinNode({ url, fallback: "none", payers: false })).toEqual({
        url,
        fallback: "none",
        payers: false
      });
      expect(isPlainHttp(url)).toBe(true);
    }
  });

  it("is never read outside the local network, nor in another spelling", () => {
    for (const url of [
      "http://172.15.0.1",
      "http://172.32.0.1",
      "http://192.169.1.1",
      "http://100.63.255.255",
      "http://100.128.0.1",
      "http://8.8.8.8",
      "http://mempool.space",
      "http://umbrel.local.example.com",
      "http://192.168.1.20:3006/",
      "HTTP://192.168.1.20:3006",
      "http://192.168.1.20:3006/api"
    ]) {
      expect(parseBitcoinNode({ url, fallback: "none", payers: false })).toBeNull();
    }
  });

  it("is asked over HTTPS only: its API, its WebSocket and its pages", () => {
    expect(nodeApiUrl("http://192.168.1.20:3006")).toBe("https://192.168.1.20:3006/api");
    expect(nodeSocketUrl("http://192.168.1.20:3006")).toBe("wss://192.168.1.20:3006/api/v1/ws");
    expect(nodeTxPageUrl("http://umbrel.local:3006/m")).toBe("https://umbrel.local:3006/m/tx/");
  });
});

describe("normalizeNodeUrl", () => {
  it("keeps one spelling: the scheme and host in lower case, no trailing slash nor /api", () => {
    expect(normalizeNodeUrl(" https://192.168.1.20:3006/ ")).toEqual({
      url: "https://192.168.1.20:3006",
      error: null
    });
    expect(normalizeNodeUrl("HTTPS://Umbrel.Local:3006/api/")).toEqual({
      url: "https://umbrel.local:3006",
      error: null
    });
    expect(normalizeNodeUrl("https://Example.ch/Mempool/api")).toEqual({
      url: "https://example.ch/Mempool",
      error: null
    });
  });

  it("adds https:// to an address typed without, the local network's included", () => {
    expect(normalizeNodeUrl("192.168.1.20:3006").url).toBe("https://192.168.1.20:3006");
    expect(normalizeNodeUrl("umbrel.local:3006").url).toBe("https://umbrel.local:3006");
    expect(normalizeNodeUrl("mempool.example.ch").url).toBe("https://mempool.example.ch");
    expect(normalizeNodeUrl("100.101.102.103:3006").url).toBe("https://100.101.102.103:3006");
  });

  it("refuses plain HTTP everywhere, the local network included", () => {
    for (const input of [
      "http://mempool.example.ch",
      "http://8.8.8.8:3006",
      "http://192.168.1.20:3006",
      " HTTP://Umbrel.Local:3006/api/ ",
      "http://100.101.102.103:3006"
    ]) {
      expect(normalizeNodeUrl(input)).toEqual({ url: null, error: "insecure" });
    }
  });

  it("refuses the device itself", () => {
    for (const input of [
      "http://localhost:3006",
      "https://node.localhost",
      "http://127.0.0.1:3006",
      "127.0.0.1",
      "https://0.0.0.0",
      "0.1.2.3:3006"
    ]) {
      expect(normalizeNodeUrl(input).error).toBe("device");
    }
  });

  it("refuses anything that is not a complete address", () => {
    expect(normalizeNodeUrl("  ").error).toBe("empty");
    for (const input of [
      "umbrel",
      "http://umbrel:3006",
      "ftp://192.168.1.20",
      "ws://192.168.1.20:3006",
      "http://192.168.1.20:3006?x=1",
      "http://192.168.1.20:3006#x",
      "http://user:secret@192.168.1.20:3006",
      "http://192.168.1.20:0",
      "http://192.168.1.20:70000",
      "http://192.168.1.20 :3006",
      "https://exa mple.ch",
      "https://1.2.3",
      `https://${"a".repeat(190)}.ch/${"b".repeat(10)}`,
      "https://example.ch/mempool/caf\u00e9",
      "https://example.ch/a\\b",
      "https://example.ch/a@b",
      "https://-node.example.ch",
      "https://node-.example.ch",
      `https://${"a".repeat(64)}.ch`,
      "https://node.123",
      "https://example.ch.",
      "https://node..example.ch",
      "https://010.0.0.1"
    ]) {
      expect(normalizeNodeUrl(input).error).toBe("incomplete");
    }
  });

  it("writes a port without its leading zeros, a label of 63 characters, 200 characters", () => {
    expect(normalizeNodeUrl("https://node.example.ch:0080").url).toBe("https://node.example.ch:80");
    expect(normalizeNodeUrl("https://node.example.ch:65535").url).toBe(
      "https://node.example.ch:65535"
    );
    const label = "a".repeat(63);
    expect(normalizeNodeUrl(`https://${label}.ch`).url).toBe(`https://${label}.ch`);
    const longest = `https://example.ch/${"p".repeat(200 - "https://example.ch/".length)}`;
    expect(normalizeNodeUrl(longest).url).toBe(longest);
    expect(normalizeNodeUrl(`${longest}p`).error).toBe("incomplete");
  });

  it("gives its one spelling back when it is normalized again, and parseBitcoinNode reads it", () => {
    // `/api/api` and `/a//api` once written as `/api` and `/a/`, which neither normalizeNodeUrl
    // nor parseBitcoinNode gives back, would leave the node read nowhere.
    expect(normalizeNodeUrl("https://node.example.ch/api/api").url).toBe("https://node.example.ch");
    expect(normalizeNodeUrl("https://node.example.ch/a//api").url).toBe(
      "https://node.example.ch/a"
    );
    expect(normalizeNodeUrl("https://node.example.ch/a/API//").url).toBe(
      "https://node.example.ch/a"
    );
    for (const input of [
      " https://192.168.1.20:3006/ ",
      "HTTPS://Umbrel.Local:3006/api/",
      "https://Example.ch/Mempool/api",
      "https://node.example.ch/api/api",
      "https://node.example.ch/a//api",
      "https://node.example.ch:0080/x/api/api/",
      "100.101.102.103:3006",
      "mempool.example.ch/mempool"
    ]) {
      const url = normalizeNodeUrl(input).url!;
      expect(normalizeNodeUrl(url).url).toBe(url);
      expect(parseBitcoinNode({ url, fallback: "mempool", payers: false })).toEqual({
        url,
        fallback: "mempool",
        payers: false
      });
    }
  });
});

describe("the node's API and WebSocket", () => {
  it("are mempool's own paths of the same address", () => {
    expect(nodeApiUrl("https://192.168.1.20:3006")).toBe("https://192.168.1.20:3006/api");
    expect(nodeSocketUrl("https://example.ch/mempool")).toBe("wss://example.ch/mempool/api/v1/ws");
    expect(nodeTxPageUrl("https://example.ch/mempool")).toBe("https://example.ch/mempool/tx/");
    expect(isPlainHttp("https://example.ch")).toBe(false);
  });
});

describe("parseBitcoinNode", () => {
  it("reads a node in its one spelling with its fallback and its payers' choice, nothing else", () => {
    expect(
      parseBitcoinNode({ url: "http://192.168.1.20:3006", fallback: "none", payers: false })
    ).toEqual({ url: "http://192.168.1.20:3006", fallback: "none", payers: false });
    expect(
      parseBitcoinNode({ url: "https://node.example.ch", fallback: "mempool", payers: true })
    ).toEqual({ url: "https://node.example.ch", fallback: "mempool", payers: true });
    for (const value of [
      null,
      "http://192.168.1.20:3006",
      [],
      { url: "http://192.168.1.20:3006/", fallback: "none", payers: false },
      { url: "https://node.example.ch:0080", fallback: "none", payers: false },
      { url: "https://node.example.ch/api", fallback: "none", payers: false },
      { url: "http://mempool.example.ch", fallback: "none", payers: false },
      { url: "http://192.168.1.20:3006", fallback: "always", payers: false },
      { fallback: "none", payers: false },
      // The payers' choice said either way, and for a node of the Internet only.
      { url: "http://192.168.1.20:3006", fallback: "none" },
      { url: "http://192.168.1.20:3006", fallback: "none", payers: "no" },
      { url: "http://192.168.1.20:3006", fallback: "none", payers: true },
      { url: "https://192.168.1.20:3006", fallback: "none", payers: true },
      { url: "https://umbrel.local", fallback: "none", payers: true }
    ]) {
      expect(parseBitcoinNode(value)).toBeNull();
    }
  });

  it("compares two choices, null being mempool.space", () => {
    const node = { url: "https://node.example.ch", fallback: "none", payers: false } as const;
    expect(sameBitcoinNode(null, null)).toBe(true);
    expect(sameBitcoinNode(node, { ...node })).toBe(true);
    expect(sameBitcoinNode(node, null)).toBe(false);
    expect(sameBitcoinNode(node, { ...node, fallback: "mempool" })).toBe(false);
    expect(sameBitcoinNode(node, { ...node, payers: true })).toBe(false);
  });
});

describe("the payers' node", () => {
  it("is an HTTPS node of a domain name that is not a .local one", () => {
    for (const url of [
      "https://node.example.ch",
      "https://node.example.ch:8443/mempool",
      "https://local.example.ch"
    ]) {
      expect(isPayersNode(url)).toBe(true);
    }
    // A payer's browser never knocks on an address of its own network, nor travels in clear.
    for (const url of [
      "http://192.168.1.20:3006",
      "https://192.168.1.20:3006",
      "https://100.101.102.103",
      "https://8.8.8.8",
      "https://umbrel.local",
      "https://mempool.umbrel.local:3006"
    ]) {
      expect(isPayersNode(url)).toBe(false);
    }
  });

  it("is given to the payers' pages only when the owner allows it", () => {
    const node = { url: "https://node.example.ch", fallback: "none", payers: false } as const;
    expect(payerNodeOf(null)).toBeNull();
    expect(payerNodeOf(node)).toBeNull();
    expect(payerNodeOf({ ...node, payers: true })).toEqual({
      url: "https://node.example.ch",
      fallback: "none"
    });
  });

  it("is read from a link as an HTTPS node in its one spelling, left aside otherwise", () => {
    expect(parsePayerNode({ url: "https://node.example.ch", fallback: "mempool" })).toEqual({
      url: "https://node.example.ch",
      fallback: "mempool"
    });
    for (const value of [
      undefined,
      null,
      { url: "http://192.168.1.20:3006", fallback: "mempool" },
      { url: "https://192.168.1.20:3006", fallback: "mempool" },
      { url: "https://umbrel.local", fallback: "mempool" },
      { url: "https://node.example.ch/", fallback: "mempool" },
      { url: "https://node.example.ch", fallback: "sometimes" },
      "https://node.example.ch"
    ]) {
      expect(parsePayerNode(value)).toBeNull();
    }
  });
});
