/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/** 毫秒 → 人读时长:<1s 显示 ms,否则显示 s(一位小数) */
export function formatDurationMs(ms?: number | null): string {
  if (ms === undefined || ms === null || ms <= 0) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** 吞吐 = 补全 tokens / 秒 */
export function formatThroughput(
  completionTokens?: number | null,
  useTimeMs?: number | null
): string {
  if (!completionTokens || !useTimeMs || useTimeMs <= 0) return '-'
  const tps = completionTokens / (useTimeMs / 1000)
  if (tps < 10) return `${tps.toFixed(1)} tok/s`
  return `${Math.round(tps)} tok/s`
}
