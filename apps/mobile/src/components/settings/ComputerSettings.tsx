import { useSelector } from "@legendapp/state/react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ThemedText } from "@/components/themed-text";
import {
  AppBottomSheet,
  AppBottomSheetTextInput,
  SheetActionRow,
} from "@/components/ui/bottom-sheet";
import {
  activateComputer,
  addComputerAddress,
  getActiveComputer,
  getComputerProfilesSnapshot,
  removeComputer,
  removeComputerAddress,
  replaceComputerAddress,
  renameComputer,
  setComputerConnectionMode,
  subscribeComputerProfiles,
  type ComputerProfile,
} from "@/lib/computer-profiles";
import { computerAddressType } from "@/lib/computer-addresses";
import { pairWithQrPayload } from "@/lib/codex-relay-api";
import { chatStore$ } from "@/state/chat-store";

type Editor = { kind: "name" | "address"; computer: ComputerProfile; previousAddress?: string };

export function ComputerSettings() {
  const snapshot = useSyncExternalStore(
    subscribeComputerProfiles,
    getComputerProfilesSnapshot,
    getComputerProfilesSnapshot,
  );
  const active = getActiveComputer();
  const connection = useSelector(() => chatStore$.connection.get());
  const [managedId, setManagedId] = useState<string>();
  const managed = snapshot.computers.find((c) => c.id === managedId);
  const [adding, setAdding] = useState(false);
  const [pairingLink, setPairingLink] = useState("");
  const [approvalCode, setApprovalCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [editor, setEditor] = useState<Editor>();
  const [value, setValue] = useState("");
  const [replaceId, setReplaceId] = useState<string>();
  const pending = useRef<AbortController | undefined>(undefined);
  const addingRef = useRef(false);

  function closePairing() {
    pending.current?.abort();
    pending.current = undefined;
    addingRef.current = false;
    setAdding(false);
    setCameraVisible(false);
    setBusy(false);
    setApprovalCode(undefined);
    setError(undefined);
    setPairingLink("");
    setReplaceId(undefined);
  }

  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );
  const pairRef = useRef(pair);
  pairRef.current = pair;
  useEffect(() => {
    if (!adding) return;
    const listener = CameraView.onModernBarcodeScanned((result) => {
      if (!addingRef.current || pending.current || result.type !== "qr") return;
      void CameraView.dismissScanner().catch(() => undefined);
      void pairRef.current(result.data);
    });
    return () => listener.remove();
  }, [adding]);

  function openPairing(replaceComputerId?: string) {
    setManagedId(undefined);
    setReplaceId(replaceComputerId);
    addingRef.current = true;
    setAdding(true);
  }

  async function pair(link: string) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(undefined);
    setCameraVisible(false);
    try {
      await pairWithQrPayload(link, {
        signal: controller.signal,
        replaceComputerId: replaceId,
        onApprovalCode: (code) => {
          if (!controller.signal.aborted) setApprovalCode(code);
        },
      });
      if (!controller.signal.aborted) closePairing();
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Pairing failed.");
        setBusy(false);
        setApprovalCode(undefined);
      }
    } finally {
      if (pending.current === controller) pending.current = undefined;
    }
  }

  async function scan() {
    const allowed = permission?.granted || (await requestPermission()).granted;
    if (!allowed) {
      setError("Allow camera access or paste the pairing link.");
      return;
    }
    if (CameraView.isModernBarcodeScannerAvailable) {
      try {
        await CameraView.launchScanner({ barcodeTypes: ["qr"] });
        return;
      } catch {}
    }
    setCameraVisible(true);
  }

  function attempt(action: () => void) {
    try {
      action();
      setError(undefined);
    } catch (caught) {
      Alert.alert(
        "Could not update computer",
        caught instanceof Error ? caught.message : "Try again.",
      );
    }
  }
  function edit(next: Editor, text = "") {
    setManagedId(undefined);
    setValue(text);
    setEditor(next);
  }
  function saveEdit() {
    if (!editor) return;
    attempt(() => {
      if (editor.kind === "name") renameComputer(editor.computer.id, value);
      else {
        if (editor.previousAddress)
          replaceComputerAddress(editor.computer.id, editor.previousAddress, value);
        else addComputerAddress(editor.computer.id, value);
      }
      setEditor(undefined);
      setManagedId(editor.computer.id);
    });
  }
  function confirmRemoval(computer: ComputerProfile) {
    Alert.alert(
      "Remove computer?",
      `Remove ${computer.name} and its pairing and local chat state from this phone? Tasks on the Mac keep running.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setManagedId(undefined);
            removeComputer(computer.id);
          },
        },
      ],
    );
  }

  return (
    <View style={styles.section}>
      <ThemedText type="small" themeColor="textSecondary">
        Computers
      </ThemedText>
      <View style={styles.panel}>
        {snapshot.computers.map((computer) => {
          const selected = computer.id === active?.id;
          return (
            <View key={computer.id} style={[styles.computer, selected && styles.selected]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Use ${computer.name}`}
                onPress={() => activateComputer(computer.id)}
                style={styles.copy}
              >
                <ThemedText type="smallBold" numberOfLines={1}>
                  {computer.name}
                </ThemedText>
                <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                  {computer.activeUrl}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {selected ? connection.toUpperCase() : "SAVED"}
                  {selected
                    ? ` · ${computer.connectionMode === "auto" ? "Automatic" : "Fixed address"}`
                    : ""}
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Manage ${computer.name}`}
                onPress={() => setManagedId(computer.id)}
                style={styles.button}
              >
                <ThemedText type="smallBold">Manage</ThemedText>
              </Pressable>
            </View>
          );
        })}
        <SheetActionRow
          icon="newChat"
          title="Add computer"
          accessibilityLabel="Add computer"
          subtitle="Scan a QR code or paste a pairing link"
          onPress={() => openPairing()}
        />
      </View>

      <AppBottomSheet
        visible={!!managed}
        title={managed?.name ?? "Computer"}
        onClose={() => setManagedId(undefined)}
      >
        {managed ? (
          <>
            {managed.id !== active?.id ? (
              <SheetActionRow
                icon="check"
                title="Use this computer"
                accessibilityLabel="Use this computer"
                onPress={() => {
                  activateComputer(managed.id);
                  setManagedId(undefined);
                }}
              />
            ) : null}
            <SheetActionRow
              icon="refresh"
              title="Automatic address selection"
              subtitle="LAN first, then Tailscale, then public"
              selected={managed.connectionMode === "auto"}
              accessibilityLabel="Use automatic address selection"
              onPress={() => setComputerConnectionMode(managed.id, "auto")}
            />
            {managed.addresses.map((address) => (
              <View key={address}>
                <SheetActionRow
                  icon="web"
                  title={`${computerAddressType(address)} address`}
                  subtitle={address}
                  subtitleNumberOfLines={2}
                  selected={managed.activeUrl === address}
                  accessibilityLabel={`Use fixed address ${address}`}
                  onPress={() => setComputerConnectionMode(managed.id, "manual", address)}
                />
                <View style={styles.addressActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${address}`}
                    onPress={() =>
                      edit(
                        { kind: "address", computer: managed, previousAddress: address },
                        address,
                      )
                    }
                  >
                    <ThemedText type="small">Edit</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${address}`}
                    onPress={() => attempt(() => removeComputerAddress(managed.id, address))}
                  >
                    <ThemedText type="small" themeColor="textSecondary">
                      Remove
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
            <SheetActionRow
              icon="newChat"
              title="Add address"
              accessibilityLabel="Add server address"
              onPress={() => edit({ kind: "address", computer: managed })}
            />
            <SheetActionRow
              icon="newChat"
              title="Rename"
              accessibilityLabel="Rename computer"
              onPress={() => edit({ kind: "name", computer: managed }, managed.name)}
            />
            {!managed.serverPublicKey ? (
              <SheetActionRow
                icon="refresh"
                title="Pair again"
                subtitle="Replace this migrated pairing after approval"
                accessibilityLabel="Replace migrated pairing"
                onPress={() => openPairing(managed.id)}
              />
            ) : null}
            <SheetActionRow
              icon="archive"
              title="Remove computer"
              accessibilityLabel="Remove computer"
              onPress={() => confirmRemoval(managed)}
            />
          </>
        ) : null}
      </AppBottomSheet>

      <AppBottomSheet
        visible={!!editor}
        title={editor?.kind === "name" ? "Rename computer" : "Server address"}
        onClose={() => {
          setEditor(undefined);
          setManagedId(editor?.computer.id);
        }}
      >
        <AppBottomSheetTextInput
          value={value}
          onChangeText={setValue}
          style={styles.input}
          accessibilityLabel={editor?.kind === "name" ? "Computer name" : "Server URL"}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={editor?.kind === "name" ? "Computer name" : "https://host.example.com:18787"}
          placeholderTextColor="#888"
        />
        <SheetActionRow
          icon="check"
          title="Save"
          accessibilityLabel="Save computer changes"
          onPress={saveEdit}
        />
      </AppBottomSheet>

      <AppBottomSheet visible={adding} title="Add computer" onClose={closePairing}>
        {approvalCode ? (
          <View style={styles.approval}>
            <ThemedText type="small">Approve this code on the Mac you are adding:</ThemedText>
            <ThemedText type="code">{approvalCode}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Waiting for approval. Your current pairing is kept until this succeeds.
            </ThemedText>
          </View>
        ) : (
          <>
            <AppBottomSheetTextInput
              value={pairingLink}
              onChangeText={setPairingLink}
              style={styles.input}
              accessibilityLabel="Pairing link"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              placeholder="codex-relay://pair..."
              placeholderTextColor="#888"
            />
            <SheetActionRow
              icon="check"
              title={busy ? "Connecting…" : "Pair using link"}
              accessibilityLabel="Pair using link"
              disabled={busy || !pairingLink.trim()}
              onPress={() => void pair(pairingLink)}
            />
            <SheetActionRow
              icon="attach"
              title="Scan QR code"
              accessibilityLabel="Scan computer QR code"
              disabled={busy}
              onPress={() => void scan()}
            />
            {cameraVisible ? (
              <CameraView
                style={styles.camera}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => {
                  if (!pending.current) void pair(data);
                }}
              />
            ) : null}
          </>
        )}
        {error ? (
          <ThemedText type="small" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}
        <SheetActionRow
          icon="back"
          title="Cancel"
          accessibilityLabel="Cancel pairing"
          onPress={closePairing}
        />
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  panel: {
    backgroundColor: "#1C1C1E",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#303032",
    padding: 12,
    gap: 10,
  },
  computer: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 12, gap: 10 },
  selected: {
    backgroundColor: "rgba(44,163,111,0.10)",
    borderColor: "rgba(44,163,111,0.4)",
    borderWidth: 1,
  },
  copy: { flex: 1, gap: 5 },
  button: { padding: 10 },
  addressActions: { flexDirection: "row", gap: 24, paddingLeft: 54, paddingBottom: 12 },
  input: {
    color: "#fff",
    backgroundColor: "#222",
    borderRadius: 10,
    padding: 14,
    marginVertical: 12,
    fontSize: 15,
  },
  approval: { gap: 16, paddingVertical: 16 },
  camera: { height: 240, borderRadius: 12, overflow: "hidden" },
  error: { color: "#FF9F8A", padding: 12 },
});
