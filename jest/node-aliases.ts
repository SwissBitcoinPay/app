/**
 * In-memory fake of the Lightning nodes' aliases as mempool.space tells them, for Jest
 * (jest.setup.ts): it stands in for src/lib/lightning/node-alias.ts, whose real client
 * node-alias.test.ts covers. A test names a node (`aliases.set(node, alias)`); any other announces
 * none, as a private node.
 */
const actual = jest.requireActual<typeof import("../src/lib/lightning/node-alias")>(
  "../src/lib/lightning/node-alias"
);
export const { NODE_ALIAS_TIMEOUT_MS } = actual;

export const nodeAliases = {
  aliases: new Map<string, string>(),
  /** mempool.space does not answer: no alias can be told. */
  down: false,
  /** Every node asked about, in order. */
  asked: [] as string[]
};

export async function fetchNodeAlias(node: string): Promise<string | null> {
  nodeAliases.asked.push(node);
  if (nodeAliases.down) return null;
  return nodeAliases.aliases.get(node) ?? null;
}

export function resetNodeAliases(): void {
  nodeAliases.aliases.clear();
  nodeAliases.down = false;
  nodeAliases.asked = [];
}
