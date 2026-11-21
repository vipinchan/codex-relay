import { strict as assert } from "node:assert";
import { test } from "node:test";
import withMacCatalyst from "../../apps/mobile/plugins/with-mac-catalyst.cjs";

test("injects embedded bundle URL and Catalyst minimum window size restriction", async () => {
  const config = withMacCatalyst({ name: "Codex Relay", slug: "codex-relay" });
  const sampleAppDelegate = [
    "import UIKit",
    "import React",
    "@UIApplicationMain",
    "class AppDelegate: EXAppDelegateWrapper {",
    "  override func application(",
    "    _ application: UIApplication,",
    "    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?",
    "  ) -> Bool {",
    "    return super.application(application, didFinishLaunchingWithOptions: launchOptions)",
    "  }",
    "  override func bundleURL() -> URL? {",
    "    return HotUpdater.bundleURL()",
    "  }",
    "}",
  ].join("\n");

  const result = await config.mods.ios.appDelegate({
    ...config,
    modRequest: { platform: "ios" },
    modResults: { contents: sampleAppDelegate },
  });

  assert(
    result.modResults.contents.includes(
      'Bundle.main.url(forResource: "main", withExtension: "jsbundle")',
    ),
  );
  assert(result.modResults.contents.includes("CGSize(width: 1200, height: 720)"));
  assert(result.modResults.contents.includes("targetEnvironment(macCatalyst)"));
});
