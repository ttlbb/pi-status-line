/**
 * Status Line Extension
 *
 * Turn progress + live output throughput (tk/s) in the footer.
 *
 * - Live values estimate tokens from streamed characters, calibrated against
 *   the real usage reported at the end of each message (adapts to CJK/code).
 * - If a provider reports usage during streaming, that value is preferred.
 * - Final values use the provider's real `usage.output` over the time between
 *   the first and last streamed token (excludes end-of-stream finalization).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_CHARS_PER_TOKEN = 4;
const MIN_CHARS_PER_TOKEN = 1;
const MAX_CHARS_PER_TOKEN = 8;
const UPDATE_INTERVAL_MS = 200;

export default function (pi: ExtensionAPI) {
	let turnCount = 0;
	let charsPerToken = DEFAULT_CHARS_PER_TOKEN;

	let firstTokenAt: number | undefined;
	let lastTokenAt: number | undefined;
	let outputChars = 0;
	let lastStatusAt = 0;

	const resetStream = () => {
		firstTokenAt = undefined;
		lastTokenAt = undefined;
		outputChars = 0;
		lastStatusAt = 0;
	};

	const formatRate = (rate: number): string => {
		if (!Number.isFinite(rate) || rate <= 0) return "0";
		return rate >= 100 ? rate.toFixed(0) : rate.toFixed(1);
	};

	pi.on("session_start", async (_event, ctx) => {
		resetStream();
		ctx.ui.setStatus("status-line", ctx.ui.theme.fg("dim", "Ready"));
	});

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		resetStream();
		ctx.ui.setStatus(
			"status-line",
			ctx.ui.theme.fg("accent", "●") + ctx.ui.theme.fg("dim", ` Turn ${turnCount}...`),
		);
	});

	pi.on("message_start", async (event) => {
		if (event.message.role !== "assistant") return;
		resetStream();
	});

	pi.on("message_update", async (event, ctx) => {
		const ev = event.assistantMessageEvent;
		const isStart =
			ev.type === "text_start" || ev.type === "thinking_start" || ev.type === "toolcall_start";
		const isDelta =
			ev.type === "text_delta" || ev.type === "thinking_delta" || ev.type === "toolcall_delta";
		if (!isStart && !isDelta) return;

		const now = Date.now();
		if (isDelta) {
			outputChars += ev.delta.length;
			lastTokenAt = now;
		}
		if (firstTokenAt === undefined) {
			firstTokenAt = now;
			lastStatusAt = now; // wait one throttle window before the first live update
			return;
		}
		if (now - lastStatusAt < UPDATE_INTERVAL_MS) return;
		lastStatusAt = now;

		const seconds = Math.max(0.001, (now - firstTokenAt) / 1000);
		const reported = ev.partial?.usage?.output ?? 0;
		const tokens = reported > 0 ? reported : outputChars / charsPerToken;
		const rate = tokens / seconds;

		const theme = ctx.ui.theme;
		ctx.ui.setStatus(
			"status-line",
			theme.fg("accent", "●") +
				theme.fg("dim", ` Turn ${turnCount} `) +
				theme.fg("accent", `⚡ ${formatRate(rate)} tk/s`),
		);
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		const theme = ctx.ui.theme;
		const reported = event.message.usage?.output ?? 0;

		// Calibrate the estimate for future messages from the real usage.
		if (reported > 0 && outputChars > 0) {
			charsPerToken = Math.min(
				MAX_CHARS_PER_TOKEN,
				Math.max(MIN_CHARS_PER_TOKEN, outputChars / reported),
			);
		}

		let statsText = "";
		if (firstTokenAt !== undefined && lastTokenAt !== undefined && lastTokenAt > firstTokenAt) {
			const seconds = (lastTokenAt - firstTokenAt) / 1000;
			const tokens = reported > 0 ? reported : outputChars / charsPerToken;
			if (tokens > 0) {
				statsText = ` · ${Math.round(tokens)} tok · ⚡ ${formatRate(tokens / seconds)} tk/s`;
			}
		}

		ctx.ui.setStatus(
			"status-line",
			theme.fg("success", "✓") + theme.fg("dim", ` Turn ${turnCount}${statsText}`),
		);
		resetStream();
	});
}
