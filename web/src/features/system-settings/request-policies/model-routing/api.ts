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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { ModelRoute } from './types'

export interface ModelRouteTargetSummary {
  model: string
  tag?: string
  weight?: number
  channel_count: number
}

export interface ModelRouteTestChannel {
  channel_id: number
  channel_name: string
  channel_group: string
  tag?: string
  priority: number
  weight: number
  enabled: boolean
  target_model: string
}

export interface ModelRouteTestResult {
  route: ModelRoute
  targets: ModelRouteTargetSummary[]
  channels: ModelRouteTestChannel[]
  groups: string[]
}

export interface ModelRoutePick {
  channel_id: number
  channel_name: string
  target_model: string
  count: number
}

export interface ModelRouteSimulateResult {
  group: string
  times: number
  picks: ModelRoutePick[]
  misses: number
}

type ApiResponse<T> = { success: boolean; message?: string; data: T }

export async function testModelRoute(name: string): Promise<ModelRouteTestResult> {
  const response = await api.get<ApiResponse<ModelRouteTestResult>>(
    '/api/model_route/test',
    { params: { name } }
  )
  return requireServerSuccess(response.data).data
}

export async function simulateModelRoute(
  name: string,
  group: string,
  times = 10
): Promise<ModelRouteSimulateResult> {
  const response = await api.get<ApiResponse<ModelRouteSimulateResult>>(
    '/api/model_route/simulate',
    { params: { name, group, times } }
  )
  return requireServerSuccess(response.data).data
}

/** Sends one real chat request through the playground endpoint using the
 * route alias as the model name, so it flows through routing/rewrite. */
export async function sendRouteRealRequest(
  alias: string,
  group?: string
): Promise<Record<string, unknown>> {
  const response = await api.post('/pg/chat/completions', {
    model: alias,
    ...(group ? { group } : {}),
    messages: [{ role: 'user', content: 'Hi' }],
    max_tokens: 16,
    stream: false,
  })
  return response.data as Record<string, unknown>
}

export function extractChatRequestError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const data = (error as { response?: { data?: { error?: { message?: string }; message?: string } } })
      .response?.data
    if (data?.error?.message) return data.error.message
    if (data?.message) return data.message
  }
  return error instanceof Error ? error.message : String(error)
}

export function extractChatContent(completion: Record<string, unknown>): string {
  const choices = completion.choices as
    | Array<{ message?: { content?: unknown } }>
    | undefined
  const content = choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'object' && part !== null && 'text' in part
          ? String((part as { text: unknown }).text)
          : ''
      )
      .join('')
  }
  return JSON.stringify(completion.choices ?? completion, null, 2)
}
