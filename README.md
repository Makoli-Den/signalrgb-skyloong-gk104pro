# SignalRGB plugin for Skyloong GK104 Pro

A native SignalRGB device plugin for the **Skyloong GK104 Pro** keyboard that talks directly to it over USB HID — no OpenRGB required.

Confirmed working: lighting control (Canvas effects, Forced color, Shutdown color) and macro-input registration.

## Why

SignalRGB has no built-in driver for this keyboard, so the usual way to control it from SignalRGB is via the OpenRGB SDK bridge, which means running the separate OpenRGB application in the background just for this one device. This plugin replaces that with a direct HID driver.

## Protocol credit

The USB HID protocol (packet format, commands, CRC16, LED addressing) is reverse-engineered work from the [OpenRGB project](https://gitlab.com/CalcProgrammer1/OpenRGB) — specifically `Controllers/SkyloongController/` (GPL-2.0-or-later, by Givo). This plugin is an independent reimplementation of that protocol for SignalRGB's plugin API, not a copy of OpenRGB's C++ code.

## Installation

1. **Stop OpenRGB** (or at least make sure it isn't holding the keyboard's HID device open — SignalRGB's own driver needs exclusive access to it).
2. In SignalRGB, open the add-on manager and add this repository's URL: `https://github.com/Makoli-Den/signalrgb-skyloong-gk104pro`. Enable the add-on and select the `main` branch.
   - The repo must stay **public** for SignalRGB to read its branch list — if the branch dropdown is empty, that's why.
3. SignalRGB should detect "Skyloong GK104 Pro" as a new device.
4. If SignalRGB was also showing the keyboard through OpenRGB's bridge, disable/remove that duplicate entry in SignalRGB's device list so you don't have two conflicting controllers for the same keyboard.

## Feature coverage vs. a "standard" SignalRGB keyboard plugin

| Feature | Status |
|---|---|
| Canvas-driven lighting | ✅ |
| Forced Color / Shutdown Color | ✅ |
| Device icon | ✅ (generic full-size keyboard render) |
| Registered as macro-input-capable (`device.addFeature("keyboard")`) | ✅ |
| Per-key macro binding for ordinary keys | Handled by the OS / SignalRGB's global key hook, independent of this plugin — normal typing doesn't go through the keyboard's RGB vendor channel at all (confirmed: OpenRGB's own driver never reads from the device either, only writes) |
| Extra/special buttons unique to this board (Fn combos, any dedicated macro keys) reporting through this plugin specifically | ❌ Not investigated — would need live packet-sniffing against the real keyboard (nothing in OpenRGB's driver to reference, since OpenRGB doesn't read input either) |
| Brightness slider | ❌ Hardcoded to max (127) |
| Onboard memory mode toggle | ❌ Not implemented |

## Known limitations / things to verify

- **Key positions are a best-effort reconstruction**, not measured against the real keyboard. The LED *addresses* (which byte controls which physical LED) are taken directly from OpenRGB's own lookup table for this exact model, so those should be correct — but the on-screen (x, y) grid position assigned to each key (used for effects like waves/rainbows to know where each key visually sits) was reconstructed from a standard full-size ANSI layout and may not perfectly match the real physical layout. If some keys look like they're lighting up "out of sync" with a moving effect, that's a position issue, not a wrong-LED issue, and can be tweaked in `Skyloong_GK104_Pro.js`'s `LEDS` table.
- The plugin sends a periodic ping every 5s to keep the keyboard in "online" (software-controlled) mode. This hasn't been tested over long idle periods.
- Each color update sends ~11 HID reports (10 LED-data chunks + 1 save command). Not yet performance-profiled for smoothness.

## Files

- `Skyloong_GK104_Pro.js` — the plugin.
