import { strict as assert } from "node:assert";
import { test } from "node:test";
import withMacCatalyst from "../../apps/mobile/plugins/with-mac-catalyst.cjs";

test("allows user-configured HTTP relays without ATS keys that override arbitrary loads", async () => {
  const config = withMacCatalyst({ name: "Codex Relay", slug: "codex-relay" });
  const exceptionDomains = { "example.com": { NSIncludesSubdomains: true } };
  const result = await config.mods.ios.infoPlist({
    ...config,
    modRequest: { platform: "ios" },
    modResults: {
      CFBundleDisplayName: "Codex Relay",
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSAllowsLocalNetworking: true,
        NSAllowsArbitraryLoadsForMedia: false,
        NSAllowsArbitraryLoadsInWebContent: false,
        NSExceptionDomains: exceptionDomains,
      },
    },
  });

  assert.equal(result.modResults.CFBundleDisplayName, "Codex Relay");
  assert.deepEqual(result.modResults.NSAppTransportSecurity, {
    NSAllowsArbitraryLoads: true,
    NSExceptionDomains: exceptionDomains,
  });
});
