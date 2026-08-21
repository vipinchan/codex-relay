from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


chat_path = "apps/mobile/src/components/chat/ChatScreen.tsx"
settings_path = "apps/mobile/src/app/settings.tsx"

replace(
    chat_path,
    'import { useFocusEffect, useNavigation } from "expo-router";',
    'import { useFocusEffect } from "expo-router";',
)
replace(
    chat_path,
    '''  const drawerNavigation = useNavigation<{\n    openDrawer?: () => void;\n  }>();\n''',
    "",
)
replace(
    chat_path,
    '''  function openThreadDrawer() {\n    Keyboard.dismiss();\n    requestAnimationFrame(() => {\n      drawerNavigation.openDrawer?.();\n    });\n    hapticMediumImpact();\n  }\n\n''',
    "",
)
replace(
    chat_path,
    '''      leadingAction={{\n        icon: usesExpandedSidebar ? (isSidebarVisible ? "sidebarHide" : "sidebarShow") : "menu",\n        label: usesExpandedSidebar\n          ? isSidebarVisible\n            ? "Hide threads"\n            : "Show threads"\n          : "Open threads",\n        onPress: usesExpandedSidebar ? toggleThreadSidebar : openThreadDrawer,\n      }}''',
    '''      leadingAction={{\n        icon: usesExpandedSidebar\n          ? isSidebarVisible\n            ? "sidebarHide"\n            : "sidebarShow"\n          : "back",\n        label: usesExpandedSidebar\n          ? isSidebarVisible\n            ? "Hide conversations"\n            : "Show conversations"\n          : "Back to conversations",\n        onPress: usesExpandedSidebar\n          ? toggleThreadSidebar\n          : () => {\n              Keyboard.dismiss();\n              hapticSelection();\n              setActiveThread(undefined);\n            },\n      }}''',
)

replace(
    settings_path,
    '''          <View style={styles.titleGroup}>\n            <ThemedText type="smallBold" style={styles.title}>\n              Settings\n            </ThemedText>\n            <ThemedText type="code" themeColor="textSecondary" style={styles.subtitle}>\n              Account\n            </ThemedText>\n          </View>''',
    '''          <View style={styles.titleGroup}>\n            <ThemedText type="smallBold" style={styles.title}>\n              Settings\n            </ThemedText>\n          </View>''',
)
replace(
    settings_path,
    '''  header: {\n    alignItems: "center",\n    flexDirection: "row",\n    gap: 10,\n    paddingBottom: 8,\n    paddingHorizontal: 18,\n    paddingTop: 6,\n  },\n  headerButton: {\n    alignItems: "center",\n    backgroundColor: "rgba(255, 255, 255, 0.08)",\n    borderColor: "rgba(255, 255, 255, 0.1)",\n    borderRadius: 20,\n    borderWidth: 1,\n    height: 40,\n    justifyContent: "center",\n    width: 40,\n  },\n  headerButtonPlaceholder: {\n    height: 40,\n    width: 40,\n  },''',
    '''  header: {\n    alignItems: "center",\n    flexDirection: "row",\n    minHeight: 58,\n    paddingHorizontal: 12,\n  },\n  headerButton: {\n    alignItems: "center",\n    borderRadius: 22,\n    height: 44,\n    justifyContent: "center",\n    width: 44,\n  },\n  headerButtonPlaceholder: {\n    height: 44,\n    width: 44,\n  },''',
)
replace(
    settings_path,
    '''  title: {\n    fontSize: 17,\n    lineHeight: 22,\n    textAlign: "center",\n  },\n  subtitle: {\n    fontSize: 10,\n    lineHeight: 14,\n    opacity: 0.84,\n    textAlign: "center",\n  },\n  content: {\n    gap: Spacing.four,\n    paddingBottom: Spacing.five,\n    paddingHorizontal: 18,\n    paddingTop: Spacing.three,\n  },''',
    '''  title: {\n    fontFamily: Fonts.sansSemiBold,\n    fontSize: 18,\n    fontWeight: "600",\n    lineHeight: 23,\n    textAlign: "center",\n  },\n  content: {\n    gap: 26,\n    paddingBottom: Spacing.five,\n    paddingHorizontal: 18,\n    paddingTop: 12,\n  },''',
)
replace(
    settings_path,
    '''  sectionLabel: {\n    fontFamily: Fonts.sansMedium,\n    fontSize: 11,\n    lineHeight: 16,\n    opacity: 0.68,\n  },''',
    '''  sectionLabel: {\n    fontFamily: Fonts.sansMedium,\n    fontSize: 13,\n    lineHeight: 18,\n    opacity: 0.72,\n    paddingHorizontal: 8,\n  },''',
)
replace(
    settings_path,
    '''  projectLinkList: {\n    backgroundColor: Colors.dark.backgroundElement,\n    borderColor: "rgba(255, 255, 255, 0.09)",\n    borderRadius: 8,\n    borderWidth: 1,\n    gap: 7,\n    padding: Spacing.two,\n  },''',
    '''  projectLinkList: {\n    backgroundColor: Colors.dark.backgroundElement,\n    borderRadius: 14,\n    gap: 2,\n    overflow: "hidden",\n    padding: 6,\n  },''',
)
replace(
    settings_path,
    '''  projectLinkRow: {\n    alignItems: "center",\n    backgroundColor: "rgba(255, 255, 255, 0.04)",\n    borderColor: "rgba(255, 255, 255, 0.08)",\n    borderRadius: 7,\n    borderWidth: 1,\n    flexDirection: "row",\n    gap: Spacing.two,\n    minHeight: 56,\n    paddingHorizontal: 10,\n    paddingVertical: 8,\n  },''',
    '''  projectLinkRow: {\n    alignItems: "center",\n    borderRadius: 10,\n    flexDirection: "row",\n    gap: Spacing.two,\n    minHeight: 58,\n    paddingHorizontal: 10,\n    paddingVertical: 8,\n  },''',
)
replace(
    settings_path,
    '''  connectionPanel: {\n    backgroundColor: Colors.dark.backgroundElement,\n    borderColor: "rgba(255, 255, 255, 0.09)",\n    borderRadius: 8,\n    borderWidth: 1,\n    gap: Spacing.two,\n    padding: Spacing.three,\n  },\n  notificationPanel: {\n    backgroundColor: Colors.dark.backgroundElement,\n    borderColor: "rgba(255, 255, 255, 0.09)",\n    borderRadius: 8,\n    borderWidth: 1,\n    overflow: "hidden",\n  },''',
    '''  connectionPanel: {\n    backgroundColor: Colors.dark.backgroundElement,\n    borderRadius: 14,\n    gap: Spacing.two,\n    padding: Spacing.three,\n  },\n  notificationPanel: {\n    backgroundColor: Colors.dark.backgroundElement,\n    borderRadius: 14,\n    overflow: "hidden",\n  },''',
)
replace(
    settings_path,
    '''  usageCard: {\n    backgroundColor: Colors.dark.backgroundElement,\n    borderColor: "rgba(255, 255, 255, 0.09)",\n    borderRadius: 8,\n    borderWidth: 1,\n    overflow: "hidden",\n  },''',
    '''  usageCard: {\n    backgroundColor: Colors.dark.backgroundElement,\n    borderRadius: 14,\n    overflow: "hidden",\n  },''',
)
