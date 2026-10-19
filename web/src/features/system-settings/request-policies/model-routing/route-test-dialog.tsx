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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { StaticDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import { Separator } from '@/components/ui/separator'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import {
  extractChatContent,
  extractChatRequestError,
  sendRouteRealRequest,
  simulateModelRoute,
  testModelRoute,
  type ModelRouteSimulateResult,
} from './api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  routeName: string | null
}

interface RealRequestState {
  pending: boolean
  elapsed?: number
  completion?: Record<string, unknown>
  error?: string
}

export function RouteTestDialog(props: Props) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)

  const query = useQuery({
    queryKey: ['model-route-test', props.routeName],
    queryFn: () => testModelRoute(props.routeName ?? ''),
    enabled: props.open && !!props.routeName,
  })

  const groups = query.data?.groups ?? []
  const [group, setGroup] = useState('')
  useEffect(() => {
    setGroup(groups[0] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data])

  const [simulating, setSimulating] = useState(false)
  const [simulateResult, setSimulateResult] =
    useState<ModelRouteSimulateResult | null>(null)
  const [simulateError, setSimulateError] = useState<string | null>(null)

  const [realRequest, setRealRequest] = useState<RealRequestState>({
    pending: false,
  })

  const unmatchedTargets = (query.data?.targets ?? []).filter(
    (target) => target.channel_count === 0
  )

  const runSimulate = async () => {
    if (!props.routeName || !group) return
    setSimulating(true)
    setSimulateError(null)
    try {
      setSimulateResult(await simulateModelRoute(props.routeName, group, 10))
    } catch (error) {
      setSimulateResult(null)
      setSimulateError(
        error instanceof Error ? error.message : t('Failed to test route')
      )
    } finally {
      setSimulating(false)
    }
  }

  const runRealRequest = async () => {
    if (!props.routeName) return
    setRealRequest({ pending: true })
    const startedAt = Date.now()
    try {
      const completion = await sendRouteRealRequest(
        props.routeName,
        group || undefined
      )
      setRealRequest({
        pending: false,
        completion,
        elapsed: Date.now() - startedAt,
      })
    } catch (error) {
      setRealRequest({
        pending: false,
        error: extractChatRequestError(error),
        elapsed: Date.now() - startedAt,
      })
    }
  }

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
      {query.isPending && <LoadingState />}
      {query.isError && (
        <ErrorState
          title={t('Failed to test route')}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && (
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

          <Separator />

          <div className='space-y-2'>
            <h4 className='text-sm font-medium'>{t('Simulate selection')}</h4>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Runs the real channel selection {{times}} times and tallies the winners.'
              )}
            </p>
            {groups.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t('No available group')}
              </p>
            ) : (
              <div className='flex flex-wrap items-center gap-2'>
                <NativeSelect
                  aria-label={t('Groups')}
                  className='w-[220px]'
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                >
                  {groups.map((candidate) => (
                    <NativeSelectOption key={candidate} value={candidate}>
                      {candidate}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => void runSimulate()}
                  disabled={simulating || !group}
                >
                  {t('Simulate {{times}} picks', { times: 10 })}
                </Button>
              </div>
            )}
            {simulateError ? (
              <p role='alert' className='text-destructive text-sm'>
                {simulateError}
              </p>
            ) : null}
            {simulateResult ? (
              <div className='space-y-2'>
                {simulateResult.misses > 0 ? (
                  <p className='text-amber-600 text-xs dark:text-amber-400'>
                    {t('{{misses}} / {{times}} picks found no channel', {
                      misses: simulateResult.misses,
                      times: simulateResult.times,
                    })}
                  </p>
                ) : null}
                <StaticDataTable
                  containerProps={{
                    role: 'region',
                    'aria-label': t('Simulate selection'),
                  }}
                  tableProps={{ withContainer: false }}
                  tableClassName='min-w-[480px] table-fixed [&_th]:px-3 [&_th]:text-muted-foreground [&_td]:px-3 [&_td]:py-2.5'
                  headerRowClassName='bg-muted/35 hover:bg-muted/35'
                  data={simulateResult.picks}
                  getRowKey={(pick) => pick.channel_id}
                  columns={[
                    {
                      id: 'channel',
                      header: t('Channel'),
                      className: 'w-[36%]',
                      cell: (pick) => (
                        <span className='block truncate' title={pick.channel_name}>
                          {pick.channel_name}
                        </span>
                      ),
                    },
                    {
                      id: 'target',
                      header: t('Response model'),
                      className: 'w-[36%]',
                      cell: (pick) => <code className='font-mono'>{pick.target_model}</code>,
                    },
                    {
                      id: 'count',
                      header: t('Count'),
                      className: 'w-[28%] tabular-nums',
                      cell: (pick) =>
                        `${formatNumber(pick.count, locale)} / ${formatNumber(simulateResult.times, locale)}`,
                    },
                  ]}
                />
              </div>
            ) : null}
          </div>

          <Separator />

          <div className='space-y-2'>
            <h4 className='text-sm font-medium'>{t('Real request test')}</h4>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Sends one real chat request with the alias as the model name and is billed to your account. The response model shows the rewrite result.'
              )}
            </p>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => void runRealRequest()}
                disabled={realRequest.pending || (groups.length === 0 && !!query.data)}
              >
                {t('Send real request')}
              </Button>
              {realRequest.pending ? (
                <span className='text-muted-foreground text-sm'>
                  {t('Requesting...')}
                </span>
              ) : null}
            </div>
            {realRequest.elapsed !== undefined ? (
              <p className='text-muted-foreground text-xs'>
                {t('Latency')}: {formatNumber(realRequest.elapsed, locale)} ms
              </p>
            ) : null}
            {realRequest.error ? (
              <Alert variant='destructive'>
                <AlertDescription>
                  {t('Request failed')}: {realRequest.error}
                </AlertDescription>
              </Alert>
            ) : null}
            {realRequest.completion ? (
              <div className='grid gap-2'>
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  <Badge variant='default'>{t('Success')}</Badge>
                  <span className='text-muted-foreground'>
                    {t('Response model')}:{' '}
                    <code className='font-mono'>
                      {String(realRequest.completion.model ?? '—')}
                    </code>
                  </span>
                </div>
                <Input
                  readOnly
                  aria-label={t('Response content')}
                  value={extractChatContent(realRequest.completion).slice(0, 200)}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}
