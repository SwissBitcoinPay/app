/**
 * How a merchant connects an AI app to its assistant (the server: sattleme/mcp-server). "AI
 * assistant" in "New integration" is open in every build: every build's assistants use the same
 * server.
 *
 * - `hosted`: the address an AI app (Claude, ChatGPT…) connects to, its MCP endpoint the origin
 *   itself (no path);
 * - `desktop`: the page of the server's latest release, which carries the Claude Desktop bundle
 *   (`.mcpb`), or null to hide Claude Desktop's steps. The steps link to the bundle itself once
 *   that release is read (src/lib/assistant/desktop-bundle.ts), to this page until then or when it
 *   cannot be read;
 * - `selfHosted`: the server's repository, at its README's "Self-hosted" section, for a merchant
 *   (or their developer) who runs the same server on a machine of their own, or null to hide that
 *   way. Its releases are public (the branch `stable` is what its Render button deploys); its
 *   guide: docs/SELF-HOSTING.md there.
 *
 * An assistant's invoices send their payment links to the build's web app, which its channel names
 * (invoicingBaseOf): a build without one (no RP ID: local, CI) names none, and the
 * server makes no invoice (`no_web_app`) until the owner's app, once it has one, writes it there.
 * The way only changes what "AI assistant" explains: every way takes the same key.
 */
export type AssistantConnections = {
  hosted: string;
  desktop: string | null;
  selfHosted: string | null;
};

/** The server's repository on GitHub (owner/name), whose releases carry the Claude Desktop bundle. */
export const ASSISTANT_REPOSITORY = "sattleme/mcp-server";

export const ASSISTANT_CONNECTIONS: AssistantConnections = {
  hosted: "https://mcp.sattle.me",
  desktop: `https://github.com/${ASSISTANT_REPOSITORY}/releases/latest`,
  selfHosted: `https://github.com/${ASSISTANT_REPOSITORY}#self-hosted`
};

/** The connector's name in an AI app, as the merchant sees it there: the brand, never translated. */
export const ASSISTANT_CONNECTOR_NAME = "sattle.me";

/**
 * "Add to Claude": Claude's install link of a custom connector, which opens its "Add custom
 * connector" dialog with the name and the address filled in
 * (claude.com/docs/connectors/building/directory-vs-custom, "Custom connector install link"). It
 * only fills the form: the merchant reviews it and confirms, and
 * claude.ai says the values came from an external link. A signed-out merchant signs in first.
 */
export function claudeConnectorLink(server: string): string {
  return (
    "https://claude.ai/customize/connectors?modal=add-custom-connector" +
    `&connectorName=${encodeURIComponent(ASSISTANT_CONNECTOR_NAME)}` +
    `&connectorUrl=${encodeURIComponent(server)}`
  );
}

/**
 * ChatGPT's page where a custom MCP server is added ("+", "Add custom MCP server":
 * developers.openai.com/plugins/deploy/connect-chatgpt). ChatGPT documents no
 * link that fills its address in: the merchant pastes it, copied beside.
 */
export const CHATGPT_CONNECTORS_PAGE = "https://chatgpt.com/plugins";

/** The ways released (tests replace them). */
export function assistantConnections(): AssistantConnections {
  return ASSISTANT_CONNECTIONS;
}

/**
 * Whether allowing an assistant to export the transactions is suspended (never in this build;
 * tests replace it): while it is, withdrawing stays possible and the grants already allowed are
 * kept in step. The export grant's keys never open the payment links' signing keys: those are
 * sealed for the link key reader, which no grant gives (deriveLinkKeyReader, src/lib/team/keys.ts).
 */
export function exportGrantsSuspended(): boolean {
  return false;
}
