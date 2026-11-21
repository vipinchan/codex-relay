const {
  withAppDelegate,
  withInfoPlist,
  withPodfile,
  withXcodeProject,
} = require("expo/config-plugins");

function replaceRequired(source, before, after) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) {
    throw new Error(`Mac Catalyst build: generated native template changed; missing ${before}`);
  }
  return source.replace(before, after);
}

module.exports = function withMacCatalyst(config) {
  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const targets = project.pbxNativeTargetSection();
    const lists = project.pbxXCConfigurationList();
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const target of Object.values(targets)) {
      if (
        typeof target !== "object" ||
        target.productType !== '"com.apple.product-type.application"'
      ) {
        continue;
      }
      for (const entry of lists[target.buildConfigurationList].buildConfigurations) {
        Object.assign(configurations[entry.value].buildSettings, {
          SUPPORTS_MACCATALYST: "YES",
          SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: "NO",
          DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER: "YES",
        });
      }
    }
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    const transport = (mod.modResults.NSAppTransportSecurity ??= {});
    transport.NSAllowsArbitraryLoads = true;
    // These narrower keys make ATS ignore NSAllowsArbitraryLoads, blocking
    // public HTTP relays even when localhost remains reachable.
    delete transport.NSAllowsLocalNetworking;
    delete transport.NSAllowsArbitraryLoadsForMedia;
    delete transport.NSAllowsArbitraryLoadsInWebContent;
    return mod;
  });
  config = withPodfile(config, (mod) => {
    mod.modResults.contents = replaceRequired(
      mod.modResults.contents,
      ":mac_catalyst_enabled => false",
      ":mac_catalyst_enabled => true",
    );
    // Keep the image decoder versions aligned with the verified Catalyst build.
    mod.modResults.contents = replaceRequired(
      mod.modResults.contents,
      "target 'CodexRelay' do\n",
      "target 'CodexRelay' do\n  pod 'libavif/libdav1d', '0.11.1'\n  pod 'libdav1d', '1.2.0'\n  pod 'libwebp', '1.6.0'\n",
    );
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    mod.modResults.contents = replaceRequired(
      mod.modResults.contents,
      "return HotUpdater.bundleURL()",
      'return Bundle.main.url(forResource: "main", withExtension: "jsbundle")',
    );
    const windowRestriction = [
      "#if targetEnvironment(macCatalyst)",
      "    NotificationCenter.default.addObserver(",
      "      forName: UIApplication.didBecomeActiveNotification,",
      "      object: nil,",
      "      queue: .main",
      "    ) { _ in",
      "      for scene in UIApplication.shared.connectedScenes {",
      "        if let windowScene = scene as? UIWindowScene {",
      "          windowScene.sizeRestrictions?.minimumSize = CGSize(width: 1200, height: 720)",
      "          windowScene.titlebar?.titleVisibility = .hidden",
      "        }",
      "      }",
      "    }",
      "#endif",
      "    return super.application(application, didFinishLaunchingWithOptions: launchOptions)",
    ].join("\n");
    mod.modResults.contents = replaceRequired(
      mod.modResults.contents,
      "    return super.application(application, didFinishLaunchingWithOptions: launchOptions)",
      windowRestriction,
    );
    return mod;
  });
};
