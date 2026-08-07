# Mock BLE peripheral — P0-2.5

A pure-Node, three-layer simulation of the §4 firmware contract. It exists so
Phases 1 and 3 can be built and tested before real hardware exists (§11.1),
and so hardware integration is *confirmation* instead of *discovery*. It is
**not** a client deliverable and never ships in the app — it lives in
`tools/`, never `src/`, and is not a runtime dependency.

## What's here

```
deviceCore.ts     Layer 1 — pure §4 semantics. No I/O, no sockets, no real timers.
bleAdapter.ts      Layer 2 — a fake react-native-ble-plx surface, backed by deviceCore.
crypto.ts          AES-128-CMAC (RFC 4493) + HKDF-SHA256. Not shared with app-side code.
clock.ts           Injectable monotonic clock (Clock / FakeClock).
byteLayout.ts       Little-endian read/write helpers for the §4 fixed-offset layouts.
__tests__/         Jest suites, plus harness.ts (test-only frame builders).
```

Layer 3 (a real radio bridge) was scoped as a time-boxed spike, not a build —
see "Layer 3" below for why it wasn't attempted on this machine at all.

## Running it

```powershell
npm ci                                              # once, if node_modules is missing
npx jest -c tools/mock-peripheral/jest.config.js    # this package only
npm test                                            # everything, including the RN app suite
npm run typecheck                                   # tsc --noEmit, both projects
npm run lint
```

`tools/mock-peripheral` has its **own** `jest.config.js`, `babel.config.js`,
and `tsconfig.json` — deliberately not the repo's root ones. The RN Jest
preset assumes a React Native runtime (haste, RN-specific mocks) and fights
plain Node test files; the root `tsconfig.json`'s `"types": ["jest"]`
excludes `@types/node`'s ambient globals (`Buffer`, `node:crypto`, …), which
this package needs. The root `tsconfig.json` excludes
`tools/mock-peripheral/**` so the two configs never fight each other, and
root `jest.config.js` runs both as separate Jest **projects**.

## Using it in app code (P1-4.0 / P3-2.0 / P3-3.0)

```ts
import { createMockPeripheral } from '../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../tools/mock-peripheral/clock';

const { manager, device, core } = createMockPeripheral({
  kDev: Buffer.alloc(16, 0x11), // stand-in server-issued K_dev for this test
  clock: new FakeClock(0),
  provisioningState: ProvisioningState.ACTIVATED,
});

// `manager` implements the slice of BleManager the app uses:
// state(), startDeviceScan(), connectToDevice(), isDeviceConnected(),
// cancelDeviceConnection(). `device` (and whatever connectToDevice()
// resolves to) implements discoverAllServicesAndCharacteristics(),
// read/writeCharacteristicWithResponseForService() (base64 in/out, exactly
// like the real library), monitorCharacteristicForService(), readRSSI(),
// onDisconnected(). `core` is the underlying DeviceCore, for direct
// assertions and for driving time via `clock.advanceMs()` + `core.tick()`.
```

`device.setScriptedRssi([...])` / the `rssiSeries` option feeds a scripted
dBm series to `readRSSI()`, in order, holding the last value once exhausted —
for testing §7.2 hysteresis (median-of-5, −85 dBm/3 samples to lock,
−75 dBm/2 samples to unlock). **The mock does not implement that hysteresis
algorithm itself** — that's `src/features/ble/proximity.ts`, P3-3.0's task —
it only guarantees the feed arrives in the scripted order.

`device.simulateAbruptDisconnect()` models a link-supervision-timeout-style
loss (no `cancelConnection()` call) — this is what exercises firmware
obligation F2 ("on BLE disconnect, any cause").

## Failure injection (brief §3.3)

All on `DeviceCore` (reachable through `core` from `createMockPeripheral`):

| Item | How |
|---|---|
| `AUTH_FAILED` (handshake) | `core.forceNextHandshakeResult('AUTH_FAILED')`, or just send a wrong proof |
| `RATE_LIMITED` | `core.forceNextHandshakeResult('RATE_LIMITED')`, or trigger 5/10 real consecutive auth failures |
| `REPLAY` | send a `lockCommand` with `counter <= lastAcceptedCounter` |
| `SESSION_EXPIRED` | let `sessionExpiryUptimeMs` pass, then send any command |
| `NOT_ACTIVATED` | `UNLOCK` before `ACTIVATE` |
| `INVALID_PARAM` | `SET_AUTOLOCK_GRACE` outside 1000–30000ms, or a bad `FACTORY_UNPAIR` confirm |
| `BUSY` | `core.forceNextCommandResult(ResultCode.BUSY)` — **no natural trigger exists**; this mock is single-threaded and processes commands atomically, so nothing ever arrives "mid-processing" |
| `FAULT` | `core.injectFault({ recoverable: boolean })` |
| Abrupt disconnect | `device.simulateAbruptDisconnect()` |
| Dead-man expiry | disconnect + advance the clock past `autoLockGraceMs`, or `core.forceDeadManExpiry()` for an immediate one |
| Low battery | `core.setBatteryPercent(n)`, or configure `batteryDrainPercentPerHour` and advance the clock |
| Scripted RSSI | `device.setScriptedRssi([...])` / the `rssiSeries` constructor option |

## Determinism

No real timers anywhere — `setTimeout`/`setInterval` do not appear in this
package. Every time-dependent behaviour reads through an injected `Clock`.
Tests use `FakeClock`, which only advances when `advanceMs()`/`setMs()` is
called. `DeviceCore` re-evaluates every time-driven transition (nonce TTL,
dead-man countdown, backoff window, session expiry, battery drain) lazily at
the top of every `read()`/`write()`/`connect()`/`disconnect()`, and `tick()`
is available to force that evaluation explicitly without any other operation.

## Layer 3 — radio bridge spike: not attempted here

Brief §3.4 scopes Layer 3 as a ~90-minute spike: a thin Swift
`CBPeripheralManager` CLI over a local socket, macOS + Xcode required, a
physical phone required (the simulator has no BLE radio). **This machine is
Windows** (confirmed via `uname -s` → `MINGW64_NT-...`), not macOS — there is
no Xcode, no Swift toolchain, and no way to run `CBPeripheralManager` here at
all. Zero minutes of the ~90-minute timebox were spent; this isn't a partial
result, it's a hard platform block. The spike needs to be run from a macOS
machine with a physical iOS device before **M6 (Day 25)**, or proximity and
background BLE ship having only ever been tested against Layers 1–2.

## What this mock does NOT prove

Layers 1–2 prove **"our §4 logic is right"** — not **"BLE works."** An
in-process mock does not exercise `react-native-ble-plx` itself, the
iOS/Android BLE stack, LESC bonding, connection-parameter negotiation,
advertising, or background execution. It cannot be validated against real
firmware either: the client-supplied hardware runs stock firmware that does
not speak §4 (docs/TECHNICAL_SPEC.md §1.3 context) — this mock is derived
from §4 and RFC 4493 test vectors, not cross-checked against any reference
implementation. §4 itself is still unreviewed by the firmware team (OQ-6) and
may change.

Also out of this mock's scope by construction, not tested:

- **F9 (one bond at a time)** — this package only ever instantiates one
  `DeviceCore`/`MockDevice` per test; multi-bond rejection has no surface to
  exercise here.
- **F10 (no PII storage)** — trivially true (`DeviceCore` has no field
  capable of holding a name/DOB/email/biometric), verified by inspection,
  not a behavioural test.

## Interpretations of ambiguous §4 text

§4 has never been reviewed by the firmware team (OQ-6). Six judgement calls
made while implementing it are documented in the module doc comment at the
top of `deviceCore.ts` rather than guessed silently — read that before
assuming any of the following is normative:

1. RESOLVED by §4.5 (v1.4) F12. `authResponse`'s two frames now carry
   `frameIndex` in byte 0, so the mock identifies a frame from that byte —
   never from write order or a position cursor. `writeAuthResponseFrame(bytes)`
   is the explicit test hook: tests can pass any `frameIndex` value, including
   a repeated or out-of-order one, to exercise F12's reset path directly. A
   framing reset (an unexpected `frameIndex`) writes no `commandResult`, does
   not touch the F6 failure counter, and does not invalidate the connection
   nonce `N` — see `deviceCore.handshake.test.ts` (FW-19/FW-20 analogues).
2. Handshake failures write `commandResult.commandId = 0x00` — a sentinel
   unused by any real command — since §4.5 says a mismatch "writes
   AUTH_FAILED to commandResult" but no command was actually involved.
3. §4.8 F6's backoff counter is shared between handshake failures **and**
   bad-tag/replayed commands (per §4.6's firmware rules table), but backoff
   itself only blocks the next handshake attempt, not an already-open
   session's commands. Narrowed by §4.5 (v1.4) F12: a framing reset is
   explicitly not an auth failure, so it never touches this counter.
4. `SESSION_EXPIRED` (the `commandResult` code) fires once, on the first
   command attempt after expiry; subsequent attempts get ordinary
   `UNAUTHENTICATED`. The passive lock-on-expiry (F5) always updates
   `lastLockReason`, independent of this.
5. A malformed `FACTORY_UNPAIR` confirm is `INVALID_PARAM`, by analogy with
   `SET_AUTOLOCK_GRACE`'s explicit rule — §4.6 doesn't say so directly.
6. Re-`ACTIVATE`ing an already-activated device is `INVALID_PARAM` — §4.6
   says "first-time only" without specifying the repeat-attempt error.
