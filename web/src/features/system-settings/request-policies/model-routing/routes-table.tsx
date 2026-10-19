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
import {
  Edit,
  FlaskConical,
  Plus,
  Route,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  DataTableRowActionMenu,
  StaticDataTable,
  TruncatedCell,
} from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import type { ModelRoute } from './types'

interface RoutesTableProps {
  routes: ModelRoute[]
  onEdit: (route: ModelRoute) => void
  onDelete: (route: ModelRoute) => void
  onEnabledChange: (route: ModelRoute, enabled: boolean) => void
  onAdd: () => void
  onTest: (route: ModelRoute) => void
}

export function RoutesTable(props: RoutesTableProps) {
  const { t } = useTranslation()

  if (props.routes.length === 0) {
    return (
      <EmptyState
        icon={Route}
        title={t('No routes yet')}
        description={t(
          'Publish an alias model name that resolves to real models across channels.'
        )}
        className='min-h-56'
        action={
          <Button variant='outline' onClick={props.onAdd}>
            <Plus aria-hidden='true' />
            {t('Add Route')}
          </Button>
        }
      />
    )
  }

  return (
    <StaticDataTable
      className='focus-visible:outline-ring overflow-x-auto rounded-none border-0 focus-visible:-outline-offset-2'
      containerProps={{
        role: 'region',
        'aria-label': t('Model routes table'),
        tabIndex: 0,
      }}
      tableProps={{ withContainer: false }}
      tableClassName='min-w-[720px] table-fixed [&_th]:px-4 [&_th]:text-muted-foreground [&_td]:px-4 [&_td]:py-4'
      headerRowClassName='bg-muted/35 hover:bg-muted/35'
      data={props.routes}
      getRowKey={(route) => route.name}
      columns={[
        {
          id: 'name',
          header: t('Name'),
          className: 'w-[24%]',
          cell: (route) => (
            <div className='flex min-w-0 flex-col gap-1.5'>
              <TruncatedCell tabIndex={0}>{route.name || '—'}</TruncatedCell>
              {route.remark ? (
                <span
                  data-table-text='secondary'
                  className='text-muted-foreground min-w-0'
                >
                  <TruncatedCell tabIndex={0}>{route.remark}</TruncatedCell>
                </span>
              ) : null}
            </div>
          ),
        },
        {
          id: 'targets',
          header: t('Targets'),
          className: 'w-[52%]',
          cell: (route) => (
            <div className='flex min-w-0 flex-wrap gap-1.5'>
              {route.targets.map((target) => (
                <Badge
                  key={JSON.stringify(target)}
                  variant='secondary'
                  className='shrink-0 gap-1'
                >
                  <code className='font-mono'>{target.model || '—'}</code>
                  {target.tag ? (
                    <span className='text-muted-foreground'>
                      @{target.tag}
                    </span>
                  ) : null}
                  {target.weight ? <span>×{target.weight}</span> : null}
                </Badge>
              ))}
              {route.targets.length === 0 ? (
                <span className='text-muted-foreground'>—</span>
              ) : null}
            </div>
          ),
        },
        {
          id: 'enabled',
          header: t('Enabled'),
          className: 'w-24',
          cell: (route) => (
            <Switch
              aria-label={t('Enable model route {{name}}', { name: route.name })}
              checked={route.enabled}
              onCheckedChange={(checked) =>
                props.onEnabledChange(route, checked)
              }
            />
          ),
        },
        {
          id: 'actions',
          header: t('Actions'),
          className: 'w-24 text-right',
          cell: (route) => (
            <div
              role='group'
              aria-label={t('Actions for {{name}}', { name: route.name })}
              className='flex items-center justify-end gap-0.5'
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={t('Edit Route')}
                      onClick={() => props.onEdit(route)}
                    >
                      <Edit aria-hidden='true' />
                    </Button>
                  }
                />
                <TooltipContent>{t('Edit Route')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant='ghost'
                      size='icon'
                      aria-label={t('Test Route')}
                      onClick={() => props.onTest(route)}
                    >
                      <FlaskConical aria-hidden='true' />
                    </Button>
                  }
                />
                <TooltipContent>{t('Test Route')}</TooltipContent>
              </Tooltip>
              <DataTableRowActionMenu ariaLabel={t('More actions')}>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant='destructive'
                    onClick={() => props.onDelete(route)}
                  >
                    <Trash2 aria-hidden='true' />
                    {t('Delete Route')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DataTableRowActionMenu>
            </div>
          ),
        },
      ]}
    />
  )
}
