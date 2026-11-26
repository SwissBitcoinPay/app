import {
  ASSISTANT_CONNECTIONS,
  ASSISTANT_CONNECTOR_NAME,
  CHATGPT_CONNECTORS_PAGE,
  claudeConnectorLink
} from "@/config/assistants";

/*
 * The ways "AI assistant" offers (src/config/assistants.ts): the addresses released, and Claude's
 * install link as its documentation writes it (claude.com/docs/connectors/building/
 * directory-vs-custom, "Custom connector install link").
 */

describe("the assistant's ways", () => {
  it("are the hosted server, Claude Desktop's release and the self-hosting guide", () => {
    expect(ASSISTANT_CONNECTIONS).toEqual({
      hosted: "https://mcp.sattle.me",
      desktop: "https://github.com/sattleme/mcp-server/releases/latest",
      selfHosted: "https://github.com/sattleme/mcp-server#self-hosted"
    });
  });

  it("add the hosted server to Claude with its dialog filled in, the address percent-encoded", () => {
    expect(ASSISTANT_CONNECTOR_NAME).toBe("sattle.me");
    expect(claudeConnectorLink(ASSISTANT_CONNECTIONS.hosted)).toBe(
      "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=sattle.me&connectorUrl=https%3A%2F%2Fmcp.sattle.me"
    );
    // The documentation's own example's address, encoded as it shows it.
    expect(claudeConnectorLink("https://mcp.example.com/")).toMatch(
      /&connectorUrl=https%3A%2F%2Fmcp\.example\.com%2F$/
    );
    // Whatever the address holds stays inside its parameter: never a parameter of its own.
    const link = new URL(claudeConnectorLink("https://mcp.example.com/?a=1&modal=x#y"));
    expect([...link.searchParams.keys()]).toEqual(["modal", "connectorName", "connectorUrl"]);
    expect(link.searchParams.get("modal")).toBe("add-custom-connector");
    expect(link.searchParams.get("connectorUrl")).toBe("https://mcp.example.com/?a=1&modal=x#y");
    expect(link.hash).toBe("");
  });

  it("send ChatGPT's merchants to the page where a custom MCP server is added", () => {
    expect(CHATGPT_CONNECTORS_PAGE).toBe("https://chatgpt.com/plugins");
  });
});
