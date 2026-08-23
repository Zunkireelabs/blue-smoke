<!--
 * @Author: wuxiang xiangw@itron.com.cn
 * @Date: 2026-08-21 16:07:18
 * @LastEditors: wuxiang xiangw@itron.com.cn
 * @LastEditTime: 2026-08-21 16:59:52
 * @FilePath: /Users/xiangwu/Desktop/H158问题.md
 * @Description: This is the default setting. Please set `customMade` and open koroFileHeader to view the configuration: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
## Firmware upgrade completed via PW200 — need help with the reply protocol

Following up on your 17 Aug reply and the PW200 instructions in the 9 Aug BLE.zip (sorry for the delay opening that
file — that's on us). We ran your documented procedure and it worked exactly as written. Thank you. The device now
replies to BLE commands for the first time — we need your help reading what it's saying.
What we did: flashed both .pkg files found in that same archive via PW200/PowerWriter 1.4.1.0, tested each with your
own com.itorn.hqd.ble demo app (not our code, so results reflect device + firmware only):

| File | Built | Result |
| - | - | - |
| H158_Test_260708_01.pkg | 2026-07-08 | Silent to every command — same as originally shipped |
| H158_V0R0_5EDA983B_202607151202.pkg | 2026-07-15 | Replies — reproduced across two separateflashes |

### 1. Which firmware is correct

1.1. Which .pkg is the current production firmware for H158/YP65-AT? Neither of the two we have is what shipped
originally on the unit.
1.2. Is there a newer .pkg than both of these we should be using instead?
1.3. Should the originally-shipped firmware have replied to BLE commands at all, or does every unit require this PW200
upgrade before it responds? We ask because one of your own files (Test_260708_01) also produced no reply, so "needs
upgrading" doesn't fully explain the silence on its own
<font color="#00008B">
Please use the H158_Test_260814_01_.pkg bundle uniformly.
The protocol used by the demo app we provided corresponds to the H158_Test_260814_01_.pkg firmware version. </font>

### 2. The reply format

Sending your documented Read Status command:
TX 02 01 A2 A1 01
RX 81 00 03 00 00 00 (~35–75 ms, every time)
Your reply of 17 Aug, item 2, specifies the response as 02 05 A2 00 30/31 00 ## ** 01 — header 0x02, tail 0x01. What we
get starts 0x81 and has no 0x01 tail.
2.1. Is 0x81/0x82 a different or newer protocol than H158 Protocol-202608131414 (the document referenced in your reply
items 2 and 11)?
2.2. If so, could you send the document that describes the 0x81/0x82 framing?
2.3. If the 02...01 framing you already gave us is still the correct one, which firmware image actually implements it? Could
you send that .pkg?
2.4. Your own demo app throws Failed to parse BLE frame: Invalid frame head: 0x81 on this reply, and its
Lock/System/Battery fields stay blank. Is the demo app simply older than this firmware, or is 0x81 unexpected to you as
well?
<font color="#00008B">
The error is caused by a mismatch between the protocol version used by the Android app and H158's earlier protocol version. Please update to the H158_Test_260814_01_.pkg bundle for normal data communication.

### Lock command

**App -> H158**

| Field | head | length | CMD | Data | checksum | Tail |
| - | - | - | - | - | - | - |
| Size | 1B | 1B | 1B | 1B | XX | 1B |
| Value | 0x02 | 0x02 | 0xA1 | 0x78 | 0xD9 | 0x01 |

Example: `02 02 A1 78 D9 01`

**H158 -> App**

| Field | head | length | CMD | ACK | Data | checksum | Tail |
| - | - | - | - | - | - | - | - |
| Size | 1B | 1B | 1B | 1B | XX | 1B | 1B |
| Value | 0x02 | 0x03 | 0xA1 | 0x00 | 0x78 | 0xD8 | 0x01 |

ACK 0x00 = success

### Unlock command

**App -> H158**

| Field | head | length | CMD | Data | checksum | Tail |
| - | - | - | - | - | - | - |
| Size | 1B | 1B | 1B | 1B | XX | 1B |
| Value | 0x02 | 0x02 | 0xA1 | 0x87 | 0x26 | 0x01 |

Example: `02 02 A1 87 26 01` (Unlock)

**H158 -> App**

| Field | head | length | CMD | ACK | Data | checksum | Tail |
| - | - | - | - | - | - | - | - |
| Size | 1B | 1B | 1B | 1B | XX | 1B | 1B |
| Value | 0x02 | 0x03 | 0xA1 | 0x00 | 0x87 | 0x26 | 0x01 |

ACK 0x00 = success

### Device info command

**App -> H158**

| Field | head | length | CMD | Data | checksum | Tail |
| - | - | - | - | - | - | - |
| Size | 1B | 1B | 1B | 1B | XX | 1B |
| Value | 0x02 | 0x02 | 0xA1 | — | 0xA1 | 0x01 |

Example: `02 02 A1 A1 01`

**H158 -> App**

| Field | head | length | CMD | ACK | Data | checksum | Tail |
| - | - | - | - | - | - | - | - |
| Size | 1B | 1B | 1B | 1B | 3B | 1B | 1B |
| Value | 0x02 | 0x05 | 0xA2 | 0x00 | 0x31 0x00 0x64 | 0xF0 | 0x01 |

ACK 0x00 = success

Data field (3 bytes) meaning:

- `0x31` / `0x30`: lock / Unlock
- `0x00`: System power-on/off status (00 Power-on, 01 Power-off, 02 Preheating, 03 Heating)
- `0x64`: Device battery level (Hexadecimal → Decimal = 100)
</font>

### 3. The reply doesn't seem to carry real data

We also sent Lock and Unlock:
TX 02 02 A1 78 D9 01 (Lock) RX 82 00 00
TX 02 02 A1 87 26 01 (Unlock) RX 82 00 00
TX 02 01 A2 A1 01 (Read Status again) RX 81 00 03 00 00 00 (same as before)
3.1. The reply is identical regardless of whether we sent Lock, Unlock, or Read Status, and doesn't change between reads.
Is 0x81/0x82 a generic acknowledgement/error frame rather than a status payload with real lock-state and battery data?
3.2. If it is a generic ack, what does 81 00 03 00 00 00 specifically indicate — success, or a fixed placeholder ?

<font color="#00008B">This remains due to an inconsistency between the terminal protocol and the Android app protocol. Kindly update the H158 software version.</font>

### 4. Advertising duration

4.1. Your reply item 7 says advertising stays active for 10 minutes after a single button press. On our unit — both before
and after this firmware upgrade — it stops after a few seconds. Is 10 minutes still correct for this hardware, or does the
button-press advertising window differ by firmware version?

> **中文翻译：** 你方第 7 条回复称，单次按键后蓝牙广播（advertising）会持续约 10 分钟。但在我们的设备上——无论固件升级前还是升级后——广播都只持续几秒就停止了。对于这款硬件，10 分钟的说法还准确吗？还是说按键触发的广播窗口会因固件版本不同而改变？

<font color="#00008B">Did you test this using the upgraded H158_Test_260814_01_.pkg firmware version? For this version, a single button press keeps Bluetooth advertising active for 10 minutes. Once connected, if the phone disconnects, the Bluetooth advertising remains active for 3 minutes.</font>

### 5. Chip identity (not urgent, for the record)

5.1. We identified the MCU as PY32C642F15 from the physical package markings (PUYA / C642F15 / 4B6HM1A). Both of
your .pkg files instead specify PY32F002Bx5 in PowerWriter (same 24.00 KB flash / 0.13 KB OTP as what we read off the
package). Which is the correct part number for this board?
Happy to send full BLE/PowerWriter logs for any of these. Thanks again for the PW200 procedure — once we found the
instructions, it worked exactly as documented.

> **中文翻译：** 我们从实物封装丝印（PUYA / C642F15 / 4B6HM1A）识别出 MCU 型号为 PY32C642F15；而你们提供的两个 .pkg 文件在 PowerWriter 中标注的却是 PY32F002Bx5（Flash 24.00 KB / OTP 0.13 KB，与我们读取到的封装参数一致）。这块板子的正确型号究竟是哪个？如需，我们很乐意提供上述任何一项的完整 BLE/PowerWriter 日志。再次感谢 PW200 的操作指引——我们照着做之后，流程与文档完全一致。

<font color="#00008B">PY32F002B and PY32C642 are in fact the same chip — only the package marking differs. Please simply use the installation package we provided to flash the device.</font>
