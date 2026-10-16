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
import { t } from 'i18next'

import type { ApiResponse } from '@/features/profile/types'
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

/** 请求详情记录元信息(列表返回,不含请求/响应体) */
export interface RequestDetail {
  id: number
  created_at: number
  request_id: string
  user_id: number
  username: string
  token_id: number
  token_name: string
  channel_id: number
  model_name: string
  endpoint: string
  is_stream: boolean
  status_code: number
  use_time: number
  truncated: boolean
  /** 精细耗时(ms):总耗时 / 首次响应 / 上游请求 */
  use_time_ms?: number
  first_response_ms?: number
  upstream_ms?: number
  /** token 用量来自同 request_id 的消费日志,无关联日志时为 0 */
  prompt_tokens?: number
  completion_tokens?: number
}

/** 单条完整记录,含请求体/响应体 */
export interface RequestDetailBody extends RequestDetail {
  request_body: string
  response_body: string
}

export interface RequestDetailFilters {
  p: number
  page_size: number
  request_id?: string
  user_id?: number
  token_name?: string
  channel_id?: number
  model_name?: string
  start_timestamp?: number
  end_timestamp?: number
}

export async function getRequestDetails(
  params: RequestDetailFilters
): Promise<{ items: RequestDetail[]; total: number }> {
  const response = await api.get<ApiResponse<RequestDetail[]>>(
    '/api/request_detail/',
    { params }
  )
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load records'))
  }
  // 后端分页返回 items + total 的 pageInfo 结构
  const payload = response.data.data as unknown as {
    items: RequestDetail[]
    total: number
  }
  return { items: payload.items ?? [], total: payload.total ?? 0 }
}

export async function getRequestDetailBody(
  id: number
): Promise<RequestDetailBody> {
  const response = await api.get<ApiResponse<RequestDetailBody>>(
    `/api/request_detail/${id}`
  )
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load records'))
  }
  return response.data.data
}
