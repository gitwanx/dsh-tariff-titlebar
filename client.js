/**
 * Browser half of the DeepSeek Harness peak/off-peak title-bar plugin.
 *
 * Registers one `shell.overlay` entry: a compact status card pinned to the
 * centre of the Desktop window's captioned title bar (Windows Electron marks
 * the document with `data-windows-titlebar` and publishes
 * `--dsh-windows-titlebar-height`). It shows every billing window of the day,
 * tints the peak windows (weekdays only), highlights the current window, and
 * counts down to the next billing change in Beijing time.
 *
 * Billing rules follow DeepSeek's official price page: peak hours are Monday
 * through Friday 09:00-12:00 and 14:00-18:00 Beijing time, excluding Chinese
 * statutory holidays; every other time, including all weekend and holiday
 * hours, is off-peak. Off-peak prices are half of peak prices.
 */
window.__ModuleLoader__.load({
  id: "@local/dsh-tariff-titlebar",
  factory(require) {
    const React = require("react");
    const h = React.createElement;

    const PLUGIN_ID = "@local/dsh-tariff-titlebar";
    const LOCALE_NS = "tariff-titlebar";
    const CSS_ID = PLUGIN_ID + "/tariff.css";
    const COLLAPSED_KEY = "dsh.tariffTitlebar.collapsed.v2";

    /** Billing windows of one day, in Beijing minutes-of-day. */
    const SEGMENTS = [
      { start: 0, end: 9 * 60, peak: false },
      { start: 9 * 60, end: 12 * 60, peak: true },
      { start: 12 * 60, end: 14 * 60, peak: false },
      { start: 14 * 60, end: 18 * 60, peak: true },
      { start: 18 * 60, end: 24 * 60, peak: false },
    ];

    /** China Standard Time is a fixed UTC+8 offset (no daylight saving). */
    const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

    /** Minutes-of-day when a peak window opens. */
    const PEAK_STARTS = [9 * 60, 14 * 60];

    /**
     * Chinese statutory holidays, all of which bill at the off-peak rate.
     * Dates are Beijing calendar days, inclusive. 2026 follows the State
     * Council holiday arrangement; append 2027 when it is published.
     */
    const HOLIDAY_RANGES = [
      ["2026-01-01", "2026-01-03"],
      ["2026-02-15", "2026-02-23"],
      ["2026-04-04", "2026-04-06"],
      ["2026-05-01", "2026-05-05"],
      ["2026-06-19", "2026-06-21"],
      ["2026-09-25", "2026-09-27"],
      ["2026-10-01", "2026-10-07"],
    ];

    const CSS = `
.dshTariffSeat {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--dsh-windows-titlebar-height, 40px);
  z-index: 30;
  display: none;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.dshTariffSeat.dshTariffSeat {
  pointer-events: none;
}
html[data-windows-titlebar] .dshTariffSeat {
  display: flex;
}
.dshTariff {
  --tariff-accent-text: color-mix(in srgb, var(--dsw-static-amber-400) 72%, var(--dsw-alias-label-secondary));
  --tariff-current-text: color-mix(in srgb, var(--dsw-static-amber-400) 42%, var(--dsw-alias-label-primary));
  --tariff-accent-bg: color-mix(in srgb, var(--dsw-static-amber-500) 13%, transparent);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  height: 38px;
  width: max-content;
  max-width: calc(100vw - 16px);
  padding: 0 12px 0 9px;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-soft);
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-family, inherit);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}
body:not([data-ds-dark-theme]) .dshTariff {
  --tariff-accent-text: color-mix(in srgb, var(--dsw-static-amber-600) 72%, var(--dsw-alias-label-primary));
  --tariff-current-text: color-mix(in srgb, var(--dsw-static-amber-600) 55%, var(--dsw-alias-label-primary));
  --tariff-accent-bg: color-mix(in srgb, var(--dsw-static-amber-500) 16%, transparent);
}
.dshTariffRow {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 17px;
}
.dshTariffNote {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
  height: 18px;
  padding: 1px 4px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, #14b8a6 55%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, #14b8a6 16%, transparent);
}
body[data-ds-dark-theme] .dshTariffNote {
  border-color: color-mix(in srgb, #14b8a6 55%, transparent);
  background: color-mix(in srgb, #14b8a6 20%, transparent);
}
.dshTariffNoteStatus {
  display: inline-flex;
  align-items: center;
  height: 14px;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-static-green-500) 18%, transparent);
  color: color-mix(in srgb, var(--dsw-static-green-500) 38%, var(--dsw-alias-label-primary));
  font-weight: 600;
  line-height: 14px;
}
.dshTariff[data-phase="peak"] .dshTariffNoteStatus {
  background: color-mix(in srgb, var(--dsw-static-amber-400) 30%, transparent);
  color: color-mix(in srgb, var(--dsw-static-amber-900) 72%, var(--dsw-alias-label-primary));
}
body[data-ds-dark-theme] .dshTariffNoteStatus {
  background: color-mix(in srgb, var(--dsw-static-green-500) 22%, transparent);
}
body[data-ds-dark-theme] .dshTariff[data-phase="peak"] .dshTariffNoteStatus {
  background: color-mix(in srgb, var(--dsw-static-amber-500) 26%, transparent);
  color: color-mix(in srgb, var(--dsw-static-amber-100) 80%, var(--dsw-alias-label-primary));
}
.dshTariffNoteRule {
  display: inline-flex;
  align-items: center;
  height: 14px;
  padding: 0 7px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--dsw-static-blue-100);
  color: var(--dsw-static-blue-800);
  font-weight: 600;
  line-height: 14px;
}
body[data-ds-dark-theme] .dshTariffNoteRule {
  background: color-mix(in srgb, var(--dsw-static-blue-400) 24%, transparent);
  color: var(--dsw-static-blue-300);
}
.dshTariffBrand {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 17px;
  padding: 0 9px 0 6px;
  box-sizing: border-box;
  border-radius: 999px;
  background: linear-gradient(135deg, #ffe6a8 0%, #f6c65a 100%);
  color: #2a1f06;
  font-weight: 600;
}
body[data-ds-dark-theme] .dshTariffBrand {
  background: linear-gradient(135deg, #f7d777 0%, #e7b53f 100%);
  color: #241a04;
}
.dshTariffCoin {
  display: block;
  width: 15px;
  height: 15px;
  flex: none;
}
.dshTariffSegments {
  display: flex;
  align-items: center;
  gap: 2px;
}
.dshTariffSeg {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 7px;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-static-green-500) 10%, transparent);
  color: color-mix(in srgb, var(--dsw-static-green-500) 40%, var(--dsw-alias-label-primary));
  font-variant-numeric: tabular-nums;
}
.dshTariffSeg[data-peak="true"] {
  background: var(--tariff-accent-bg);
  color: var(--tariff-accent-text);
}
.dshTariffSeg[data-current="true"] {
  border-color: color-mix(in srgb, var(--dsw-static-green-500) 82%, transparent);
  background: color-mix(in srgb, var(--dsw-static-green-500) 32%, transparent);
  color: color-mix(in srgb, var(--dsw-static-green-500) 30%, var(--dsw-alias-label-primary));
  font-weight: 600;
}
.dshTariffSeg[data-current="true"][data-peak="true"] {
  border-color: color-mix(in srgb, var(--dsw-static-amber-600) 92%, transparent);
  background: color-mix(in srgb, var(--dsw-static-amber-500) 42%, transparent);
  color: var(--tariff-current-text);
  font-weight: 600;
}
.dshTariffStatus {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 17px;
  padding: 0 9px 0 8px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--dsw-static-green-500) 34%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-static-green-500) 12%, transparent);
  color: color-mix(in srgb, var(--dsw-static-green-500) 38%, var(--dsw-alias-label-primary));
}
.dshTariffStatus[data-target="peak"] {
  border-color: color-mix(in srgb, var(--dsw-static-amber-500) 42%, transparent);
  background: color-mix(in srgb, var(--dsw-static-amber-500) 15%, transparent);
  color: color-mix(in srgb, var(--dsw-static-amber-600) 74%, var(--dsw-alias-label-primary));
}
body[data-ds-dark-theme] .dshTariffStatus {
  background: color-mix(in srgb, var(--dsw-static-green-500) 18%, transparent);
}
body[data-ds-dark-theme] .dshTariffStatus[data-target="peak"] {
  background: color-mix(in srgb, var(--dsw-static-amber-500) 20%, transparent);
  color: color-mix(in srgb, var(--dsw-static-amber-100) 82%, var(--dsw-alias-label-primary));
}
.dshTariffClock {
  display: block;
  width: 12px;
  height: 12px;
  flex: none;
  opacity: 0.9;
}
.dshTariffCountdown {
  color: inherit;
  font-variant-numeric: tabular-nums;
}
.dshTariffBottom {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
}
.dshTariffBalance {
  --tariff-balance-fg: #4a3bc4;
  --tariff-balance-muted: #6d5cd6;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 17px;
  padding: 0 8px;
  box-sizing: border-box;
  flex: none;
  border: 1px solid color-mix(in srgb, #8b76f6 46%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, #8b76f6 15%, transparent);
}
body[data-ds-dark-theme] .dshTariffBalance {
  --tariff-balance-fg: #e4e0ff;
  --tariff-balance-muted: #b9b1ff;
  border-color: color-mix(in srgb, #8b76f6 40%, transparent);
  background: color-mix(in srgb, #8b76f6 20%, transparent);
}
.dshTariffBalance[data-level="watch"] {
  --tariff-balance-fg: #075985;
  --tariff-balance-muted: #0284c7;
  border-color: color-mix(in srgb, #0284c7 45%, transparent);
  background: color-mix(in srgb, #0284c7 13%, transparent);
}
.dshTariffBalance[data-level="low"] {
  --tariff-balance-fg: #92400e;
  --tariff-balance-muted: #b45309;
  border-color: color-mix(in srgb, #b45309 46%, transparent);
  background: color-mix(in srgb, #f59e0b 16%, transparent);
}
.dshTariffBalance[data-level="critical"] {
  --tariff-balance-fg: #991b1b;
  --tariff-balance-muted: #dc2626;
  border-color: color-mix(in srgb, #dc2626 46%, transparent);
  background: color-mix(in srgb, #ef4444 14%, transparent);
}
body[data-ds-dark-theme] .dshTariffBalance[data-level="watch"] {
  --tariff-balance-fg: #bae6fd;
  --tariff-balance-muted: #7dd3fc;
  border-color: color-mix(in srgb, #38bdf8 42%, transparent);
  background: color-mix(in srgb, #0284c7 20%, transparent);
}
body[data-ds-dark-theme] .dshTariffBalance[data-level="low"] {
  --tariff-balance-fg: #fde68a;
  --tariff-balance-muted: #fbbf24;
  border-color: color-mix(in srgb, #f59e0b 42%, transparent);
  background: color-mix(in srgb, #f59e0b 20%, transparent);
}
body[data-ds-dark-theme] .dshTariffBalance[data-level="critical"] {
  --tariff-balance-fg: #fecaca;
  --tariff-balance-muted: #f87171;
  border-color: color-mix(in srgb, #ef4444 42%, transparent);
  background: color-mix(in srgb, #ef4444 18%, transparent);
}
.dshTariffBalanceLabel {
  color: var(--tariff-balance-muted);
  font-size: 12px;
  font-weight: 500;
}
.dshTariffBalanceValue {
  color: var(--tariff-balance-fg);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dshTariffUsage {
  --usage-fg: #1e40af;
  --usage-muted: #3b82f6;
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 17px;
  padding: 0 8px;
  box-sizing: border-box;
  flex: none;
  border: 1px solid color-mix(in srgb, #60a5fa 45%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, #3b82f6 12%, transparent);
  cursor: default;
}
body[data-ds-dark-theme] .dshTariffUsage {
  --usage-fg: #bfdbfe;
  --usage-muted: #93c5fd;
  background: color-mix(in srgb, #3b82f6 20%, transparent);
}
.dshTariffUsageLabel {
  color: var(--usage-muted);
  font-size: 12px;
  font-weight: 500;
}
.dshTariffUsageValue {
  color: var(--usage-fg);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.dshTariffUsageTip {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  z-index: 100;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-static-neutral-00);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  transform: translateX(-50%);
  box-shadow: var(--dsw-elevation-panel);
}
.dshTariffToggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  margin-left: 1px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.dshTariffToggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshTariffToggle svg {
  display: block;
  width: 12px;
  height: 12px;
  transition: transform 120ms ease;
}
.dshTariff[data-collapsed="true"] .dshTariffToggle svg {
  transform: rotate(180deg);
}
.dshTariff[data-collapsed="true"] {
  height: 22px;
  padding: 0 6px 0 8px;
  gap: 0;
}
.dshTariff[data-collapsed="true"] .dshTariffRow {
  height: 20px;
  gap: 6px;
}
.dshTariff[data-collapsed="true"] .dshTariffStatus,
.dshTariff[data-collapsed="true"] .dshTariffBottom,
.dshTariff[data-collapsed="true"] .dshTariffSeg:not([data-current="true"]) {
  display: none;
}
@media (max-width: 1040px) {
  .dshTariffStatus { display: none; }
}
@media (max-width: 900px) {
  .dshTariffBrandText { display: none; }
}
@media (max-width: 760px) {
  .dshTariffBrand { display: none; }
  .dshTariffSeg:not([data-current="true"]) { display: none; }
}
@media (max-width: 820px) {
  .dshTariffNote { display: none; }
}
`;

    /** zh dictionary: the product language of this deployment. */
    const zh = {
      brand: "峰谷",
      peak: "高峰时段",
      off: "空闲时段",
      switchInSeconds: "{s} 秒后切换",
      switchInMinutesSeconds: "{m} 分钟 {s} 秒后切换",
      switchInHoursMinutesSeconds: "{h} 小时 {m} 分钟 {s} 秒后切换",
      switchInDaysHoursMinutesSeconds: "{d} 天 {h} 小时 {m} 分钟 {s} 秒后切换",
      notePeakLead: "当前为高峰时段：",
      notePeakRule: "token 按双倍价格计算",
      noteOffLead: "当前为空闲时段：",
      noteOffRule: "token 按正常价格计算",
      balanceLabel: "余额",
      balanceTip: "DeepSeek 账号可用余额",
      balanceBreakdown: "充值 {balance} · 赠金 {bonus}",
      usageLabel: "会话用量",
      usageTip: "当前会话共 {count} tokens",
      accountUsageLabel: "账号用量",
      accountUsageTip: "账号累计共 {count} tokens（全部历史）",
      collapse: "收起",
      expand: "展开",
      switchTo: "到",
      targetPeak: "高峰时段",
      targetOff: "空闲时段",
    };

    /** en dictionary: fallback for the other shipped locale. */
    const en = {
      brand: "Tariff",
      peak: "Peak rate",
      off: "Off-peak rate",
      switchInSeconds: "Switch in {s} s",
      switchInMinutesSeconds: "Switch in {m} min {s} s",
      switchInHoursMinutesSeconds: "Switch in {h} h {m} min {s} s",
      switchInDaysHoursMinutesSeconds: "Switch in {d} d {h} h {m} min {s} s",
      notePeakLead: "Peak now: ",
      notePeakRule: "tokens billed at 2x the normal rate",
      noteOffLead: "Off-peak now: ",
      noteOffRule: "tokens billed at the normal rate",
      balanceLabel: "Balance",
      balanceTip: "DeepSeek account balance",
      balanceBreakdown: "Topped-up {balance} · Granted {bonus}",
      usageLabel: "Session",
      usageTip: "Session total: {count} tokens",
      accountUsageLabel: "Account usage",
      accountUsageTip: "Account total: {count} tokens (all time)",
      collapse: "Collapse",
      expand: "Expand",
      switchTo: " to ",
      targetPeak: "peak hours",
      targetOff: "off-peak hours",
    };

    /** Pad a number to the two-digit clock form. */
    function two(n) {
      return String(n).padStart(2, "0");
    }

    /** Format a minute-of-day as `HH:MM`; 1440 renders as `24:00`. */
    function clock(minutes) {
      return two(Math.floor(minutes / 60)) + ":" + two(minutes % 60);
    }

    /** Format one window as `HH:MM-HH:MM`. */
    function windowLabel(segment) {
      return clock(segment.start) + "-" + clock(segment.end);
    }

    /** Replace one `{name}` placeholder in a locale template. */
    function fill(template, key, value) {
      return template.replace("{" + key + "}", String(value));
    }

    /** Calendar-day key `YYYY-MM-DD` for a Beijing wall-clock date. */
    function dateKey(year, monthIndex, day) {
      return year + "-" + two(monthIndex + 1) + "-" + two(day);
    }

    /** Expand the inclusive holiday ranges into a set of Beijing day keys. */
    const HOLIDAYS = new Set();
    for (const range of HOLIDAY_RANGES) {
      const start = range[0].split("-").map(Number);
      const end = range[1].split("-").map(Number);
      for (
        let time = Date.UTC(start[0], start[1] - 1, start[2]);
        time <= Date.UTC(end[0], end[1] - 1, end[2]);
        time += 24 * 60 * 60 * 1000
      ) {
        const day = new Date(time);
        HOLIDAYS.add(
          dateKey(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
        );
      }
    }

    /**
     * Beijing wall clock of an instant.
     * @param ms - epoch milliseconds.
     * @returns year, month index, day, weekday (0 = Sunday) and minutes-of-day.
     */
    function beijingParts(ms) {
      const date = new Date(ms + BEIJING_OFFSET_MS);
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth(),
        day: date.getUTCDate(),
        weekday: date.getUTCDay(),
        minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
      };
    }

    /** Epoch milliseconds of a Beijing wall-clock time on the parts' day. */
    function beijingEpoch(parts, minutes) {
      return (
        Date.UTC(parts.year, parts.month, parts.day) +
        minutes * 60 * 1000 -
        BEIJING_OFFSET_MS
      );
    }

    /** Beijing wall-clock date `days` after the parts' day. */
    function shiftDay(parts, days) {
      const date = new Date(
        Date.UTC(parts.year, parts.month, parts.day) +
          days * 24 * 60 * 60 * 1000,
      );
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth(),
        day: date.getUTCDate(),
        weekday: date.getUTCDay(),
      };
    }

    /** Whether the Beijing day is a weekday that bills at the peak rate. */
    function isPeakDay(parts) {
      if (parts.weekday === 0 || parts.weekday === 6) return false;
      return !HOLIDAYS.has(dateKey(parts.year, parts.month, parts.day));
    }

    /** The next weekday 09:00 Beijing time after the parts' day. */
    function nextPeakStart(parts) {
      for (let ahead = 1; ahead <= 400; ahead++) {
        const day = shiftDay(parts, ahead);
        if (isPeakDay(day)) return beijingEpoch(day, PEAK_STARTS[0]);
      }
      return beijingEpoch(shiftDay(parts, 1), PEAK_STARTS[0]);
    }

    /**
     * Resolve the current billing window, phase and the next phase change.
     * @param nowMs - current epoch milliseconds.
     */
    function snapshot(nowMs) {
      const parts = beijingParts(nowMs);
      const minuteOfDay = parts.minutes;
      let index = SEGMENTS.findIndex(
        (segment) => minuteOfDay >= segment.start && minuteOfDay < segment.end,
      );
      if (index < 0) index = SEGMENTS.length - 1;
      const segment = SEGMENTS[index];
      const peakDay = isPeakDay(parts);
      const isPeak = peakDay && segment.peak;
      let endAt;
      if (isPeak) {
        endAt = beijingEpoch(parts, segment.end);
      } else if (peakDay && minuteOfDay < PEAK_STARTS[0]) {
        endAt = beijingEpoch(parts, PEAK_STARTS[0]);
      } else if (
        peakDay &&
        minuteOfDay >= 12 * 60 &&
        minuteOfDay < PEAK_STARTS[1]
      ) {
        endAt = beijingEpoch(parts, PEAK_STARTS[1]);
      } else {
        endAt = nextPeakStart(parts);
      }
      const remaining = Math.max(60 * 1000, endAt - nowMs);
      return {
        index,
        segment,
        peakDay,
        isPeak,
        secondsLeft: Math.max(1, Math.ceil(remaining / 1000)),
        endAt,
      };
    }

    /** Render the countdown down to the second. */
    function countdownText(t, secondsLeft) {
      if (secondsLeft < 60) {
        return fill(t("switchInSeconds"), "s", secondsLeft);
      }
      const totalMinutes = Math.floor(secondsLeft / 60);
      const seconds = secondsLeft % 60;
      if (totalMinutes < 60) {
        return fill(
          fill(t("switchInMinutesSeconds"), "m", totalMinutes),
          "s",
          seconds,
        );
      }
      const totalHours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (totalHours < 24) {
        return fill(
          fill(
            fill(t("switchInHoursMinutesSeconds"), "h", totalHours),
            "m",
            minutes,
          ),
          "s",
          seconds,
        );
      }
      const days = Math.floor(totalHours / 24);
      const hours = totalHours % 24;
      return fill(
        fill(
          fill(
            fill(t("switchInDaysHoursMinutesSeconds"), "d", days),
            "h",
            hours,
          ),
          "m",
          minutes,
        ),
        "s",
        seconds,
      );
    }

    /** Latest account balance shared by the poller and the title-bar card. */
    function createBalanceStore() {
      let snapshot = null;
      const listeners = new Set();
      return {
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot() {
          return snapshot;
        },
        publish(next) {
          if (next === null && snapshot === null) return;
          if (
            next !== null &&
            snapshot !== null &&
            next.text === snapshot.text &&
            next.tip === snapshot.tip &&
            next.level === snapshot.level
          ) {
            return;
          }
          snapshot = next;
          for (const listener of listeners) listener();
        },
      };
    }

    const BALANCE = createBalanceStore();

    /** Whole-log token total mirrored from the composer usage projection. */
    function createTokenStore() {
      let snapshot = null;
      const listeners = new Set();
      return {
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot() {
          return snapshot;
        },
        publish(next) {
          if (next === snapshot) return;
          snapshot = next;
          for (const listener of listeners) listener();
        },
      };
    }

    const TOKEN = createTokenStore();

    /** Account-wide token total fetched from the Host platform bridge. */
    const ACCOUNT = createTokenStore();

    /** Whether the title-bar card was collapsed during an earlier visit. */
    function readCollapsed() {
      try {
        return window.localStorage.getItem(COLLAPSED_KEY) === "1";
      } catch {
        return false;
      }
    }

    /** Remember the collapsed state for the next page load. */
    function writeCollapsed(collapsed) {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
      } catch {
        // Storage can be unavailable in restricted webviews; keep the session state only.
      }
    }

    /** Format a Platform balance string with the ¥/$ symbol and two decimals. */
    function formatAmount(value, currency) {
      const symbol = currency === "USD" ? "$" : "¥";
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return symbol + String(value);
      if (numeric > 0 && numeric < 0.01) return symbol + "<0.01";
      return (
        symbol +
        numeric.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    }

    /** Classify the available balance into a color level. */
    function balanceLevel(total, currency) {
      const limits = currency === "USD" ? [2, 1, 0.2] : [10, 5, 1];
      if (total >= limits[0]) return "normal";
      if (total >= limits[1]) return "watch";
      if (total >= limits[2]) return "low";
      return "critical";
    }

    /** Trim trailing zeros from a fixed-point compact unit. */
    function trimUnit(value) {
      const fixed =
        value >= 100
          ? value.toFixed(0)
          : value >= 10
            ? value.toFixed(1)
            : value.toFixed(2);
      return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    }

    /** Compact Chinese-unit token count: 9876 / 1.2万 / 1.4亿 / 1.2万亿. */
    function compactTokens(value) {
      if (value >= 1e12) return trimUnit(value / 1e12) + "万亿";
      if (value >= 1e8) return trimUnit(value / 1e8) + "亿";
      if (value >= 1e4) return trimUnit(value / 1e4) + "万";
      return value.toLocaleString(undefined);
    }

    /** Exact token count with locale digit grouping. */
    function exactTokens(value) {
      return value.toLocaleString(undefined);
    }

    /** Host build version, as carried by the boot manifest. */
    function hostClientVersion() {
      const boot = typeof window === "undefined" ? undefined : window.__DSH_BOOT__;
      const version =
        boot && boot.release ? boot.release.version : undefined;
      return typeof version === "string" && version !== "" ? version : "0.0.0";
    }

    /** Read the account wallet balance; publish null when it is unavailable. */
    async function readAccountBalance(ctx, store, isDisposed) {
      try {
        const result = await ctx.remote.account.getBalance({
          version: hostClientVersion(),
          locale: ctx.locale.getSnapshot().active,
          timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        });
        if (isDisposed()) return;
        if (!result || result.ok !== true || result.value === null) {
          store.publish(null);
          return;
        }
        const wallet = result.value;
        if (!wallet || wallet.status !== "ready") {
          store.publish(null);
          return;
        }
        const wallets = Array.isArray(wallet.value) ? wallet.value : [];
        const bonusWallets = Array.isArray(wallet.bonusWallets)
          ? wallet.bonusWallets
          : [];
        if (wallets.length === 0 && bonusWallets.length === 0) {
          store.publish(null);
          return;
        }
        const currency =
          wallets.length > 0 ? wallets[0].currency : bonusWallets[0].currency;
        const sum = (list) =>
          list
            .filter((entry) => entry.currency === currency)
            .reduce((total, entry) => {
              const numeric = Number(entry.balance);
              return Number.isFinite(numeric) ? total + numeric : total;
            }, 0);
        const recharge = sum(wallets);
        const bonus = sum(bonusWallets);
        const total = recharge + bonus;
        const t = ctx.locale.bind(LOCALE_NS);
        const tip =
          bonus > 0
            ? t("balanceTip") +
              " · " +
              fill(
                fill(
                  t("balanceBreakdown"),
                  "balance",
                  formatAmount(recharge, currency),
                ),
                "bonus",
                formatAmount(bonus, currency),
              )
            : t("balanceTip");
        store.publish({
          text: formatAmount(total, currency),
          tip,
          level: balanceLevel(total, currency),
        });
      } catch {
        if (!isDisposed()) store.publish(null);
      }
    }

    /** Compact account balance chip shown at the right of the title-bar card. */
    function BalanceChip({ t, data }) {
      return h(
        "span",
        {
          className: "dshTariffBalance",
          title: data.tip,
          "data-level": data.level,
        },
        h("span", { className: "dshTariffBalanceLabel" }, t("balanceLabel")),
        h("span", { className: "dshTariffBalanceValue" }, data.text),
      );
    }

    /**
     * Invisible composer-dock entry: mirrors the session's whole-log token
     * usage into the title-bar store without touching the composer layout.
     * @param props - dock props; `useProjection` is the session projection seat.
     */
    function TokenUsageBridge({ useProjection }) {
      const usage =
        typeof useProjection === "function"
          ? useProjection("tokenUsage")
          : undefined;
      const total = usage
        ? ["uncachedInputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"].reduce(
            (sum, key) => sum + (Number(usage[key]) || 0),
            0,
          )
        : 0;
      React.useEffect(() => {
        TOKEN.publish(total > 0 ? total : null);
      }, [total]);
      React.useEffect(() => () => TOKEN.publish(null), []);
      return null;
    }

    /**
     * Token-usage capsule; a long hover (about a second) reveals the exact count.
     * @param props - localized translator, token total, and whether it is the
     * session total or the account-wide total.
     */
    function UsageChip({ t, total, kind }) {
      const isAccount = kind === "account";
      const [tipVisible, setTipVisible] = React.useState(false);
      const timer = React.useRef(null);
      const clearTimer = () => {
        if (timer.current !== null) {
          clearTimeout(timer.current);
          timer.current = null;
        }
      };
      const onEnter = () => {
        clearTimer();
        timer.current = setTimeout(() => setTipVisible(true), 900);
      };
      const onLeave = () => {
        clearTimer();
        setTipVisible(false);
      };
      React.useEffect(() => clearTimer, []);
      return h(
        "span",
        {
          className: "dshTariffUsage",
          role: "status",
          "aria-label":
            (isAccount ? t("accountUsageLabel") : t("usageLabel")) +
            " " +
            exactTokens(total) +
            " tokens",
          onMouseEnter: onEnter,
          onMouseLeave: onLeave,
        },
        h(
          "span",
          { className: "dshTariffUsageLabel" },
          isAccount ? t("accountUsageLabel") : t("usageLabel"),
        ),
        h("span", { className: "dshTariffUsageValue" }, compactTokens(total)),
        tipVisible
          ? h(
              "span",
              { className: "dshTariffUsageTip" },
              fill(
                isAccount ? t("accountUsageTip") : t("usageTip"),
                "count",
                exactTokens(total),
              ),
            )
          : null,
      );
    }

    /** Original gold coin artwork: a peak/valley line struck on a coin. */
    function CoinIcon() {
      return h(
        "svg",
        {
          className: "dshTariffCoin",
          viewBox: "0 0 20 20",
          "aria-hidden": "true",
          focusable: "false",
        },
        h(
          "defs",
          null,
          h(
            "linearGradient",
            { id: "dshTariffCoinGradient", x1: "0", y1: "0", x2: "0", y2: "1" },
            h("stop", { offset: "0%", stopColor: "#ffe28f" }),
            h("stop", { offset: "55%", stopColor: "#f5bf3f" }),
            h("stop", { offset: "100%", stopColor: "#d9941c" }),
          ),
        ),
        h("circle", {
          cx: 10,
          cy: 10,
          r: 8.6,
          fill: "url(#dshTariffCoinGradient)",
        }),
        h("circle", {
          cx: 10,
          cy: 10,
          r: 8.6,
          fill: "none",
          stroke: "#b87c0f",
          strokeOpacity: "0.5",
          strokeWidth: 1,
        }),
        h("path", {
          d: "M5.3 12.6 8.1 8.6l2.3 2.2 4.2-5.2",
          fill: "none",
          stroke: "#6a4a06",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      );
    }

    /** One re-render per second; only the visible minute text changes. */
    function useNow() {
      const [now, setNow] = React.useState(() => new Date());
      React.useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
      }, []);
      return now;
    }

    /** Read the Host account-wide token total; null when the bridge is unavailable. */
    async function readAccountUsageBridge() {
      const response = await fetch("/dsh-tariff/account-usage", {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) return null;
      const payload = await response.json();
      return payload && payload.ok === true && Number.isFinite(payload.total)
        ? payload.total
        : null;
    }

    /**
     * Title-bar status card.
     * @param props - slot props; `t` is the locale-bound translator.
     */
    function TariffBadge({ t }) {
      const now = useNow();
      const [collapsed, setCollapsed] = React.useState(readCollapsed);
      const balance = React.useSyncExternalStore(
        BALANCE.subscribe,
        BALANCE.getSnapshot,
      );
      const tokenTotal = React.useSyncExternalStore(
        TOKEN.subscribe,
        TOKEN.getSnapshot,
      );
      const accountTotal = React.useSyncExternalStore(
        ACCOUNT.subscribe,
        ACCOUNT.getSnapshot,
      );
      React.useEffect(() => {
        let disposed = false;
        const load = async () => {
          try {
            const total = await readAccountUsageBridge();
            if (!disposed) ACCOUNT.publish(total);
          } catch {
            if (!disposed) ACCOUNT.publish(null);
          }
        };
        load();
        const onFocus = () => {
          load();
        };
        window.addEventListener("focus", onFocus);
        const timer = setInterval(load, 10 * 60 * 1000);
        return () => {
          disposed = true;
          clearInterval(timer);
          window.removeEventListener("focus", onFocus);
        };
      }, []);
      const usageTotal = accountTotal !== null ? accountTotal : tokenTotal;
      const usageKind = accountTotal !== null ? "account" : "session";
      const state = snapshot(now.getTime());
      const phase = state.isPeak ? "peak" : "off";
      const phaseText = state.isPeak ? t("peak") : t("off");
      const currentLabel = windowLabel(state.segment);
      const target = state.isPeak ? t("targetOff") : t("targetPeak");
      const countdown =
        countdownText(t, state.secondsLeft) + t("switchTo") + target;
      const noteLead = state.isPeak ? t("notePeakLead") : t("noteOffLead");
      const noteRule = state.isPeak ? t("notePeakRule") : t("noteOffRule");
      const ariaLabel =
        t("brand") +
        " " +
        currentLabel +
        " " +
        phaseText +
        " " +
        countdown +
        " " +
        noteLead +
        " " +
        noteRule +
        (balance === null
          ? ""
          : " " + t("balanceLabel") + " " + balance.text) +
        (usageTotal === null
          ? ""
          : " " +
            (usageKind === "account"
              ? t("accountUsageLabel")
              : t("usageLabel")) +
            " " +
            compactTokens(usageTotal));

      return h(
        "div",
        { className: "dshTariffSeat" },
        h(
          "div",
          {
            className: "dshTariff",
            "data-phase": phase,
            "data-collapsed": collapsed ? "true" : undefined,
            role: "status",
            "aria-live": "polite",
            "aria-label": ariaLabel,
          },
          h(
            "div",
            { className: "dshTariffRow" },
          h(
            "span",
            { className: "dshTariffBrand" },
            h(CoinIcon),
            h("span", { className: "dshTariffBrandText" }, t("brand")),
          ),
          h(
            "span",
            { className: "dshTariffSegments" },
            SEGMENTS.map((segment, index) =>
              h(
                "span",
                {
                  key: index,
                  className: "dshTariffSeg",
                  "data-peak":
                    state.peakDay && segment.peak ? "true" : undefined,
                  "data-current": index === state.index ? "true" : undefined,
                },
                index === state.index
                  ? windowLabel(segment) + " · " + phaseText
                  : windowLabel(segment),
              ),
            ),
          ),
          h(
            "span",
            {
              className: "dshTariffStatus",
              "data-target": state.isPeak ? "off" : "peak",
            },
            h(
              "svg",
              {
                className: "dshTariffClock",
                viewBox: "0 0 16 16",
                "aria-hidden": "true",
                focusable: "false",
              },
              h("circle", {
                cx: 8,
                cy: 8,
                r: 5.6,
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.4,
              }),
              h("path", {
                d: "M8 4.8V8l2.3 1.4",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.4,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              }),
            ),
            h("span", { className: "dshTariffCountdown" }, countdown),
          ),
          h(
            "button",
            {
              type: "button",
              className: "dshTariffToggle",
              "aria-label": collapsed ? t("expand") : t("collapse"),
              "aria-expanded": collapsed ? "false" : "true",
              title: collapsed ? t("expand") : t("collapse"),
              onClick: () => {
                const next = !collapsed;
                setCollapsed(next);
                writeCollapsed(next);
              },
            },
            h(
              "svg",
              { viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" },
              h("path", {
                d: "M4 9.5 8 5.5 12 9.5",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.5,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              }),
            ),
          ),
        ),
        h(
          "div",
          { className: "dshTariffBottom" },
          balance === null ? null : h(BalanceChip, { t, data: balance }),
          tokenTotal === null && accountTotal === null
            ? null
            : h(UsageChip, {
                t,
                total: usageTotal,
                kind: usageKind,
              }),
          h(
            "div",
            { className: "dshTariffNote" },
            h("span", { className: "dshTariffNoteStatus" }, noteLead),
            h("span", { className: "dshTariffNoteRule" }, noteRule),
          ),
        ),
        ),
      );
    }

    /** Mount the plugin stylesheet once; return the removal cleanup. */
    function mountStyles() {
      const selector = 'style[data-plugin-css="' + CSS_ID + '"]';
      if (document.querySelector(selector) !== null) return () => {};
      const tag = document.createElement("style");
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(LOCALE_NS, { zh, en }),
          "tariff-titlebar: dictionaries",
        );
        ctx.effect(mountStyles, "tariff-titlebar: stylesheet");
        ctx.inject(["remote", "remote.account"], (remoteCtx) => {
          remoteCtx.effect(() => {
            let disposed = false;
            const read = () => {
              void readAccountBalance(remoteCtx, BALANCE, () => disposed);
            };
            read();
            const timer = setInterval(read, 60 * 1000);
            const onFocus = () => read();
            const onVisibility = () => {
              if (document.visibilityState === "visible") read();
            };
            window.addEventListener("focus", onFocus);
            document.addEventListener("visibilitychange", onVisibility);
            return () => {
              disposed = true;
              clearInterval(timer);
              window.removeEventListener("focus", onFocus);
              document.removeEventListener("visibilitychange", onVisibility);
            };
          }, "tariff-titlebar: account balance");
        });
        ctx.slots.inject("shell.overlay", () =>
          ctx.slots.register(
            {
              name: "shell.overlay",
              id: "tariff-titlebar",
              order: 10,
              locale: LOCALE_NS,
            },
            TariffBadge,
          ),
        );
        ctx.slots.inject("conversation.composer.dock", () =>
          ctx.slots.register(
            {
              name: "conversation.composer.dock",
              id: "tariff-token-bridge",
              order: 500,
            },
            TokenUsageBridge,
          ),
        );
      },
    };
  },
});
