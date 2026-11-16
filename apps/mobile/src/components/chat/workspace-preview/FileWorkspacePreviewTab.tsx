import { useComputerOperations } from "@/hooks/use-computer-operations";
import type { ListWorkspaceFilesResponse } from "codex-relay/api-schema";
import { router } from "expo-router";
import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/ui/icon";
import { Fonts, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  getWorkspaceFileContent as rawGetWorkspaceFileContent,
  listWorkspaceFiles as rawListWorkspaceFiles,
} from "@/lib/codex-relay-api";
import { hapticSelection } from "@/lib/haptics";
import { workspaceFileContentQueryKey, workspaceFilesQueryKey } from "@/lib/workspace-file-queries";

import { WorkspaceFileContentView } from "./WorkspaceFileContentView";
import { WorkspaceCodeWebView } from "./WorkspaceCodeWebView";

type WorkspaceFile = ListWorkspaceFilesResponse["files"][number];
type ParentDirectoryEntry = {
  directory: string;
  kind: "parent";
  name: "..";
  path: string;
};
type ExplorerEntry = WorkspaceFile | ParentDirectoryEntry;

const EMPTY_WORKSPACE_FILES: WorkspaceFile[] = [];
const FILE_ROW_HEIGHT = 36;
const FILE_ROW_GAP = Spacing.half;
const FILE_ROW_ESTIMATED_SIZE = FILE_ROW_HEIGHT + FILE_ROW_GAP;
const FILE_LIST_VISIBLE_ROWS = 5;
const FILE_LIST_VIEWPORT_HEIGHT =
  FILE_ROW_HEIGHT * FILE_LIST_VISIBLE_ROWS +
  FILE_ROW_GAP * (FILE_LIST_VISIBLE_ROWS - 1) +
  Spacing.one;
const FILE_SEARCH_BAR_HEIGHT = 34;
const FILE_EXPLORER_BODY_HEIGHT = FILE_SEARCH_BAR_HEIGHT + Spacing.one + FILE_LIST_VIEWPORT_HEIGHT;
export const FileWorkspacePreviewTab = memo(function FileWorkspacePreviewTab({
  workspacePath,
}: {
  workspacePath?: string;
}) {
  const { getWorkspaceFileContent, listWorkspaceFiles } = useComputerOperations({
    getWorkspaceFileContent: rawGetWorkspaceFileContent,
    listWorkspaceFiles: rawListWorkspaceFiles,
  });
  const theme = useTheme();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 180);
  const [currentDirectory, setCurrentDirectory] = useState("");
  const [isExplorerExpanded, setExplorerExpanded] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isPullRefreshing, setPullRefreshing] = useState(false);
  const fileListQueryKey = useMemo(
    () => workspaceFilesQueryKey(workspacePath, currentDirectory, debouncedQuery),
    [currentDirectory, debouncedQuery, workspacePath],
  );
  const filesQuery = useQuery({
    queryFn: () =>
      listWorkspaceFiles({
        directory: currentDirectory,
        query: debouncedQuery,
        workspacePath,
      }),
    queryKey: fileListQueryKey,
    staleTime: 10_000,
  });
  const fileEntries = filesQuery.data?.files ?? EMPTY_WORKSPACE_FILES;
  const parentDirectory = filesQuery.data?.parentDirectory ?? null;
  const canGoUp = parentDirectory !== null;
  const explorerEntries = useMemo<ExplorerEntry[]>(() => {
    if (!canGoUp) {
      return fileEntries;
    }
    return [
      {
        directory: parentDirectory ?? "",
        kind: "parent",
        name: "..",
        path: parentDirectory ?? "",
      },
      ...fileEntries,
    ];
  }, [canGoUp, fileEntries, parentDirectory]);
  const selectedFile = useMemo(
    () => fileEntries.find((file) => file.kind === "file" && file.path === selectedPath),
    [fileEntries, selectedPath],
  );
  const fileContentQueryKey = useMemo(
    () => workspaceFileContentQueryKey(workspacePath, selectedPath),
    [selectedPath, workspacePath],
  );
  const fileContentQuery = useQuery({
    enabled: Boolean(selectedPath),
    queryFn: () => getWorkspaceFileContent({ path: selectedPath ?? "", workspacePath }),
    queryKey: fileContentQueryKey,
    staleTime: 10_000,
  });
  const fileContent = fileContentQuery.data;
  const editorLanguage = fileContent?.language || languageFromPath(fileContent?.path ?? "");
  const canEditFile = Boolean(fileContent && !fileContent.binary && !fileContent.truncated);
  const isHtmlFile = (fileContent?.language ?? "") === "html";
  const isImageFile = Boolean(fileContent?.mimeType?.startsWith("image/"));
  const canRenderFile = isHtmlFile || isImageFile;
  const [renderableFileViewMode, setRenderableFileViewMode] = useState<"render" | "source">(
    "render",
  );
  useEffect(() => {
    setRenderableFileViewMode("render");
  }, [selectedPath]);
  const showRenderedFile =
    canRenderFile && renderableFileViewMode === "render" && !fileContent?.truncated;

  useEffect(() => {
    if (
      selectedPath &&
      fileEntries.some((file) => file.kind === "file" && file.path === selectedPath)
    ) {
      return;
    }

    const nextFile = fileEntries.find((file) => file.kind === "file");
    setSelectedPath(nextFile?.path ?? null);
  }, [fileEntries, selectedPath]);

  const selectEntry = useCallback((file: ExplorerEntry) => {
    hapticSelection();
    Keyboard.dismiss();
    if (file.kind === "parent") {
      setCurrentDirectory(file.path);
      setExplorerExpanded(true);
      setQuery("");
      return;
    }
    if (file.kind === "directory") {
      setCurrentDirectory(file.path);
      setExplorerExpanded(true);
      setQuery("");
      return;
    }
    setSelectedPath(file.path);
  }, []);

  const toggleExplorer = useCallback(() => {
    hapticSelection();
    setExplorerExpanded((value) => !value);
  }, []);

  const clearQuery = useCallback(() => {
    hapticSelection();
    setQuery("");
  }, []);

  const openEditor = useCallback(() => {
    if (!canEditFile || !selectedPath) {
      return;
    }
    hapticSelection();
    Keyboard.dismiss();
    router.push({
      pathname: "/workspace-file-editor",
      params: {
        path: selectedPath,
        workspacePath: workspacePath ?? "",
      },
    });
  }, [canEditFile, selectedPath, workspacePath]);

  const refreshPreview = useCallback(async () => {
    hapticSelection();
    setPullRefreshing(true);
    try {
      await Promise.all([
        filesQuery.refetch(),
        selectedPath ? fileContentQuery.refetch() : Promise.resolve(),
      ]);
    } finally {
      setPullRefreshing(false);
    }
  }, [fileContentQuery, filesQuery, selectedPath]);

  const renderFileEntry = useCallback(
    ({ item }: LegendListRenderItemProps<ExplorerEntry>) => (
      <FileEntryRow
        file={item}
        selected={item.kind === "file" && item.path === selectedPath}
        onSelect={selectEntry}
      />
    ),
    [selectedPath, selectEntry],
  );

  const isInitialLoading = filesQuery.isLoading && !filesQuery.data;
  const hasQuery = query.trim().length > 0;

  return (
    <ScrollView
      contentContainerStyle={styles.contentPaneContent}
      keyboardShouldPersistTaps="always"
      refreshControl={
        <RefreshControl
          colors={[theme.text]}
          progressBackgroundColor={theme.backgroundElement}
          refreshing={isPullRefreshing}
          tintColor={theme.text}
          onRefresh={() => void refreshPreview()}
        />
      }
      showsVerticalScrollIndicator
      style={styles.contentPane}
    >
      <View style={styles.fileListFrame}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isExplorerExpanded }}
          accessibilityLabel={
            isExplorerExpanded ? "Collapse file explorer" : "Expand file explorer"
          }
          onPress={toggleExplorer}
          style={({ pressed }) => [styles.fileListHeader, pressed && styles.pressed]}
        >
          <View style={styles.fileListTitleButton}>
            <ThemedText type="smallBold" style={styles.fileListTitle}>
              Explorer
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
              {currentDirectory || "Workspace root"}
            </ThemedText>
          </View>
          <View style={styles.fileCountBadge}>
            <ThemedText type="code" themeColor="textSecondary">
              {filesQuery.data ? explorerEntries.length : "—"}
            </ThemedText>
          </View>
          <View style={styles.explorerToggleButton}>
            <Icon
              name={isExplorerExpanded ? "expand" : "chevronRight"}
              size={15}
              tintColor={theme.textSecondary}
            />
          </View>
        </Pressable>
        {isExplorerExpanded ? (
          <View style={styles.explorerBody}>
            <View style={styles.searchBar}>
              <Icon name="search" size={15} tintColor={theme.textSecondary} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder="Filter current folder"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="search"
                style={styles.searchInput}
                value={query}
              />
              {hasQuery ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear file search"
                  hitSlop={8}
                  onPress={clearQuery}
                  style={({ pressed }) => [styles.searchClearButton, pressed && styles.pressed]}
                >
                  <Icon name="x" size={14} tintColor={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            {isInitialLoading ? (
              <View style={styles.fileListViewportFrame}>
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={theme.textSecondary} size="small" />
                  <ThemedText type="small" themeColor="textSecondary">
                    Loading files
                  </ThemedText>
                </View>
              </View>
            ) : filesQuery.error ? (
              <View style={styles.fileListViewportFrame}>
                <View style={styles.emptyState}>
                  <ThemedText type="smallBold">Unable to load files</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {errorMessage(filesQuery.error)}
                  </ThemedText>
                  <HeaderActionButton label="Retry" onPress={() => void filesQuery.refetch()} />
                </View>
              </View>
            ) : explorerEntries.length > 0 ? (
              <View style={styles.fileListViewportFrame}>
                <LegendList
                  contentContainerStyle={styles.fileListContent}
                  data={explorerEntries}
                  estimatedItemSize={FILE_ROW_ESTIMATED_SIZE}
                  getFixedItemSize={() => FILE_ROW_ESTIMATED_SIZE}
                  keyboardShouldPersistTaps="handled"
                  keyExtractor={fileEntryKeyExtractor}
                  nestedScrollEnabled
                  recycleItems={false}
                  renderItem={renderFileEntry}
                  showsVerticalScrollIndicator
                  style={styles.fileListViewport}
                />
              </View>
            ) : (
              <View style={styles.fileListViewportFrame}>
                <View style={styles.emptyState}>
                  <ThemedText type="smallBold">No files found</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Try another path or search term.
                  </ThemedText>
                </View>
              </View>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.editorFrame}>
        <View style={styles.editorHeader}>
          <View style={styles.editorTitleGroup}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.editorTitle}>
              {fileContent?.name ?? selectedFile?.name ?? "Select a file"}
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
              {fileContent?.path ?? selectedPath ?? "Workspace"}
            </ThemedText>
          </View>
          <View style={styles.editorActions}>
            {canRenderFile ? (
              <HeaderActionButton
                label={renderableFileViewMode === "render" ? "Source" : "Render"}
                selected={renderableFileViewMode === "source"}
                onPress={() =>
                  setRenderableFileViewMode((mode) => (mode === "render" ? "source" : "render"))
                }
              />
            ) : null}
            <HeaderActionButton disabled={!canEditFile} label="Edit" onPress={openEditor} />
          </View>
        </View>
        <View style={styles.editorMetaRow}>
          <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
            {fileContent ? fileMeta(fileContent) : "No file selected"}
          </ThemedText>
        </View>
        <View style={styles.editorPreviewContent}>
          {fileContentQuery.isLoading && selectedPath ? (
            <View style={styles.editorLoading}>
              <ActivityIndicator color={theme.textSecondary} size="small" />
              <ThemedText type="small" themeColor="textSecondary">
                Loading file
              </ThemedText>
            </View>
          ) : fileContentQuery.error ? (
            <View style={styles.emptyState}>
              <ThemedText type="smallBold">Unable to load file</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {errorMessage(fileContentQuery.error)}
              </ThemedText>
            </View>
          ) : fileContent && isImageFile && showRenderedFile ? (
            <WorkspaceFileContentView
              base64Content={fileContent.base64Content}
              content=""
              isImage
              mimeType={fileContent.mimeType}
              viewMode="render"
            />
          ) : fileContent && isHtmlFile && showRenderedFile ? (
            <WorkspaceFileContentView
              base64Content=""
              content={fileContent.content}
              isImage={false}
              mimeType={null}
              viewMode="render"
            />
          ) : fileContent?.binary ? (
            <View style={styles.emptyState}>
              <ThemedText type="smallBold">Binary file</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                This preview shows text files only.
              </ThemedText>
            </View>
          ) : fileContent ? (
            <>
              {fileContent.truncated ? (
                <View style={styles.notice}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Previewing the first {formatBytes(Math.min(fileContent.size, 256 * 1024))}.
                  </ThemedText>
                </View>
              ) : null}
              <WorkspaceCodeWebView
                key={`${selectedPath ?? "none"}:viewer:${fileContent.size}`}
                language={editorLanguage}
                mode="viewer"
                value={fileContent.content}
              />
            </>
          ) : (
            <View style={styles.emptyState}>
              <ThemedText type="smallBold">Select a file</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Search or pick a file to preview it here.
              </ThemedText>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
});

const FileEntryRow = memo(function FileEntryRow({
  file,
  selected,
  onSelect,
}: {
  file: ExplorerEntry;
  selected: boolean;
  onSelect: (file: ExplorerEntry) => void;
}) {
  const theme = useTheme();
  const handlePress = useCallback(() => onSelect(file), [file, onSelect]);
  const isParentEntry = file.kind === "parent";
  const isDirectory = file.kind === "directory";
  const iconName = isDirectory ? "folder" : "file";
  const accentColor = isParentEntry || isDirectory ? theme.accent : theme.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isParentEntry ? "Go to parent folder" : `Open ${file.path}`}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.filePill,
        isParentEntry && styles.parentFilePill,
        selected && styles.filePillSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.fileIconSlot}>
        {isParentEntry ? null : (
          <Icon name={iconName} size={15} tintColor={selected ? theme.text : accentColor} />
        )}
      </View>
      <View style={styles.fileRowTextGroup}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.fileRowName}>
          {file.name}
        </ThemedText>
      </View>
      <View
        style={[styles.fileKindBadge, (isParentEntry || isDirectory) && styles.folderKindBadge]}
      >
        <ThemedText
          type="code"
          style={[styles.fileKindText, (isParentEntry || isDirectory) && styles.folderKindText]}
          numberOfLines={1}
        >
          {isParentEntry ? "UP" : isDirectory ? "DIR" : fileExtensionLabel(file.path)}
        </ThemedText>
      </View>
      <View style={styles.fileChevronSlot}>
        {isDirectory ? <Icon name="chevronRight" size={13} tintColor={theme.accent} /> : null}
      </View>
    </Pressable>
  );
});

function HeaderActionButton({
  disabled,
  label,
  selected,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerActionButton,
        selected && styles.headerActionButtonSelected,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <ThemedText
        type="smallBold"
        style={[styles.headerActionText, selected && styles.headerActionTextSelected]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeout);
  }, [delayMs, value]);

  return debouncedValue;
}

function fileMeta(file: { language: string; size: number; truncated: boolean }) {
  return [file.language || "text", formatBytes(file.size), file.truncated ? "truncated" : ""]
    .filter(Boolean)
    .join(" / ");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function languageFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension || "text";
}

function fileExtensionLabel(path: string) {
  const name = path.split("/").pop() ?? path;
  const extension = name.includes(".") ? name.split(".").pop()?.toUpperCase() : "";
  return extension || "FILE";
}

function fileEntryKeyExtractor(file: ExplorerEntry) {
  return `${file.kind}:${file.path}`;
}

const styles = StyleSheet.create((theme) => ({
  contentPane: {
    flex: 1,
  },
  contentPaneContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  searchBar: {
    alignItems: "center",
    backgroundColor: theme.tintSoft,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.one,
    height: FILE_SEARCH_BAR_HEIGHT,
    paddingHorizontal: Spacing.two,
  },
  searchInput: {
    color: theme.text,
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    minHeight: 32,
    paddingVertical: 0,
  },
  searchClearButton: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 14,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  fileListFrame: {
    backgroundColor: theme.tintMuted,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.one,
    overflow: "hidden",
    padding: Spacing.two,
  },
  fileListHeader: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 6,
    flexDirection: "row",
    gap: Spacing.one,
    justifyContent: "space-between",
    marginHorizontal: -Spacing.one,
    marginTop: -Spacing.one,
    padding: Spacing.one,
  },
  fileListTitleButton: {
    borderCurve: "continuous",
    borderRadius: 6,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
  },
  fileListTitle: {
    fontSize: 13,
    lineHeight: 16,
  },
  fileCountBadge: {
    alignItems: "center",
    backgroundColor: theme.tintSoft,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    minWidth: 34,
    paddingHorizontal: Spacing.two,
  },
  fileListViewport: {
    flex: 1,
    minHeight: 0,
  },
  fileListViewportFrame: {
    height: FILE_LIST_VIEWPORT_HEIGHT,
    minHeight: 0,
  },
  fileListContent: {
    gap: FILE_ROW_GAP,
    paddingBottom: Spacing.one,
  },
  explorerBody: {
    height: FILE_EXPLORER_BODY_HEIGHT,
    gap: Spacing.one,
  },
  explorerToggleButton: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 13,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  filePill: {
    alignItems: "center",
    backgroundColor: theme.tintSubtle,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.one,
    height: FILE_ROW_HEIGHT,
    paddingHorizontal: Spacing.two,
  },
  filePillSelected: {
    backgroundColor: theme.accentMuted,
    borderColor: theme.accentBorder,
  },
  parentFilePill: {
    backgroundColor: theme.accentSoft,
  },
  fileRowTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  fileIconSlot: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center",
    width: 15,
  },
  fileRowName: {
    fontSize: 13,
    lineHeight: 16,
  },
  fileKindBadge: {
    alignItems: "center",
    backgroundColor: theme.tintSoft,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 5,
    borderWidth: 1,
    height: 20,
    justifyContent: "center",
    width: 38,
    paddingHorizontal: Spacing.one,
  },
  fileChevronSlot: {
    alignItems: "center",
    flexShrink: 0,
    justifyContent: "center",
    width: 13,
  },
  folderKindBadge: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorder,
  },
  fileKindText: {
    color: theme.textSecondary,
    fontSize: 10,
    lineHeight: 12,
  },
  folderKindText: {
    color: theme.accent,
  },
  editorFrame: {
    backgroundColor: theme.tintSubtle,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.two,
    overflow: "hidden",
    padding: Spacing.two,
  },
  editorHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: Spacing.two,
  },
  editorTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  editorTitle: {
    lineHeight: 19,
  },
  editorActions: {
    flexDirection: "row",
    flexShrink: 0,
    gap: Spacing.one,
  },
  headerActionButton: {
    alignItems: "center",
    backgroundColor: theme.tintSoft,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 7,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    minWidth: 58,
    paddingHorizontal: Spacing.two,
  },
  headerActionButtonSelected: {
    backgroundColor: theme.accentMuted,
    borderColor: theme.accentBorder,
  },
  headerActionText: {
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  headerActionTextSelected: {
    color: theme.text,
  },
  editorMetaRow: {
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    paddingBottom: Spacing.two,
  },
  editorPreviewContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  loadingRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: Spacing.two,
    justifyContent: "center",
  },
  editorLoading: {
    alignItems: "center",
    gap: Spacing.two,
    justifyContent: "center",
    minHeight: 160,
  },
  emptyState: {
    backgroundColor: theme.tintMuted,
    borderColor: theme.border,
    borderCurve: "continuous",
    borderRadius: 8,
    borderWidth: 1,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  notice: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorder,
    borderCurve: "continuous",
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.7,
  },
}));
