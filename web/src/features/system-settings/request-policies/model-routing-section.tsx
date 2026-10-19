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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'

import { useSystemOptions } from '../hooks/use-system-options'
import { useUpdateOption } from '../hooks/use-update-option'
import { SettingsCard } from '../components/settings-card'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { ModelRoutingList } from './model-routing'
import {
  parseRoutes,
  routesEqual,
  serializeRoutes,
  validateRoutes,
} from './model-routing/lib/routes'

const MODEL_ROUTES_OPTION_KEY = 'model_route_setting.routes'

export function ModelRoutingSection() {
  const { t } = useTranslation()
  const query = useSystemOptions()
  if (query.isPending) return <LoadingState />
  if (query.isError) {
    return (
      <ErrorState
        title={t('Failed to load settings')}
        onRetry={() => void query.refetch()}
      />
    )
  }
  const options = query.data?.data ?? []
  const serverValue =
    options.find((option) => option.key === MODEL_ROUTES_OPTION_KEY)?.value ??
    '[]'
  return <ModelRoutingEditor serverValue={serverValue} />
}

function ModelRoutingEditor(props: { serverValue: string }) {
  const { t } = useTranslation()
  const mutation = useUpdateOption()
  const [routesJson, setRoutesJson] = useState(props.serverValue)
  const dirty = !routesEqual(routesJson, props.serverValue)

  // Follow server refreshes while the editor has no local edits.
  useEffect(() => {
    if (!dirty) setRoutesJson(props.serverValue)
  }, [props.serverValue, dirty])

  const save = async () => {
    const routes = parseRoutes(routesJson)
    const error = validateRoutes(routes, t)
    if (error) {
      toast.error(error)
      return
    }
    try {
      await mutation.mutateAsync({
        key: MODEL_ROUTES_OPTION_KEY,
        value: serializeRoutes(routes),
      })
    } catch {
      // Failure feedback is handled by the mutation's onError.
    }
  }

  return (
    <SettingsCard
      title={t('Model routing')}
      description={t(
        'Publish an alias model name that routes to different real models across channels. Retries, weights, and priorities follow channel settings.'
      )}
      className='shadow-none'
    >
      <SettingsPageFormActions
        onSave={() => void save()}
        isSaving={mutation.isPending}
        isSaveDisabled={!dirty}
      />
      <ModelRoutingList routesJson={routesJson} onRoutesChange={setRoutesJson} />
    </SettingsCard>
  )
}
