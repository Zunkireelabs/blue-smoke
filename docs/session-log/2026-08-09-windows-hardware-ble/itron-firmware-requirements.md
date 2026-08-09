# Firmware requirements — Blue Smoke secure BLE lock (for itron)

*Draft for the itron message. Pairs with our technical spec §4 (the byte-level GATT contract),
which will be attached in full. This page is the plain-language summary of what the firmware must
do, the questions the two-chip board raises, and the documents/answers we need to proceed.*

**Board in question:** HQD PLUS PMTA device — application MCU **PY32C642F / PY32F002B (QFN20)** +
Bluetooth SoC **YC1012_JD**. (Please confirm the schematic `HQD-H040BT-MAIN-V1.02` matches the
`H158` firmware/board we were sent — the names differ.)

---

## 0. Context in one paragraph

We build the mobile app and the cloud backend. The device's **unlock is gated by our server**: the
phone only unlocks the device after our backend confirms the user is age-verified and owns the
device, by issuing a short-lived session key. For that to work, the device firmware must implement
a small cryptographic contract over BLE (our spec §4). The current stock firmware (6-digit pairing
PIN + read-info/set-state) does not implement it. We are asking itron to build a firmware that does.
**We do not write firmware; we need itron to implement §4 to spec.**

---

## 1. The three non-negotiables (everything else is negotiable detail)

1. **The device must lock itself in firmware — a dead-man timer.** When the authenticated phone
   goes out of range / stops sending keepalives, the device auto-locks on its own, with NO
   dependence on the app being alive. This is the core child-safety property. A design where the
   app must send a "lock" command to lock is not acceptable.
2. **Unlock requires a valid, server-issued session.** The device must only unlock after a
   successful cryptographic handshake proving possession of a session key that our server derived
   from the device's root key. A local pairing PIN is not sufficient authority.
3. **The device root key `K_dev` never leaves the device.** It is burned into OTP at manufacture
   and used only on-chip to derive session keys. It is never transmitted over BLE or UART off-board.

---

## 2. What the firmware must implement (summary of spec §4 — full byte layout attached)

- **Advertising + custom GATT** on the YC1012: our service UUID `42530001-1E5B-4A9C-9D3F-7C6E1B2A5D80`
  with the characteristics defined in §4.2 — device info (read), lock state (read + **notify**),
  lock command (write), command result (read + **notify**), and the auth challenge/response
  characteristics. Frames are ≤20 bytes to fit the default ATT MTU.
- **Authentication handshake (§4.5):** device issues a random challenge `N`; the phone returns a
  CMAC proof computed with the session key; device re-derives the session key from `K_dev` and the
  handshake parameters, recomputes the CMAC, and compares in constant time. Session opens only on a
  match. Two-frame `authResponse`, each tagged with a frame index (§4.5 / F12).
- **Session key derivation (§4.5):** `K_sess = HKDF-SHA256(K_dev, …)` using only values present on
  the device + sent in the handshake (details in §4.5). AES-128 / CMAC / HKDF-SHA256 primitives.
- **Lock commands (§4.6):** LOCK, UNLOCK, ACTIVATE (first-time provisioning), SET_AUTOLOCK_GRACE
  (clamped 1000–30000 ms), END_SESSION, FACTORY_UNPAIR, PING (keepalive that refreshes the
  dead-man timer). Each authenticated; replay-protected by a per-session counter and the challenge.
- **Result codes (§4.7):** distinct codes for OK / unauthenticated / auth-failed / replay /
  not-activated / session-expired / invalid-param / busy / fault / rate-limited.
- **Behavioural requirements (§4.8):** auth-failure backoff/rate-limiting, monotonic session
  expiry, replay resistance, and the framing rules for the handshake. Acceptance tests in §4.10.

The exact UUIDs, byte offsets, command IDs and result codes are all fixed in the attached §4 —
please implement them verbatim; do not substitute values.

---

## 3. Architecture questions this two-chip board raises (please answer)

The schematic shows BLE runs on the **YC1012**, driven by the **PY32** over a UART (HCI-H5 / AT).
Our spec assumed a single firmware; this split raises questions only itron (and possibly Yichip)
can answer:

1. **Can the YC1012 expose our fully custom GATT** — our 128-bit service UUID and the characteristics
   above, with read/write/**notify** and 20-byte payloads — or is it limited to a fixed vendor
   profile / AT command set? **This is the make-or-break question.** If the YC1012 cannot host
   arbitrary GATT, we need to know now.
2. **Where does the crypto run** — the YC1012's hardware AES128, or AES-CMAC/HKDF in software on the
   PY32? (PY32 has 24 KB flash / 3 KB SRAM — is that enough alongside the app?)
3. **Which chip's OTP holds `K_dev`** — the PY32 (128 B OTP) or the YC1012 (8 KB OTP)?
4. **Which chip runs the auto-lock dead-man timer?** It must be the always-on application MCU
   (PY32), not the radio, so it survives BLE disconnect.
5. **What exactly is the PY32↔YC1012 UART protocol** in the shipping design — HCI-H5, or the AT
   command mode noted on the schematic? Is the handshake data crossing that UART in plaintext?

---

## 4. Documents / answers we still need

- **YC1012 AT/HCI command manual** — decides whether §4's custom GATT is implementable on the radio.
- **PY32C642 datasheet/reference manual** — to reconcile with the PY32F002B (near-equivalent, but
  confirm), and for the exact OTP / read-protection behaviour.
- **Confirmation the `HQD-H040BT-MAIN-V1.02` schematic matches the delivered `H158` board.**
- **Key provisioning (our OQ-4):** who burns a unique `K_dev` into OTP on the production line
  (using this PowerWriter/PW200 flow), and how is the per-device key manifest delivered to us
  securely?
- **Device serial / salt (our OQ-12):** what on-device value identifies the unit (e.g. the serial
  written near end-of-flash), so our backend can match it. We will share the exact hashing scheme.
- Firmware **update/ownership process**: will itron deliver signed `.pkg` builds we can flash via
  PowerWriter for integration testing?

---

## 5. How we'd like to work it

- **A §4 review call** with itron's firmware engineer, to walk the spec and hear objections while
  changes are cheap. Two specific items for that call: the exact **CMAC proof byte order** (we can
  only verify it against real firmware), and desired **behaviour on a protocol-version mismatch**.
- **Iterate by file transfer:** the board is reflashable with PowerWriter and we have a PW200, so
  itron can email us test `.pkg` builds and we flash them here — no shipping round-trips needed.
- **Timeline:** sample hardware ~Day 26, joint integration Days 25–29. Because firmware is now on
  the critical path (and depends on the YC1012 question above), we'd like to start the review this
  week rather than wait for hardware.

---

*Attach: technical spec §4 (BLE GATT interface) + §5.4 (issue-device-session) for the server side of
the key derivation.*
