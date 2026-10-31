import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { hasCodexRelaySession } from "@/lib/codex-relay-api";
import { hapticSelection, hapticSuccess } from "@/lib/haptics";
import {
  createThreadServerState,
  fetchWorkspaceDirectoriesState,
  serverStateKeys,
  serverStateQueryFns,
} from "@/lib/server-state";
import { workspaceName } from "@/lib/workspace-name";
import { preferredNewChatWorkspacePath, workspacePathInputError } from "./new-chat-workspace";
import { setActiveThread, setConnection, setHasPairedSession } from "@/state/chat-store";

type WorkspaceBrowser = Awaited<ReturnType<typeof fetchWorkspaceDirectoriesState>>;

type WorkspaceRow =
  | { id: string; kind: "parent"; path: string }
  | { id: string; kind: "directory"; name: string; path: string };

export function NewChatWorkspaceScreen() {
  const queryClient = useQueryClient();
  const [browser, setBrowser] = useState<WorkspaceBrowser | undefined>(undefined);
  const [isLoading, setLoading] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [pathError, setPathError] = useState<string | undefined>(undefined);
  const initialLoadStartedRef = useRef(false);
  const operationPendingRef = useRef(false);

  const statusQuery = useQuery({
    queryKey: serverStateKeys.status(),
    queryFn: serverStateQueryFns.status,
    staleTime: 5_000,
  });

  const createThreadMutation = useMutation({
    mutationFn: (workspacePath: string) =>
      createThreadServerState(queryClient, {
        title: "New chat",
        workspacePath,
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: serverStateKeys.threads() });
      setActiveThread(response.thread.id);
      setConnection("connected");
      hapticSuccess();
    },
    onError: (caught) => {
      setHasPairedSession(hasCodexRelaySession());
      const message =
        caught instanceof Error ? caught.message : "Unable to create a new Codex Relay thread.";
      setConnection("offline", message);
      Alert.alert("Couldn’t create chat", message);
    },
    onSettled: () => {
      operationPendingRef.current = false;
    },
  });

  const loadWorkspaceDirectories = useCallback(
    async (path?: string) => {
      if (operationPendingRef.current) return;

      operationPendingRef.current = true;
      setLoading(true);
      setPathError(undefined);
      setConnection("checking");
      try {
        const response = await fetchWorkspaceDirectoriesState(queryClient, path);
        setBrowser(response);
        setPathInput(response.path);
        setConnection("connected");
        Keyboard.dismiss();
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Unable to load workspace folders.";
        setPathError(message);
        if (
          caught &&
          typeof caught === "object" &&
          "code" in caught &&
          (caught.code === "invalid_workspace_path" || caught.code === "workspace_unavailable")
        ) {
          setConnection("connected");
        } else {
          setHasPairedSession(hasCodexRelaySession());
          setConnection("offline", message);
          Alert.alert("Couldn’t load folders", message);
        }
      } finally {
        operationPendingRef.current = false;
        setLoading(false);
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (initialLoadStartedRef.current || !statusQuery.isFetched) return;
    initialLoadStartedRef.current = true;
    const recentThreads =
      queryClient.getQueryData<Awaited<ReturnType<typeof serverStateQueryFns.threads>>>(
        serverStateKeys.threads(),
      )?.threads ?? [];
    if (operationPendingRef.current || browser) return;
    const initialPath = preferredNewChatWorkspacePath(
      recentThreads,
      statusQuery.data?.workspacePath,
    );
    setPathInput(initialPath ?? "");
    void loadWorkspaceDirectories(initialPath);
  }, [
    loadWorkspaceDirectories,
    queryClient,
    statusQuery.data?.workspacePath,
    statusQuery.isFetched,
    browser,
  ]);

  const currentPath = browser?.path ?? statusQuery.data?.workspacePath;
  const isBusy = isLoading || createThreadMutation.isPending;
  const canCreate =
    Boolean(browser?.path) && !isBusy && !pathError && pathInput.trim() === browser?.path;
  const rows = useMemo<WorkspaceRow[]>(() => {
    if (!browser) return [];

    const result: WorkspaceRow[] = [];
    if (browser.parentPath) {
      result.push({
        id: `parent:${browser.parentPath}`,
        kind: "parent",
        path: browser.parentPath,
      });
    }
    for (const directory of browser.directories) {
      result.push({
        id: `directory:${directory.path}`,
        kind: "directory",
        name: directory.name,
        path: directory.path,
      });
    }
    return result;
  }, [browser]);

  function close() {
    hapticSelection();
    router.back();
  }

  function createChatHere() {
    if (!canCreate || !browser || operationPendingRef.current) return;
    operationPendingRef.current = true;
    hapticSelection();
    createThreadMutation.mutate(browser.path);
  }

  function goToEnteredPath() {
    if (operationPendingRef.current) return;
    const error = workspacePathInputError(pathInput);
    setPathError(error);
    if (error) return;
    hapticSelection();
    void loadWorkspaceDirectories(pathInput.trim());
  }

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel new chat"
            onPress={close}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
          <View style={styles.headerCopy}>
            <ThemedText style={styles.title}>New Chat</ThemedText>
            <ThemedText numberOfLines={1} style={styles.subtitle}>
              Choose a working directory
            </ThemedText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.locationCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to parent folder"
            accessibilityState={{ disabled: !browser?.parentPath || isBusy }}
            disabled={!browser?.parentPath || isBusy}
            onPress={() => void loadWorkspaceDirectories(browser?.parentPath ?? undefined)}
            style={({ pressed }) => [
              styles.upButton,
              (!browser?.parentPath || isBusy) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Icon name="up" size={18} tintColor="#FFFFFF" />
          </Pressable>
          <View style={styles.locationCopy}>
            <ThemedText numberOfLines={1} style={styles.locationName}>
              {workspaceName(currentPath) ?? "Workspace"}
            </ThemedText>
            <ThemedText numberOfLines={1} style={styles.locationPath}>
              {currentPath ?? (isLoading ? "Loading…" : "Select a folder")}
            </ThemedText>
          </View>
        </View>

        <View style={styles.pathEntry}>
          <ThemedText style={styles.pathLabel}>Folder path</ThemedText>
          <View style={styles.pathEntryRow}>
            <TextInput
              accessibilityLabel="Working directory path"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isBusy}
              onChangeText={(value) => {
                initialLoadStartedRef.current = true;
                setPathInput(value);
                setPathError(undefined);
              }}
              onSubmitEditing={goToEnteredPath}
              placeholder="/Users/..."
              placeholderTextColor="#636366"
              returnKeyType="go"
              selectionColor="#6EA8FF"
              spellCheck={false}
              style={styles.pathInput}
              value={pathInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to entered folder"
              accessibilityState={{ disabled: isBusy }}
              disabled={isBusy}
              onPress={goToEnteredPath}
              style={({ pressed }) => [
                styles.goButton,
                isBusy && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText style={styles.goText}>{isLoading ? "Opening…" : "Go"}</ThemedText>
            </Pressable>
          </View>
          {pathError ? (
            <ThemedText accessibilityRole="alert" style={styles.pathError}>
              {pathError}
            </ThemedText>
          ) : null}
        </View>

        <FlatList
          contentContainerStyle={styles.listContent}
          data={rows}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="folder" size={24} tintColor="#8E8E93" />
              <ThemedText style={styles.emptyText}>
                {isLoading ? "Loading folders…" : "No folders here"}
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => {
            const isParent = item.kind === "parent";
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isParent ? "Open parent folder" : `Open folder ${item.name}`}
                disabled={isBusy}
                onPress={() => {
                  hapticSelection();
                  void loadWorkspaceDirectories(item.path);
                }}
                style={({ pressed }) => [styles.folderRow, pressed && styles.rowPressed]}
              >
                <View style={styles.folderIcon}>
                  <Icon
                    name={isParent ? "up" : "folder"}
                    size={18}
                    tintColor={isParent ? "#8E8E93" : "#6EA8FF"}
                  />
                </View>
                <View style={styles.folderCopy}>
                  <ThemedText numberOfLines={1} style={styles.folderName}>
                    {isParent ? "Parent Folder" : item.name}
                  </ThemedText>
                  <ThemedText numberOfLines={1} style={styles.folderPath}>
                    {item.path}
                  </ThemedText>
                </View>
                {!isParent ? <Icon name="chevronRight" size={15} tintColor="#636366" /> : null}
              </Pressable>
            );
          }}
        />

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create chat in current folder"
            accessibilityState={{
              disabled: !canCreate,
            }}
            disabled={!canCreate}
            onPress={createChatHere}
            style={({ pressed }) => [
              styles.createButton,
              !canCreate && styles.disabled,
              pressed && styles.createPressed,
            ]}
          >
            <Icon name="newChat" size={19} tintColor="#FFFFFF" />
            <View style={styles.createCopy}>
              <ThemedText style={styles.createTitle}>
                {createThreadMutation.isPending ? "Creating…" : "New Chat Here"}
              </ThemedText>
              <ThemedText numberOfLines={1} style={styles.createSubtitle}>
                {currentPath ?? "Choose a folder"}
              </ThemedText>
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#000000",
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 60,
    paddingHorizontal: 18,
  },
  headerButton: {
    alignItems: "flex-start",
    justifyContent: "center",
    minHeight: 40,
    width: 72,
  },
  cancelText: {
    color: "#6EA8FF",
    fontSize: 16,
    fontWeight: "600",
  },
  headerCopy: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 23,
  },
  subtitle: {
    color: "#8E8E93",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  headerSpacer: {
    width: 72,
  },
  locationCard: {
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    borderRadius: 14,
    flexDirection: "row",
    marginBottom: 10,
    marginHorizontal: 16,
    minHeight: 58,
    paddingHorizontal: 10,
  },
  upButton: {
    alignItems: "center",
    borderRadius: 10,
    height: 38,
    justifyContent: "center",
    marginRight: 8,
    width: 38,
  },
  locationCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  locationPath: {
    color: "#8E8E93",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  pathEntry: {
    marginBottom: 10,
    marginHorizontal: 16,
  },
  pathLabel: {
    color: "#8E8E93",
    fontSize: 11,
    marginBottom: 6,
  },
  pathEntryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  pathInput: {
    backgroundColor: "#1C1C1E",
    borderRadius: 10,
    color: "#FFFFFF",
    flex: 1,
    fontSize: 13,
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  goButton: {
    alignItems: "center",
    backgroundColor: "#1C1C1E",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 52,
    paddingHorizontal: 12,
  },
  goText: {
    color: "#6EA8FF",
    fontSize: 13,
    fontWeight: "600",
  },
  pathError: {
    color: "#FF6961",
    fontSize: 12,
    marginTop: 6,
  },
  listContent: {
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  folderRow: {
    alignItems: "center",
    borderBottomColor: "rgba(255, 255, 255, 0.07)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: 62,
    paddingHorizontal: 8,
  },
  rowPressed: {
    backgroundColor: "#1C1C1E",
    borderRadius: 12,
  },
  folderIcon: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    marginRight: 8,
    width: 36,
  },
  folderCopy: {
    flex: 1,
    minWidth: 0,
  },
  folderName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  folderPath: {
    color: "#636366",
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    minHeight: 180,
  },
  emptyText: {
    color: "#8E8E93",
    fontSize: 13,
  },
  footer: {
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  createButton: {
    alignItems: "center",
    backgroundColor: "#0A84FF",
    borderRadius: 16,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: 16,
  },
  createPressed: {
    opacity: 0.82,
  },
  createCopy: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  createTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
  createSubtitle: {
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.68,
  },
});
