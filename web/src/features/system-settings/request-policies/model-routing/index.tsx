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
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { parseRoutes, serializeRoutes } from './lib/routes'
import { RouteEditorDialog } from './route-editor-dialog'
import { RoutesTable } from './routes-table'
import type { ModelRoute } from './types'

interface Props {
  routesJson: string
  onRoutesChange: (routesJson: string) => void
}

export function ModelRoutingList(props: Props) {
  const { t } = useTranslation()
  const routes = useMemo(() => parseRoutes(props.routesJson), [props.routesJson])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<ModelRoute | null>(null)
  const [deletingRoute, setDeletingRoute] = useState<ModelRoute | null>(null)

  const openEditor = (route: ModelRoute | null) => {
    setEditingRoute(route)
    setEditorOpen(true)
  }

  const handleRouteSave = (route: ModelRoute) => {
    const index = routes.findIndex(
      (item) => item.name === editingRoute?.name
    )
    const next = [...routes]
    if (index >= 0) next[index] = route
    else next.push(route)
    props.onRoutesChange(serializeRoutes(next))
    setEditingRoute(null)
  }

  return (
    <>
      <section
        aria-label={t('Model routes')}
        className='bg-card min-w-0 overflow-hidden rounded-xl border'
      >
        <div className='flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-5'>
          <div className='flex flex-col gap-1.5'>
            <div className='flex items-center gap-2'>
              <h3 className='text-base font-semibold'>{t('Model routes')}</h3>
              <Badge variant='secondary' className='tabular-nums'>
                {routes.length}
              </Badge>
            </div>
            <p className='text-muted-foreground text-sm'>
              {t(
                'One alias name served by several real models across channels.'
              )}
            </p>
          </div>
          <Button variant='outline' onClick={() => openEditor(null)}>
            <Plus aria-hidden='true' data-icon='inline-start' />
            {t('Add Route')}
          </Button>
        </div>
        <div className='px-4 py-4 sm:px-5'>
          <RoutesTable
            routes={routes}
            onEdit={openEditor}
            onDelete={setDeletingRoute}
            onEnabledChange={(route, enabled) => {
              const index = routes.findIndex((item) => item.name === route.name)
              if (index < 0) return
              const next = [...routes]
              next[index] = { ...route, enabled }
              props.onRoutesChange(serializeRoutes(next))
            }}
            onAdd={() => openEditor(null)}
          />
        </div>
      </section>

      {deletingRoute !== null && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeletingRoute(null)}
          title={t('Delete Route')}
          desc={t(
            'Delete model route “{{name}}”? Save your changes to apply the removal.',
            { name: deletingRoute.name }
          )}
          confirmText={t('Delete Route')}
          handleConfirm={() => {
            props.onRoutesChange(
              serializeRoutes(
                routes.filter((route) => route.name !== deletingRoute.name)
              )
            )
            setDeletingRoute(null)
          }}
          destructive
        />
      )}

      <RouteEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        route={editingRoute}
        existingNames={
          editingRoute
            ? routes
                .filter((route) => route.name !== editingRoute.name)
                .map((route) => route.name)
            : routes.map((route) => route.name)
        }
        onSave={handleRouteSave}
      />
    </>
  )
}
