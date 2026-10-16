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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { TruncatedCell } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import dayjs from '@/lib/dayjs'

import type { RequestDetail } from '../api'
import { formatDurationMs } from '../lib/format'
import { RequestDetailBodyDialog } from './request-detail-body-dialog'

export function useRequestDetailColumns(): ColumnDef<RequestDetail>[] {
  const { t } = useTranslation()
  return useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: t('Time'),
        size: 170,
        cell: ({ row }) => (
          <span className='font-mono tabular-nums'>
            {dayjs.unix(row.original.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </span>
        ),
        meta: { label: t('Time'), mobileTitle: true },
      },
      {
        accessorKey: 'model_name',
        header: t('Model'),
        size: 160,
        cell: ({ row }) => (
          <TruncatedCell>{row.original.model_name || '-'}</TruncatedCell>
        ),
        meta: { label: t('Model') },
      },
      {
        accessorKey: 'endpoint',
        header: t('Endpoint'),
        size: 200,
        cell: ({ row }) => (
          <TruncatedCell>{row.original.endpoint || '-'}</TruncatedCell>
        ),
        meta: { label: t('Endpoint') },
      },
      {
        accessorKey: 'channel_id',
        header: t('Channel'),
        size: 80,
        cell: ({ row }) => <span>{row.original.channel_id || '-'}</span>,
        meta: { label: t('Channel') },
      },
      {
        accessorKey: 'username',
        header: t('Username'),
        size: 110,
        cell: ({ row }) => (
          <TruncatedCell>
            {row.original.username || String(row.original.user_id || '-')}
          </TruncatedCell>
        ),
        meta: { label: t('Username') },
      },
      {
        accessorKey: 'token_name',
        header: t('Token'),
        size: 120,
        cell: ({ row }) => (
          <TruncatedCell>{row.original.token_name || '-'}</TruncatedCell>
        ),
        meta: { label: t('Token') },
      },
      {
        accessorKey: 'status_code',
        header: t('Status'),
        size: 90,
        cell: ({ row }) => {
          const code = row.original.status_code
          const ok = code >= 200 && code < 300
          return (
            <StatusBadge
              label={String(code || '-')}
              variant={ok ? 'success' : 'danger'}
            />
          )
        },
        meta: { label: t('Status') },
      },
      {
        accessorKey: 'is_stream',
        header: t('Stream'),
        size: 70,
        cell: ({ row }) =>
          row.original.is_stream ? (
            <Badge variant='secondary'>{t('Stream')}</Badge>
          ) : (
            <span>-</span>
          ),
        meta: { label: t('Stream') },
      },
      {
        accessorKey: 'use_time',
        header: t('Duration'),
        size: 90,
        cell: ({ row }) => (
          <span className='font-mono tabular-nums'>
            {formatDurationMs(row.original.use_time_ms ?? (row.original.use_time > 0 ? row.original.use_time * 1000 : null))}
          </span>
        ),
        meta: { label: t('Duration') },
      },
      {
        accessorKey: 'completion_tokens',
        header: t('Tokens'),
        size: 110,
        cell: ({ row }) => {
          const { prompt_tokens, completion_tokens } = row.original
          if (!prompt_tokens && !completion_tokens) {
            return <span>-</span>
          }
          return (
            <span className='font-mono tabular-nums' title={`${t('Prompt Tokens')} ${prompt_tokens ?? 0} / ${t('Completion Tokens')} ${completion_tokens ?? 0}`}>
              {prompt_tokens ?? 0}/{completion_tokens ?? 0}
            </span>
          )
        },
        meta: { label: t('Tokens') },
      },
      {
        id: 'actions',
        header: '',
        size: 90,
        enableSorting: false,
        cell: ({ row }) => <RequestDetailBodyDialog entry={row.original} />,
        meta: { label: t('Details') },
      },
    ],
    [t]
  )
}
