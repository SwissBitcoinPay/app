import { ASSISTANT_CONNECTIONS } from "@/config/assistants";
import {
  GRANDNODE_PLUGIN_ARCHIVE,
  GRANDNODE_PLUGIN_URL
} from "@/features/integrations/guide-grandnode";
import { NOPCOMMERCE_PLUGIN_ARCHIVE } from "@/features/integrations/guide-nopcommerce";
import { PRESTASHOP_MODULE_ZIP } from "@/features/integrations/guide-prestashop";
import { SMARTSTORE_PLUGIN_PACKAGE } from "@/features/integrations/guide-smartstore";
import { WOOCOMMERCE_PLUGIN_ZIP } from "@/features/integrations/guide-woocommerce";
import { DESKTOP_BUNDLE, desktopBundleName } from "@/lib/assistant/desktop-bundle";
import {
  fetchReleaseDownload,
  latestReleaseApi,
  releaseFileUrl
} from "@/lib/github/latest-release";

/*
 * The file of a repository's latest release that a step downloads itself
 * (src/lib/github/latest-release.ts): the assistant's Claude Desktop bundle, GrandNode's plugin
 * archive. The latest release's, as GitHub's API names it, only when its answer holds that very
 * file.
 */

function respond(status: number, body?: unknown) {
  return jest
    .fn()
    .mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}

/** GitHub's answer for a release (the fields the app reads). */
function release(tag: unknown, assets: unknown = [{ name: `sattleme-assistant-0.1.2.mcpb` }]) {
  return { tag_name: tag, draft: false, prerelease: false, assets };
}

describe("fetchReleaseDownload", () => {
  it("gives the latest release's bundle, its address built from the version", async () => {
    const fetchMock = respond(
      200,
      release("v0.1.2", [{ name: "sattleme-assistant-0.1.2.mcpb" }, { name: "SHA256SUMS" }])
    );

    await expect(fetchReleaseDownload(DESKTOP_BUNDLE, fetchMock)).resolves.toEqual({
      version: "0.1.2",
      url: "https://github.com/sattleme/mcp-server/releases/download/v0.1.2/sattleme-assistant-0.1.2.mcpb"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/sattleme/mcp-server/releases/latest",
      { headers: { Accept: "application/json" }, signal: expect.any(AbortSignal) }
    );
  });

  it("gives the latest release's GrandNode archive, as the plugin's release workflow names it", async () => {
    // A release's assets as sattleme/checkout-grandnode's release workflow publishes them
    // (.github/workflows/release.yml): the archive and its SHA256SUMS.
    const fetchMock = respond(
      200,
      release("v1.0.0", [{ name: "Payments.Sattleme-1.0.0.zip" }, { name: "SHA256SUMS" }])
    );

    await expect(fetchReleaseDownload(GRANDNODE_PLUGIN_ARCHIVE, fetchMock)).resolves.toEqual({
      version: "1.0.0",
      url: "https://github.com/sattleme/checkout-grandnode/releases/download/v1.0.0/Payments.Sattleme-1.0.0.zip"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/sattleme/checkout-grandnode/releases/latest",
      { headers: { Accept: "application/json" }, signal: expect.any(AbortSignal) }
    );
    // Another version's archive is not this release's.
    await expect(
      fetchReleaseDownload(
        GRANDNODE_PLUGIN_ARCHIVE,
        respond(200, release("v1.0.1", [{ name: "Payments.Sattleme-1.0.0.zip" }]))
      )
    ).rejects.toThrow(/has no file Payments\.Sattleme-1\.0\.1\.zip/);
  });

  it("gives the latest release's nopCommerce archive, never a zip that holds it", async () => {
    const fetchMock = respond(
      200,
      release("v1.0.2", [
        { name: "Payments.Sattleme-1.0.2.zip" },
        { name: "checkout-nopcommerce-1.0.2-source.zip" },
        { name: "SHA256SUMS" }
      ])
    );
    await expect(fetchReleaseDownload(NOPCOMMERCE_PLUGIN_ARCHIVE, fetchMock)).resolves.toEqual({
      version: "1.0.2",
      url: "https://github.com/sattleme/checkout-nopcommerce/releases/download/v1.0.2/Payments.Sattleme-1.0.2.zip"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/sattleme/checkout-nopcommerce/releases/latest",
      { headers: { Accept: "application/json" }, signal: expect.any(AbortSignal) }
    );
    // Release v1.0.1's assets: each a zip holding the archive, which nopCommerce does not take.
    await expect(
      fetchReleaseDownload(
        NOPCOMMERCE_PLUGIN_ARCHIVE,
        respond(
          200,
          release("v1.0.1", [
            { name: "Payments.Sattleme-v1.0.1.zip" },
            { name: "Payments.Sattleme.zip" }
          ])
        )
      )
    ).rejects.toThrow(/has no file Payments\.Sattleme-1\.0\.1\.zip/);
  });

  it("gives the latest release's WooCommerce ZIP and Smartstore package, as their releases name them", async () => {
    // Release v1.0.0's assets of each repository, as GitHub lists them.
    await expect(
      fetchReleaseDownload(
        WOOCOMMERCE_PLUGIN_ZIP,
        respond(
          200,
          release("v1.0.0", [
            { name: "sattleme-for-woocommerce-1.0.0.zip" },
            { name: "SHA256SUMS" }
          ])
        )
      )
    ).resolves.toEqual({
      version: "1.0.0",
      url: "https://github.com/sattleme/checkout-woocommerce/releases/download/v1.0.0/sattleme-for-woocommerce-1.0.0.zip"
    });
    await expect(
      fetchReleaseDownload(
        SMARTSTORE_PLUGIN_PACKAGE,
        respond(
          200,
          release("v1.0.0", [
            { name: "SHA256SUMS" },
            { name: "Smartstore.Module.Sattleme.Bitcoin.1.0.0.zip" }
          ])
        )
      )
    ).resolves.toEqual({
      version: "1.0.0",
      url: "https://github.com/sattleme/checkout-smartstore/releases/download/v1.0.0/Smartstore.Module.Sattleme.Bitcoin.1.0.0.zip"
    });
  });

  it("gives the latest release's PrestaShop ZIP, sattleme.zip whatever its version", async () => {
    // Release v1.0.0's assets, as GitHub lists them (sattleme/checkout-prestashop).
    await expect(
      fetchReleaseDownload(
        PRESTASHOP_MODULE_ZIP,
        respond(200, release("v1.0.0", [{ name: "SHA256SUMS" }, { name: "sattleme.zip" }]))
      )
    ).resolves.toEqual({
      version: "1.0.0",
      url: "https://github.com/sattleme/checkout-prestashop/releases/download/v1.0.0/sattleme.zip"
    });
    // A release without it leaves the release's page.
    await expect(
      fetchReleaseDownload(
        PRESTASHOP_MODULE_ZIP,
        respond(200, release("v1.0.1", [{ name: "sattleme-1.0.1.zip" }]))
      )
    ).rejects.toThrow(/has no file sattleme\.zip/);
  });

  it("falls back to the public page of the latest release", () => {
    expect(ASSISTANT_CONNECTIONS.desktop).toBe(
      "https://github.com/sattleme/mcp-server/releases/latest"
    );
    expect(GRANDNODE_PLUGIN_URL).toBe(
      "https://github.com/sattleme/checkout-grandnode/releases/latest"
    );
  });

  it("names the files as the release workflows do", () => {
    expect(desktopBundleName("10.0.3")).toBe("sattleme-assistant-10.0.3.mcpb");
    expect(GRANDNODE_PLUGIN_ARCHIVE.name("10.0.3")).toBe("Payments.Sattleme-10.0.3.zip");
    expect(NOPCOMMERCE_PLUGIN_ARCHIVE.name("10.0.3")).toBe("Payments.Sattleme-10.0.3.zip");
    expect(latestReleaseApi("sattleme/mcp-server")).toBe(
      "https://api.github.com/repos/sattleme/mcp-server/releases/latest"
    );
    expect(releaseFileUrl("sattleme/mcp-server", "10.0.3", "sattleme-assistant-10.0.3.mcpb")).toBe(
      "https://github.com/sattleme/mcp-server/releases/download/v10.0.3/sattleme-assistant-10.0.3.mcpb"
    );
  });

  it("rejects an HTTP error, GitHub's rate limit included", async () => {
    await expect(fetchReleaseDownload(DESKTOP_BUNDLE, respond(403))).rejects.toThrow(/403/);
    await expect(fetchReleaseDownload(DESKTOP_BUNDLE, respond(404))).rejects.toThrow(/404/);
    await expect(fetchReleaseDownload(DESKTOP_BUNDLE, respond(500))).rejects.toThrow(/500/);
  });

  it("rejects a tag that is not a plain version: nothing of it reaches the address", async () => {
    for (const tag of [
      undefined,
      12,
      "0.1.2",
      "v0.1",
      "v0.1.2-rc.1",
      "v01.1.2",
      "v0.1.2/../../evil",
      "v0.1.2?x=1",
      "v0.1.2 ",
      "v1234567.0.0"
    ]) {
      await expect(
        fetchReleaseDownload(DESKTOP_BUNDLE, respond(200, release(tag)))
      ).rejects.toThrow(/unexpected release tag/);
    }
  });

  it("rejects an answer that is not a release", async () => {
    for (const body of [null, "v0.1.2", [], 42]) {
      await expect(fetchReleaseDownload(DESKTOP_BUNDLE, respond(200, body))).rejects.toThrow(
        /unexpected/
      );
    }
  });

  it("rejects a release without its file, or with another version's", async () => {
    for (const assets of [
      null,
      "sattleme-assistant-0.1.2.mcpb",
      { name: "sattleme-assistant-0.1.2.mcpb" },
      [],
      [{ name: "SHA256SUMS" }],
      [{ name: "sattleme-assistant-0.1.1.mcpb" }],
      [null, "sattleme-assistant-0.1.2.mcpb"]
    ]) {
      await expect(
        fetchReleaseDownload(DESKTOP_BUNDLE, respond(200, release("v0.1.2", assets)))
      ).rejects.toThrow(/has no file sattleme-assistant-0\.1\.2\.mcpb/);
    }
  });

  it("takes no address from the answer: only the version and the file's own name", async () => {
    const fetchMock = respond(200, {
      ...release("v0.1.2", [
        {
          name: "sattleme-assistant-0.1.2.mcpb",
          browser_download_url: "https://evil.example/sattleme-assistant-0.1.2.mcpb"
        }
      ]),
      html_url: "https://evil.example/"
    });
    await expect(fetchReleaseDownload(DESKTOP_BUNDLE, fetchMock)).resolves.toEqual({
      version: "0.1.2",
      url: "https://github.com/sattleme/mcp-server/releases/download/v0.1.2/sattleme-assistant-0.1.2.mcpb"
    });
  });

  it("rejects a body that is not JSON", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      }
    });
    await expect(fetchReleaseDownload(DESKTOP_BUNDLE, fetchMock)).rejects.toThrow(
      /Unexpected token/
    );
  });

  it("gives up when GitHub does not answer in time", async () => {
    const hanging = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
        })
    );

    await expect(
      fetchReleaseDownload(DESKTOP_BUNDLE, hanging as unknown as typeof fetch, 10)
    ).rejects.toThrow(/Aborted/);
  });
});
