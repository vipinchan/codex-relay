// Unistyles must be configured before expo-router evaluates any route module.
//
// In release builds expo-router eagerly loads every layout through
// `require.context` while building the route tree. `./(drawer)/_layout.tsx`
// sorts before `./_layout.tsx`, so it is evaluated first — and it imports
// components whose module-scope `StyleSheet.create((theme) => ...)` resolves the
// theme immediately (Unistyles resolves themes eagerly in `create`). Without an
// explicit entry point the root layout, which is what calls
// `StyleSheet.configure`, has not run yet, so the app aborts during startup.
//
// Importing the Unistyles setup here guarantees the theme is registered before
// the router touches any route module, in dev and release alike.
import "./src/lib/unistyles";

import "expo-router/entry";
