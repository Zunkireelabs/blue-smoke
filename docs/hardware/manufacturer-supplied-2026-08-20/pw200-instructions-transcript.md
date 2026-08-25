# PW200 update program — instructions transcript

Text transcribed from the manufacturer's `Instructions for using the PW200 update program.pptx`
(9 slides, supplied 2026-08-09 inside `BLE.zip`, never opened until 2026-08-20 — see session log
2026-08-20). Kept here as text because the source `.pptx` is large and the archive it came from is
gitignored (`temp-ss/`). Screenshots are described, not reproduced.

---

**Slide 1.** Instructions for using the PW200 update program.

**Slide 2 — program installation.**
1. Open `PowerWriter‑v1.4.0.1...exe` and run the installer.
2. Select your preferred language, click OK to continue.
3. Once installation is complete, a shortcut icon appears on your desktop.

**Slide 3.** Change the interface language of PowerWriter to English for easier use.

**Slide 4.**
B. Plug the PW200 into the PC by USB; the interface will indicate it is connected.
C. Select **"File → Load Project"**.

**Slide 5.**
D. Select the file path for the `.pkg` file and load it. **The password is `88888888`.** Click OK
to load.

**Slide 6.**
E. After loading is successful, the interface does not require any additional processing. Click
**PLoad** to upload the program file to the PW200 device.

**Slide 7.**
F. Once successfully loading the program to the PW200 device, a pop-up confirmation appears.

**Slide 8.**
G. Click **Disconnect** to disconnect the host app from the PW200.

**Slide 9.**
H. Connect the USB-C port on the vaporizer device.
I. Press the button on the PW200 and wait a few seconds. A green indicator light means the upgrade
succeeded.

---

## What we learned running this in practice (2026-08-20) that isn't in the deck

- **"File → Load Project" and the save/export item open the identical-looking dialog.** The only
  way to tell them apart after the fact is the log line `Project was updated at <date>` — if that
  date is the `.pkg`'s real build date, it loaded; if it's today's date, it saved over the file
  instead. We overwrote `H158_Test_260708_01.pkg` this way once (recovered from a second copy).
- **Do not assume the PW200's target-power/VREF setting matches the board's needs.** The project
  files set `I/O VREF = 3.3V` (the PW200 supplying the target), but the MCU only powers up with the
  **battery connected** during programming — pulling it produced a red `NG`. Battery attached +
  correct adapter orientation is what worked.
- **The USB-C programming adapter (unlabelled, ours has yellow tape and a handwritten "USB-C" note)
  only works in one orientation.** The wrong way gives `[0009] The target chip is not connected` on
  every attempt, indistinguishable from a genuine hardware fault. Cost most of a day before this was
  found by elimination.
