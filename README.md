# SignalRGB plugin for Skyloong GK104 Pro

A native SignalRGB device plugin for the **Skyloong GK104 Pro** keyboard that talks directly to it over USB HID — no OpenRGB required.

## Why

SignalRGB has no built-in driver for this keyboard, so the usual way to control it from SignalRGB is via the OpenRGB SDK bridge, which means running the separate OpenRGB application in the background just for this one device. This plugin replaces that with a direct HID driver.

## Protocol credit

The USB HID protocol (packet format, commands, CRC16, LED addressing) is reverse-engineered work from the [OpenRGB project](https://gitlab.com/CalcProgrammer1/OpenRGB) — specifically `Controllers/SkyloongController/` (GPL-2.0-or-later, by Givo). This plugin is an independent reimplementation of that protocol for SignalRGB's plugin API, not a copy of OpenRGB's C++ code.

## Installation

1. Close SignalRGB.
2. **Stop OpenRGB** (or at least make sure it isn't holding the keyboard's HID device open — SignalRGB's own driver needs exclusive access to it). You can then remove the keyboard from OpenRGB / stop running OpenRGB entirely.
3. Copy `Skyloong_GK104_Pro.js` into your SignalRGB plugins folder, in its own `Skyloong` subfolder:
   ```
   %LOCALAPPDATA%\VortxEngine\app-<version>\Signal-x64\Plugins\Skyloong\Skyloong_GK104_Pro.js
   ```
   (There's already an empty `Skyloong` folder shipped with SignalRGB — just drop the file in there.)
4. Start SignalRGB. It should detect "Skyloong GK104 Pro" as a new device.
5. If SignalRGB was also showing the keyboard through OpenRGB's bridge, disable/remove that duplicate entry in SignalRGB's device list so you don't have two conflicting controllers for the same keyboard.

## Known limitations / things to verify

- **Key positions are a best-effort reconstruction**, not measured against the real keyboard. The LED *addresses* (which byte controls which physical LED) are taken directly from OpenRGB's own lookup table for this exact model, so those should be correct — but the on-screen (x, y) grid position assigned to each key (used for effects like waves/rainbows to know where each key visually sits) was reconstructed from a standard full-size ANSI layout and may not perfectly match the real physical layout. If some keys look like they're lighting up "out of sync" with a moving effect, that's a position issue, not a wrong-LED issue, and can be tweaked in `Skyloong_GK104_Pro.js`'s `LEDS` table.
- **Brightness is hardcoded to max (127)** — no brightness slider is exposed yet.
- The plugin sends a periodic ping every 5s to keep the keyboard in "online" (software-controlled) mode. This hasn't been tested over long idle periods.
- Each color update sends ~11 HID reports (10 LED-data chunks + 1 save command). This hasn't been performance-tested for smoothness the way the LCD/mouse plugins in this account's other repos were — if it looks slow or stutters, that's the next thing to profile.

## Files

- `Skyloong_GK104_Pro.js` — the plugin.
