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
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { CopyButton } from '@/components/copy-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getRequestDetailBody, type RequestDetail } from '../api'

function BodyPanel(props: { title: string; body: string }) {
  return (
    <div className='min-w-0 space-y-1'>
      <div className='flex items-center justify-between gap-2'>
        <h4 className='text-sm font-medium'>{props.title}</h4>
        <CopyButton value={props.body} />
      </div>
      <pre className='bg-muted max-h-72 overflow-auto rounded-md p-2 font-mono text-xs break-all whitespace-pre-wrap'>
        {props.body || '-'}
      </pre>
    </div>
  )
}

function formatBody(raw: string) {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function RequestDetailBodyDialog(props: { entry: RequestDetail }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['request-detail-body', props.entry.id],
    queryFn: async () =>
      requireServerSuccess(await getRequestDetailBody(props.entry.id)),
    // 请求/响应体较大,打开弹窗时才拉取
    enabled: open,
    retry: false,
  })

  let content: React.ReactNode = null
  if (query.isError) {
    content = (
      <Alert variant='destructive'>
        <AlertDescription className='flex items-center justify-between gap-2'>
          <span>{t('Failed to load records')}</span>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void query.refetch()}
          >
            {t('Retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else if (query.data) {
    content = (
      <>
        <div className='flex flex-wrap items-center gap-2 text-muted-foreground text-xs'>
          <span className='font-mono'>#{query.data.id}</span>
          <span className='font-mono break-all'>
            {query.data.request_id || '-'}
          </span>
          {query.data.truncated && (
            <span className='text-destructive'>
              {t('Body truncated (exceeded size limit)')}
            </span>
          )}
        </div>
        <BodyPanel
          title={t('Request Body')}
          body={formatBody(query.data.request_body)}
        />
        <BodyPanel
          title={t('Response Body')}
          body={formatBody(query.data.response_body)}
        />
      </>
    )
  } else if (open) {
    content = (
      <div className='space-y-2'>
        <Skeleton className='h-4 w-full' />
        <Skeleton className='h-40 w-full' />
      </div>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('Request Details')}
      description={t('View the complete details for this log entry')}
      descriptionClassName='sr-only'
      trigger={
        <Button variant='ghost' size='sm' className='h-7 px-2'>
          {t('Details')}
        </Button>
      }
      contentClassName='min-w-0 sm:max-w-3xl max-sm:max-h-(--dialog-available-height) max-sm:w-[calc(100vw-1.5rem)] max-sm:max-w-[calc(100vw-1.5rem)]'
      titleClassName='text-base'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      {content}
    </Dialog>
  )
}
