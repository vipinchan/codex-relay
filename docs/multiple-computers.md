# Multiple computers and server addresses

In the mobile app, open **Settings > Computers** to add a Mac, switch the active
computer, rename an entry, or remove a saved pairing. Each Mac runs its own Relay
server and has its own pairing approval.

Pair a new Mac using its Relay QR code or the complete `codex-relay://pair...`
link. Approve the code on that Mac. The current pairing stays saved while the
new pairing is pending; cancelling or failing to pair leaves it intact.

The app connects to one computer at a time. Switching keeps the other computer's
pairing, draft, selected conversation, pinned threads, and workspace state.
Already submitted work keeps running on that Mac. Switch back to refresh its
progress without pairing again.

## LAN and public addresses

Choose **Manage > Add address** to save another complete address for the same
Relay instance. The scheme and port may differ:

```text
LAN:    http://192.168.1.20:8787
Public: https://mac-a.example.com
```

A forwarded public port such as `http://example.com:18787` is also supported.
Configure its network forwarding separately so it reaches the same Relay
instance as the LAN address. Adding an address in the app does not set up
port forwarding, a public server, or a tunnel. Do not use `0.0.0.0` as a mobile
connection address.

**Automatic address selection** tries LAN addresses, then Tailscale, then public
addresses. Within each group it prefers the last working address. The app keeps
a healthy connection; it selects again when a connection must be established.
Alternatively, tap an address to fix the connection to that address, with no
automatic fallback.

Changing an address uses the saved pairing and encryption counters. It does not
create another computer or reset its conversations. On a lost connection, the
app reconnects and refreshes state; it does not automatically repeat a message
or command whose outcome is uncertain.

## Migration, removal, and notifications

An existing single-computer pairing migrates automatically. No new approval is
required. A migrated entry without saved identity metadata can be replaced using
**Manage > Pair again**, after approving the new pairing on the Mac.

Removing a computer deletes its pairing and local state from this phone. It does
not stop its Relay, cancel tasks, or sign out other phones. The app does not
automatically connect another computer after removing the active one.

Notification preferences belong to each computer. Existing Relay notifications
do not identify their source computer. Once multiple computers have been saved,
tapping these notifications opens the app without selecting a conversation,
including after an entry is removed. Select the intended computer in Settings.

Computer pairing data stays on this phone; it is not synchronized across phones.
Each Mac keeps its own code, Codex login, and conversations.
