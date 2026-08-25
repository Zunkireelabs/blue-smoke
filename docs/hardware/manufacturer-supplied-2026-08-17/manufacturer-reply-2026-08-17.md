# Manufacturer reply — BLE connection questions, received 2026-08-17

English text only, de-duplicated from the sender's bilingual (EN/ZH) formatting. Answers to the
18-item question set sent 2026-08-12/13 (`../client-questions-2026-08-09.md` /
`../manufacturer-questions-ble-connection-2026-08-12.md`). Otherwise unedited — see
`MANIFEST.md` for what this settles and what the accompanying `itronlib` SDK adds beyond it.

---

## Top 3 — these block us completely

**1. Which of the five FFF1–FFF5 channels does your firmware use for lock/unlock/status?**

> On mobile terminals, instructions can be issued via the FFF1 channel, and the H158 device
> transmits back data through the FFF1 channel.

**2. What does the device send back for Read Status (`02 01 A2 A1 01`)? Actual bytes, locked and unlocked.**

> When the mobile APP sends the "Read Status" command (`02 01 A2 A1 01`), the device will return
> `02 05 A2 00 30/31 00 ## ** 01`.
>
> `##` denotes the current device battery percentage, value range `0x00`–`0x64`.
> `**` denotes the checksum of the current command.
>
> Refer to *H158 Protocol-202608131414*.

**3. Is there a 6-digit pairing PIN? Your protocol doc describes one; the YP65-AT module spec has none.**

> 6-digit numeric pairing password is not supported at present. The device only supports the
> just-work unencrypted mode via AT commands. Our instruction document refers to
> *YP65-AT-BLE-module-spec-v1.3-release*.

## Finding the device

**4. What exact Bluetooth name does the product advertise?**

> The Bluetooth name of the device can be set via the AT+NAME command; however, all devices will
> have the same Bluetooth name.

**5. Does the device advertise the FFF0 service UUID, or only its name?**

> FFF1 to FFF5 are five sub-service UUIDs of FFF0.

**6. We have never seen a device advertise (40-minute scan, 10 August, board on USB power, button pressed). What should we expect to see, and what are the most common reasons a device would not advertise?**

> The PW200 is required to upgrade the firmware of PY32C642. The blue LED will flash when the key
> is pressed once.
>
> The device with the name (YP65-AT) shall be detectable when the device is in working state.
>
> When the H158 device is in sleep mode, Bluetooth advertising is disabled. Upon initial battery
> power-on, Bluetooth advertising needs to be activated by a single key press.

## Connecting

**7. Does your firmware keep Bluetooth advertising switched on at all times?**

> 1. No. Bluetooth advertising is enabled only when the key is pressed.
> 2. Bluetooth advertising will be disabled if no operation is performed within 10 minutes after
>    advertising is enabled.
> 3. Bluetooth advertising will be disabled if no operation is performed within 3 minutes after
>    disconnection from the linked state.
> 4. In connected state, Bluetooth advertising will be disabled to save power consumption if no
>    data transmission occurs within 10 minutes.

**8. After connecting, can the app send a command immediately, or is initialisation/a delay required?**

> Commands can be sent immediately.

**9. Can more than one phone be connected at the same time?**

> No. Only one-to-one connection is supported. Once connected, other devices cannot discover this
> connected H158 device.

## Message format

**10. Is the frame `header(02) | length | payload | XOR checksum | tail(01)`? Example: Lock = `02 02 A1 78 D9 01`. Correct? What is tail `01` for?**

> [Confirmed as described by the questioner — see `MANIFEST.md` §4 for why the checksum span in
> this confirmation does not match the manufacturer's own SDK, which we treat as authoritative.]
>
> The trailing 01 has no special meaning. It only serves as a check for complete data packets and
> acts as the tail feature value of the data packet.

**11. Do you have a complete list of supported commands?**

> Refer to *H158 Protocol-202608131414*.

**12. What does the device reply to an invalid command or wrong checksum? Error frame, or nothing?**

> The device will not respond when invalid commands, incorrect checksum, or error frames are sent.

**13. Does the device ever send a message on its own — e.g. on a physical button press or state change?**

> The H158 device will not upload status. The application will not receive notifications when the
> user presses the key or the status changes.

## Timing and reconnection

**14. Is a minimum gap required between commands?**

> A 20 ms interval is required between two consecutive AT commands.

**15. When the phone disconnects or moves out of range, does the device start advertising again immediately?**

> When the mobile phone disconnects or goes out-of-range, advertising will be restarted for 3
> minutes.

**16. If a device is unlocked and the phone disconnects, is it still unlocked on reconnect?**

> Yes, it remains in the unlocked state. The H158 retains the state prior to disconnection.

## Bench testing

**17. How should we power a bare board so Bluetooth works? Which pads, and is a battery required?**

> When soldering a lithium-ion battery with a full-charge voltage of 4.2 V, standalone USB power
> supply cannot sustain system operation.

**18. On our board, two white LEDs blink continuously and never stop. What does this indicate? Also: we believe our board (marked `AC-H158-V1.01`, pads `B+`/`B-`/`T`, USB-C connector, microphone on separate wires, no visible crystal or antenna) is a charging/protection board, not the main board — please confirm.**

> 1. Please provide a video of the white LED flashing or upgrade the MCU firmware.
> 2. Connect B+ to the positive terminal of the battery for the complete unit, B- to the battery
>    negative terminal, and the blue H+ wire to the heating wire. The microphone is an airflow
>    sensor, and the Bluetooth antenna is implemented on-circuit on the PCB.

**Not confirmed either way** — see `MANIFEST.md` §5 and `../hqd-device-architecture.md` for why
this reads as though `AC-H158-V1.01` *is* the main board, contradicting our working assumption, and
how the bring-up plan settles it on the bench instead of by asking again.
