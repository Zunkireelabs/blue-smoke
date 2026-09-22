# BLE reconnect — current behaviour, recorded before any change

**Date:** 2026-09-22 · **Build audited:** `2413a08` (`stage`), the APK the manufacturer tested
**Why this file exists:** the manufacturer's 10-device test found no auto-reconnect after an
out-of-range drop. This records what the code does **today**, line by line, so that if a fix
regresses something we can tell what we changed it *from*. Written from reading the code, not
from memory.

---

## What works (their words, and the code agrees)

Connect, lock and unlock across 10 units. The H158 transport, framing, checksums and the
`CHILD_LOCK` / `TERMINAL_INFO` command path are sound. **Nothing below is a protocol defect.**

---

## The current flow, end to end

### 1. First pair
`HomeScreen` "+ Pair a device" → `H158Gate` (permission check) → `H158Pair` (scan by
`namePrefix`, user taps a result) → `connectAndRememberH158Device()`.

### 2. On a successful connect — `connectAndRememberH158Device.ts`
1. `connectH158Session()` → `manager.connectToDevice(deviceId)`, then discover, then subscribe
   to `FFF1`. Each stage has its own timeout (connect 10 s, discover 5 s, subscribe 3 s).
2. `setH158Connected()` — adds an entry to `useH158ConnectionStore.connections`, keyed by device
   id, with `locked`/`batteryPercent`/`lowBattery` deliberately reset to `null`.
3. `outcome.device.onDisconnected?.(() => setH158Disconnected(deviceId))` — registers the drop
   listener.
4. `addPairedH158Device()` — persists `{id, name, lastConnectedAt}` to AsyncStorage under
   `h158.pairedDevices.v1`.
5. Fire-and-forget `readStatus()` → populates lock + battery from the device's own reply.

### 3. On an out-of-range drop — **this is the defect**
- The drop **is** detected. `onDisconnected` fires → `setH158Disconnected(deviceId)` **deletes**
  the entry from the connection store.
- Home re-renders: the row falls back to its remembered-but-not-connected form — no green dot,
  no lock glyph, no battery, and a "Last connected Xm ago" line plus a `Connect ›` affordance.
- **And then nothing happens. Ever.** There is no retry, no backoff, no re-arm, no rescan, no
  timer. The app has no code path that attempts a connection without a user tap.

### 4. The only ways back to connected — all require a human
- Tap the row on Home → `handleConnectPress` → `H158HomeConnectAgent` →
  `connectAndRememberH158Device(manager, deviceId, name)`. **This dials the stored id directly —
  no scan.** (So "the APP needs to re-search" is only true via the paths below; the row tap is
  already a direct reconnect. They may be on the `+` path, or an older build.)
- Tap `Connect ›` — same handler, same tap target.
- `+ Pair a device` → `H158Gate` → `H158Pair` → a full scan.

---

## Root cause, stated plainly

**There is no reconnect mechanism, only a connect action.** Four contributing facts:

1. **`connectToDevice()` takes no options.** `BleManagerLike.connectToDevice(deviceId: string)`
   (`BleClientContext.tsx:90`) has no `autoConnect` parameter, so `react-native-ble-plx`'s
   `autoConnect: true` — the Android primitive that makes the OS wait for a device to reappear —
   is **never passed**. The signature would have to widen before it could be.
2. **The 10 s connect timeout cancels iOS's own reconnect primitive.** On iOS a pending
   `connect` is exactly the "connect whenever you see it" behaviour we want; `withTimeout(...,
   CONNECT_TIMEOUT_MS, 'connect')` in `h158Session.ts` races it and abandons it after 10 s.
   Worse, the race **does not** call `cancelDeviceConnection`, so the native pending connect is
   left dangling with nothing tracking it.
3. 🔴 **The reconnect machinery exists, and is wired to the wrong transport.**
   `appState.ts` has `reconcileConnections()` — foreground repair that re-dials links which died
   while suspended — and `connection.ts` has a full `ConnectionManager`. **Both are §4 code.**
   `connection.ts` is imported by nothing outside its own tests and one *type-only* import in
   `appState.ts`. `createAppStateCoordinator` is used in exactly one place,
   `PairDeviceScreen.tsx` — the §4 scan screen, not the H158 chain. So the policy is written,
   tested, and dead for the hardware we actually ship.
4. **`proximity.ts` is a stub** — `createProximityMonitor()` throws `new Error('P3-3.0')`.
   Nothing observes range at all.

Also true, and relevant:
- **No background BLE.** Backgrounded or killed, nothing reconnects.
- **No foreground repair on the H158 path.** Home re-reads the *remembered* list and the
  Bluetooth adapter state on focus/foreground, but never re-dials a dropped device.
- **The device never volunteers anything** (manufacturer reply item 13: no unsolicited
  notifications), so no state change can arrive from the device side.

---

## What is already correct, and must not regress

- **Drop detection works.** `onDisconnected` → store eviction → UI truthfully shows disconnected.
- **The stored handle is the stable per-unit id**, not the name. This matters, because every unit
  advertises the identical bare name `YP65-AT` (OQ-17, measured on two units) — a name-keyed
  store could not target a specific device. Reconnect-by-id is therefore possible in principle.
- **State is re-read on reconnect, never restored.** `setH158Connected` resets `locked` /
  `batteryPercent` / `lowBattery` to `null`, and `connectAndRememberH158Device` issues a fresh
  `readStatus()`. This satisfies CLAUDE.md's "notification-driven, never optimistic" rule, and
  **any auto-reconnect must keep doing this** — restoring a remembered lock state across a drop
  would risk rendering "unlocked" on a locked device.
- **Multi-device is already modelled.** `connections` is a map; `H158_MAX_CONCURRENT_CONNECTIONS`
  is 3.
- **Android 12+ `BLUETOOTH_CONNECT` is requested before the dial** (`H158HomeConnectAgent`,
  fixed 2026-08-31). A silent auto-reconnect must not regress this — without the permission it
  fails invisibly.

---

## The open question the code cannot answer

Their phrase *"after activating the Bluetooth of the device"* suggests the unit may **stop
advertising** once idle or long out of range. If it isn't broadcasting, no reconnect logic on any
phone can find it — AirPods only reconnect because they advertise the moment the case opens.

**This must be settled by measurement, not assumption:** take a paired unit out of range, leave
it, bring it back, and scan — does it appear on its own, or only after physical interaction?
Until that's known, the split between "our app never tries" and "the device isn't there to be
found" is unresolved, and the answer may be both.
