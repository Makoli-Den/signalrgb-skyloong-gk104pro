export function Name() { return "Skyloong GK104 Pro"; }
export function VendorId() { return 0x1EA7; }
export function ProductId() { return [0x0907]; }
export function Publisher() { return "Community"; }
export function Documentation() { return "troubleshooting/skyloong"; }
export function Size() { return [24, 6]; }
export function DefaultPosition() { return [10, 100]; }
export function DefaultScale() { return 8.0; }
export function DeviceType() { return "keyboard"; }
export function Validate(endpoint) { return endpoint.interface === 1; }
export function ImageUrl() { return "https://assets.signalrgb.com/devices/default/keyboards/full-size-keyboard-render.png"; }
/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
keyboard:readonly
*/
export function ControllableParameters() {
	return [
		{ property: "shutdownColor", group: "lighting", label: "Shutdown Color", description: "This color is applied to the device when the System, or SignalRGB is shutting down", min: "0", max: "360", type: "color", default: "#000000" },
		{ property: "LightingMode", group: "lighting", label: "Lighting Mode", description: "Determines where the device's RGB comes from. Canvas will pull from the active Effect, while Forced will override it to a specific color", type: "combobox", values: ["Canvas", "Forced"], default: "Canvas" },
		{ property: "forcedColor", group: "lighting", label: "Forced Color", description: "The color used when 'Forced' Lighting Mode is enabled", min: "0", max: "360", type: "color", default: "#009bde" },
	];
}

// Reverse-engineered from OpenRGB's own Skyloong GK104 Pro driver
// (Controllers/SkyloongController/*, GPL-2.0-or-later, author "Givo"):
// https://gitlab.com/CalcProgrammer1/OpenRGB/-/tree/master/Controllers/SkyloongController
// Protocol summary:
//   - 65-byte HID output reports, byte 0 = report id (always 0x00 — no numbered reports).
//   - byte 1 = command, byte 2 = sub-command, bytes 3-6 = little-endian header
//     (le_define only), bytes 7-8 = little-endian CRC16-CCITT(false) of the
//     WHOLE 65-byte buffer computed with the CRC bytes still zeroed, bytes
//     9-64 = payload (56 bytes max).
//   - Commands: ping=0x0C (sub 0x00), mode=0x0B (sub 0x04=offline/0x05=online),
//     le_define=0x1A (sub 0x01=set a 56-byte chunk of the 528-byte LED table,
//     sub 0x02=save/apply — no payload).
//   - LED table: 528 bytes = 132 slots of 4 bytes (R,G,B,brightness), address
//     of a given LED = led.value * 4. Sent in 56-byte chunks (9 full chunks +
//     one 24-byte tail), each chunk's own header = chunkOffset | (chunkLength << 24).
export function Initialize() {
	// Registers this device as input-capable so SignalRGB's macro editor
	// offers it as a bindable source.
	device.addFeature("keyboard");

	Skyloong.Initialize();
}

export function Render() {
	Skyloong.Render();
}

export function Shutdown(SystemSuspending) {
	Skyloong.Shutdown(SystemSuspending ? "#000000" : shutdownColor);
}

export function LedNames() {
	return LEDS.map(l => l.name);
}

export function LedPositions() {
	return LEDS.map(l => [l.x, l.y]);
}

/* global LEDS:readonly */

const Commands = {
	PING: 0x0C,
	MODE: 0x0B,
	LE_DEFINE: 0x1A,
};

const ModeSub = { OFFLINE: 0x04, ONLINE: 0x05 };
const LeDefineSub = { SET: 0x01, SAVE: 0x02 };

const PACKET_SIZE = 65;
const TOTAL_LED_BYTES = 528;
const LED_BYTES_IN_CHUNK = 56;
const BRIGHTNESS_MAX = 127;

class SkyloongGK104Pro {
	constructor() {
		this.initialized = false;
		this.lastPingTime = 0;
		this.lastSendTime = 0;
	}

	// CRC-16/CCITT-FALSE, bit-for-bit port of OpenRGB's Crc16CcittFalse().
	/** @param {number[]} buf */
	crc16(buf) {
		let crc = 0xFFFF;

		for (let i = 0; i < buf.length; i++) {
			crc ^= (buf[i] << 8) & 0xFFFF;

			for (let b = 0; b < 8; b++) {
				if (crc & 0x8000) {
					crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
				} else {
					crc = (crc << 1) & 0xFFFF;
				}
			}
		}

		return crc & 0xFFFF;
	}

	/** @param {number} command @param {number} subCommand */
	sendCommand(command, subCommand) {
		const buf = new Array(PACKET_SIZE).fill(0x00);

		buf[1] = command;
		buf[2] = subCommand;

		const crc = this.crc16(buf);

		buf[7] = crc & 0xFF;
		buf[8] = (crc >> 8) & 0xFF;

		device.write(buf, PACKET_SIZE);
	}

	/** @param {number} address @param {number[]} data */
	setLEDefine(address, data) {
		const buf = new Array(PACKET_SIZE).fill(0x00);

		buf[1] = Commands.LE_DEFINE;
		buf[2] = LeDefineSub.SET;

		const header = (address | (data.length << 24)) >>> 0;

		buf[3] = header & 0xFF;
		buf[4] = (header >> 8) & 0xFF;
		buf[5] = (header >> 16) & 0xFF;
		buf[6] = (header >> 24) & 0xFF;

		for (let i = 0; i < data.length; i++) {buf[9 + i] = data[i];}

		const crc = this.crc16(buf);

		buf[7] = crc & 0xFF;
		buf[8] = (crc >> 8) & 0xFF;

		device.write(buf, PACKET_SIZE);
	}

	Initialize() {
		this.sendCommand(Commands.PING, 0x00);
		device.pause(10);
		this.sendCommand(Commands.MODE, ModeSub.ONLINE);
		device.pause(10);
		this.sendCommand(Commands.PING, 0x00);

		this.initialized = true;
		this.lastPingTime = Date.now();
	}

	/** @param {string} [overrideColor] */
	Render(overrideColor) {
		if (!this.initialized) {return;}

		// Keep the keyboard in "online"/software-controlled mode. A bare
		// PING isn't enough to recover this on its own: if the keyboard was
		// physically disconnected and reconnected (e.g. switched from
		// Bluetooth back to the USB cable) without SignalRGB re-calling
		// Initialize() for what it still treats as the same already-known
		// device, the keyboard's firmware can come back up in its own
		// default OFFLINE/onboard mode — only the MODE command switches it
		// back to ONLINE, a PING alone does not. Resend the full
		// online-mode assertion periodically so this self-heals without
		// depending on Initialize() firing again.
		if (Date.now() - this.lastPingTime >= 5000) {
			this.sendCommand(Commands.PING, 0x00);
			this.sendCommand(Commands.MODE, ModeSub.ONLINE);
			this.lastPingTime = Date.now();
		}

		// Throttle actual LED updates to ~30/sec. SignalRGB can call Render()
		// much more often than that, and this device sends a full 528-byte
		// LED table as 11 separate HID writes on every single call -- with
		// no throttle, that constant write traffic can starve the keyboard's
		// own AT32F405 MCU enough that it stops reporting a held key's
		// repeat during sustained typing (confirmed: the drop happens even
		// with a static Forced color, i.e. it's the send *rate*, not the
		// animation, that's the problem). 30/sec is well above what any
		// gradient-style lighting effect needs to look continuous.
		// Skipped for an explicit one-shot color (Shutdown()'s call) so the
		// shutdown color is never silently dropped by unlucky timing.
		const now = Date.now();

		if (!overrideColor && now - this.lastSendTime < 33) {return;}

		this.lastSendTime = now;

		const leData = new Array(TOTAL_LED_BYTES).fill(0x00);
		const forced = overrideColor ? hexToRgb(overrideColor)
			: LightingMode === "Forced" ? hexToRgb(forcedColor) : null;

		for (let i = 0; i < LEDS.length; i++) {
			const led = LEDS[i];
			const color = forced ?? device.color(led.x, led.y);
			const idx = led.value * 4;

			leData[idx] = color[0];
			leData[idx + 1] = color[1];
			leData[idx + 2] = color[2];
			leData[idx + 3] = BRIGHTNESS_MAX;
		}

		for (let n = 0; n < TOTAL_LED_BYTES; n += LED_BYTES_IN_CHUNK) {
			const len = Math.min(LED_BYTES_IN_CHUNK, TOTAL_LED_BYTES - n);

			this.setLEDefine(n, leData.slice(n, n + len));
		}

		this.sendCommand(Commands.LE_DEFINE, LeDefineSub.SAVE);
	}

	/** @param {string} color */
	Shutdown(color) {
		this.Render(color);
		this.sendCommand(Commands.MODE, ModeSub.OFFLINE);
	}
}

const Skyloong = new SkyloongGK104Pro();

/** @param {string} hex */
function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

	return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

// LED table: name, "value" (Skyloong's own LED address unit — from OpenRGB's
// keyboard_offset_values table for this exact model) and an approximate
// physical (x, y) grid position for canvas mapping. Values are copied
// verbatim from OpenRGB; positions are a best-effort reconstruction of a
// standard full ANSI QWERTY layout and may need adjusting against the real
// keyboard (e.g. via the ImageUrl/layout designer) once this loads.
const LEDS = [
	// Row 0 — function row
	{name: "Esc", value: 0, x: 0, y: 0},
	{name: "F1", value: 2, x: 2, y: 0},
	{name: "F2", value: 3, x: 3, y: 0},
	{name: "F3", value: 4, x: 4, y: 0},
	{name: "F4", value: 5, x: 5, y: 0},
	{name: "F5", value: 7, x: 7, y: 0},
	{name: "F6", value: 8, x: 8, y: 0},
	{name: "F7", value: 9, x: 9, y: 0},
	{name: "F8", value: 10, x: 10, y: 0},
	{name: "F9", value: 11, x: 12, y: 0},
	{name: "F10", value: 12, x: 13, y: 0},
	{name: "F11", value: 13, x: 14, y: 0},
	{name: "F12", value: 14, x: 15, y: 0},
	{name: "Print Screen", value: 15, x: 17, y: 0},
	{name: "Scroll Lock", value: 16, x: 18, y: 0},
	{name: "Pause Break", value: 17, x: 19, y: 0},

	// Row 1 — number row
	{name: "`", value: 22, x: 0, y: 1},
	{name: "1", value: 23, x: 1, y: 1},
	{name: "2", value: 24, x: 2, y: 1},
	{name: "3", value: 25, x: 3, y: 1},
	{name: "4", value: 26, x: 4, y: 1},
	{name: "5", value: 27, x: 5, y: 1},
	{name: "6", value: 28, x: 6, y: 1},
	{name: "7", value: 29, x: 7, y: 1},
	{name: "8", value: 30, x: 8, y: 1},
	{name: "9", value: 31, x: 9, y: 1},
	{name: "0", value: 32, x: 10, y: 1},
	{name: "-", value: 33, x: 11, y: 1},
	{name: "=", value: 34, x: 12, y: 1},
	{name: "Backspace", value: 36, x: 13, y: 1},
	{name: "Insert", value: 37, x: 17, y: 1},
	{name: "Home", value: 38, x: 18, y: 1},
	{name: "Page Up", value: 39, x: 19, y: 1},
	{name: "Num Lock", value: 40, x: 20, y: 1},
	{name: "Num /", value: 41, x: 21, y: 1},
	{name: "Num *", value: 42, x: 22, y: 1},
	{name: "Num -", value: 43, x: 23, y: 1},

	// Row 2 — QWERTY row
	{name: "Tab", value: 44, x: 0, y: 2},
	{name: "Q", value: 45, x: 1, y: 2},
	{name: "W", value: 46, x: 2, y: 2},
	{name: "E", value: 47, x: 3, y: 2},
	{name: "R", value: 48, x: 4, y: 2},
	{name: "T", value: 49, x: 5, y: 2},
	{name: "Y", value: 50, x: 6, y: 2},
	{name: "U", value: 51, x: 7, y: 2},
	{name: "I", value: 52, x: 8, y: 2},
	{name: "O", value: 53, x: 9, y: 2},
	{name: "P", value: 54, x: 10, y: 2},
	{name: "[", value: 55, x: 11, y: 2},
	{name: "]", value: 56, x: 12, y: 2},
	{name: "\\", value: 58, x: 13, y: 2},
	{name: "Delete", value: 59, x: 17, y: 2},
	{name: "End", value: 60, x: 18, y: 2},
	{name: "Page Down", value: 61, x: 19, y: 2},
	{name: "Num 7", value: 62, x: 20, y: 2},
	{name: "Num 8", value: 63, x: 21, y: 2},
	{name: "Num 9", value: 64, x: 22, y: 2},
	{name: "Num +", value: 65, x: 23, y: 2},

	// Row 3 — home row
	{name: "Caps Lock", value: 66, x: 0, y: 3},
	{name: "A", value: 67, x: 1, y: 3},
	{name: "S", value: 68, x: 2, y: 3},
	{name: "D", value: 69, x: 3, y: 3},
	{name: "F", value: 70, x: 4, y: 3},
	{name: "G", value: 71, x: 5, y: 3},
	{name: "H", value: 72, x: 6, y: 3},
	{name: "J", value: 73, x: 7, y: 3},
	{name: "K", value: 74, x: 8, y: 3},
	{name: "L", value: 75, x: 9, y: 3},
	{name: ";", value: 76, x: 10, y: 3},
	{name: "'", value: 77, x: 11, y: 3},
	{name: "#", value: 78, x: 12, y: 3},
	{name: "Enter", value: 79, x: 13, y: 3},
	{name: "Num 4", value: 84, x: 20, y: 3},
	{name: "Num 5", value: 85, x: 21, y: 3},
	{name: "Num 6", value: 86, x: 22, y: 3},

	// Row 4 — shift row (value 89 is an ISO-only slot with no key on this
	// ANSI board, per OpenRGB's own ChangeKeys() shift-right-shift fixup —
	// deliberately skipped here)
	{name: "Left Shift", value: 88, x: 0, y: 4},
	{name: "Z", value: 90, x: 1, y: 4},
	{name: "X", value: 91, x: 2, y: 4},
	{name: "C", value: 92, x: 3, y: 4},
	{name: "V", value: 93, x: 4, y: 4},
	{name: "B", value: 94, x: 5, y: 4},
	{name: "N", value: 95, x: 6, y: 4},
	{name: "M", value: 96, x: 7, y: 4},
	{name: ",", value: 97, x: 8, y: 4},
	{name: ".", value: 98, x: 9, y: 4},
	{name: "/", value: 99, x: 10, y: 4},
	{name: "Right Shift", value: 102, x: 11, y: 4},
	{name: "Up Arrow", value: 104, x: 18, y: 4},
	{name: "Num 1", value: 106, x: 20, y: 4},
	{name: "Num 2", value: 107, x: 21, y: 4},
	{name: "Num 3", value: 108, x: 22, y: 4},
	{name: "Num Enter", value: 109, x: 23, y: 4},

	// Row 5 — bottom row (spacebar is 3 separately-addressable segments,
	// per OpenRGB's "Key: Left Space" / "Key: Right Space" ChangeKeys() entries)
	{name: "Left Ctrl", value: 110, x: 0, y: 5},
	{name: "Left Win", value: 111, x: 1, y: 5},
	{name: "Left Alt", value: 112, x: 2, y: 5},
	{name: "Space Left", value: 114, x: 4, y: 5},
	{name: "Space", value: 116, x: 7, y: 5},
	{name: "Space Right", value: 118, x: 10, y: 5},
	{name: "Right Alt", value: 120, x: 12, y: 5},
	{name: "Fn", value: 121, x: 13, y: 5},
	{name: "Menu", value: 122, x: 14, y: 5},
	{name: "Right Ctrl", value: 124, x: 15, y: 5},
	{name: "Left Arrow", value: 125, x: 17, y: 5},
	{name: "Down Arrow", value: 126, x: 18, y: 5},
	{name: "Right Arrow", value: 127, x: 19, y: 5},
	{name: "Num 0", value: 128, x: 20, y: 5},
	{name: "Num .", value: 130, x: 22, y: 5},
];
