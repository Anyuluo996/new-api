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
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { StaticDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { testModelRoute } from './api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  routeName: string | null
}

export function RouteTestDialog(props: Props) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const query = useQuery({
    queryKey: ['model-route-test', props.routeName],
    queryFn: () => testModelRoute(props.routeName ?? ''),
    enabled: props.open && !!props.routeName,
  })

  const unmatchedTargets = (query.data?.targets ?? []).filter(
    (target) => target.channel_count === 0
  )

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Test Route')}
      description={props.routeName ?? undefined}
      contentClassName='sm:max-w-3xl'
      contentHeight='auto'
      footer={
        <Button
          type='button'
          variant='outline'
          onClick={() => props.onOpenChange(false)}
        >
          {t('Close')}
        </Button>
      }
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          title={t('Failed to test route')}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className='min-w-0 space-y-4'>
          {unmatchedTargets.length > 0 ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {t(
                  '{{count}} target(s) matched no channel; requests for this alias skip them.',
                  { count: unmatchedTargets.length }
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className='space-y-2'>
            <h4 className='text-sm font-medium'>{t('Targets')}</h4>
            <div className='flex min-w-0 flex-wrap gap-2'>
              {(query.data?.targets ?? []).map((target) => (
                <Badge
                  key={`${target.model}:${target.tag ?? ''}`}
                  variant={target.channel_count > 0 ? 'secondary' : 'outline'}
                  className='gap-1.5'
                >
                  <code className='font-mono'>{target.model}</code>
                  {target.tag ? (
                    <span className='text-muted-foreground'>@{target.tag}</span>
                  ) : null}
                  {target.weight ? <span>×{target.weight}</span> : null}
                  <span className='text-muted-foreground'>
                    {formatNumber(target.channel_count, locale)}
                  </span>
                </Badge>
              ))}
            </div>
          </div>

          <div className='space-y-2'>
            <h4 className='text-sm font-medium'>{t('Matched channels')}</h4>
            <StaticDataTable
              containerProps={{
                role: 'region',
                'aria-label': t('Matched channels'),
              }}
              tableProps={{ withContainer: false }}
              tableClassName='min-w-[640px] table-fixed [&_th]:px-3 [&_th]:text-muted-foreground [&_td]:px-3 [&_td]:py-2.5'
              headerRowClassName='bg-muted/35 hover:bg-muted/35'
              data={query.data?.channels ?? []}
              getRowKey={(channel) => channel.channel_id}
              columns={[
                {
                  id: 'channel',
                  header: t('Channel'),
                  className: 'w-[22%]',
                  cell: (channel) => (
                    <span className='block truncate' title={channel.channel_name}>
                      {channel.channel_name}
                    </span>
                  ),
                },
                {
                  id: 'groups',
                  header: t('Groups'),
                  className: 'w-[18%]',
                  cell: (channel) => (
                    <span
                      className='block truncate text-muted-foreground'
                      title={channel.channel_group}
                    >
                      {channel.channel_group}
                    </span>
                  ),
                },
                {
                  id: 'target',
                  header: t('Target model'),
                  className: 'w-[22%]',
                  cell: (channel) => <code className='font-mono'>{channel.target_model}</code>,
                },
                {
                  id: 'weight',
                  header: t('Weight'),
                  className: 'w-20 tabular-nums',
                  cell: (channel) => formatNumber(channel.weight, locale),
                },
                {
                  id: 'priority',
                  header: t('Priority'),
                  className: 'w-20 tabular-nums',
                  cell: (channel) => formatNumber(channel.priority, locale),
                },
                {
                  id: 'status',
                  header: t('Status'),
                  className: 'w-24',
                  cell: (channel) => (
                    <Badge variant={channel.enabled ? 'default' : 'outline'}>
                      {channel.enabled ? t('Enabled') : t('Disabled')}
                    </Badge>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}
    </Dialog>
  )
}
