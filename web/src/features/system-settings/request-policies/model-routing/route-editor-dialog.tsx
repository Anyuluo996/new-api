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
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { ComboboxInput } from '@/components/ui/combobox-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { getEnabledModels } from '@/features/channels/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { SettingsSwitchField } from '../../components/settings-form-layout'
import { isKnownModel } from './lib/routes'
import type { ModelRoute, ModelRouteTarget } from './types'

type TargetRow = ModelRouteTarget & {
  rowId: string
}

const ROUTE_FORM_ID = 'model-route-form'

interface RouteFormValues {
  name: string
  remark: string
  enabled: boolean
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  route: ModelRoute | null
  existingNames: string[]
  onSave: (route: ModelRoute) => void
}

export function RouteEditorDialog(props: Props) {
  const { t } = useTranslation()
  const isEdit = !!props.route
  const nextTargetRowId = useRef(0)
  const createTargetRow = (target?: ModelRouteTarget): TargetRow => ({
    model: target?.model ?? '',
    tag: target?.tag,
    rowId: String(nextTargetRowId.current++),
  })
  const [targets, setTargets] = useState<TargetRow[]>(() => [
    createTargetRow(),
  ])

  const modelsQuery = useQuery({
    queryKey: ['enabled-models'],
    queryFn: async () => requireServerSuccess(await getEnabledModels()),
    enabled: props.open,
  })
  const enabledModels = useMemo(
    () => modelsQuery.data?.data ?? [],
    [modelsQuery.data]
  )
  const modelOptions = useMemo(
    () => enabledModels.map((model) => ({ value: model, label: model })),
    [enabledModels]
  )

  const form = useForm<RouteFormValues>({
    defaultValues: {
      name: '',
      remark: '',
      enabled: true,
    },
  })
  const nameMatchesModel = isKnownModel(form.watch('name'), enabledModels)

  useEffect(() => {
    if (!props.open) return
    form.reset({
      name: props.route?.name ?? '',
      remark: props.route?.remark ?? '',
      enabled: props.route?.enabled ?? true,
    })
    const rows = (props.route?.targets ?? []).map(createTargetRow)
    setTargets(rows.length > 0 ? rows : [createTargetRow()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.route])

  const handleSave = (values: RouteFormValues) => {
    const name = values.name.trim()
    if (!name) {
      toast.error(t('Model route name cannot be empty'))
      return
    }
    if (props.existingNames.includes(name)) {
      toast.error(t('Duplicate model route name: {{name}}', { name }))
      return
    }
    const savedTargets = targets
      .map((row) => ({
        model: row.model.trim(),
        tag: row.tag?.trim() || undefined,
        weight:
          row.weight !== undefined && row.weight > 0
            ? Math.floor(row.weight)
            : undefined,
      }))
      .filter((target) => target.model.length > 0)
    if (savedTargets.length === 0) {
      toast.error(t('Model route {{name}} must define at least one target', { name }))
      return
    }
    if (savedTargets.some((target) => target.model === name)) {
      toast.error(t('Model route {{name}} cannot target itself', { name }))
      return
    }

    props.onSave({
      name,
      targets: savedTargets,
      enabled: values.enabled,
      remark: values.remark.trim() || undefined,
    })
    props.onOpenChange(false)
  }

  const updateTarget = (index: number, patch: Partial<ModelRouteTarget>) => {
    setTargets((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={isEdit ? t('Edit Route') : t('Add Route')}
      contentClassName='sm:max-w-2xl'
      contentHeight='auto'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={ROUTE_FORM_ID}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <form
        id={ROUTE_FORM_ID}
        onSubmit={form.handleSubmit(handleSave)}
        className='min-w-0 space-y-4'
      >
        <div className='grid gap-1.5'>
          <Label required htmlFor='model-route-name'>
            {t('Route name')}
          </Label>
          <Input
            id='model-route-name'
            placeholder='gpt-4o-all'
            {...form.register('name', { required: true })}
          />
          {nameMatchesModel ? (
            <p role='note' className='text-amber-600 text-xs dark:text-amber-400'>
              {t(
                'This name matches an existing model; channels serving it directly keep serving it as a real model.'
              )}
            </p>
          ) : null}
          <p className='text-muted-foreground text-xs'>
            {t(
              'Clients request this name; it must not duplicate a real model served by any channel.'
            )}
          </p>
        </div>

        <Separator />

        <div>
          <div className='mb-2 flex items-center justify-between'>
            <Label>{t('Targets')}</Label>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setTargets((prev) => [...prev, createTargetRow()])}
            >
              <Plus className='mr-1 h-3 w-3' />
              {t('Add Target')}
            </Button>
          </div>
          <p className='text-muted-foreground mb-2 text-xs'>
            {t(
              'Matched top to bottom; the request is rewritten to the winning channel\u2019s own target model and billed at that model\u2019s price.'
            )}
          </p>
          <div className='space-y-2'>
            {targets.map((target, index) => (
              <div
                key={target.rowId}
                className='flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center'
              >
                <ComboboxInput
                  className='min-w-0 flex-1'
                  options={modelOptions}
                  value={target.model}
                  onValueChange={(value) => updateTarget(index, { model: value })}
                  placeholder='gpt-4o-2024-11-20'
                  emptyText={t('No matching models')}
                  allowCustomValue
                  aria-label={t('Target model')}
                />
                <Input
                  className='min-w-0 sm:w-[160px]'
                  aria-label={t('Channel tag (optional)')}
                  placeholder={t('Channel tag (optional)')}
                  value={target.tag ?? ''}
                  onChange={(e) => updateTarget(index, { tag: e.target.value })}
                />
                <Input
                  className='min-w-0 sm:w-24'
                  type='number'
                  min={0}
                  step={1}
                  aria-label={t('Weight (optional)')}
                  placeholder={t('Default')}
                  title={t(
                    'Replaces channel weights for this target during selection'
                  )}
                  value={target.weight ?? ''}
                  onChange={(e) => {
                    const next = e.target.value
                    updateTarget(index, {
                      weight: next === '' ? undefined : Number(next),
                    })
                  }}
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('Remove target')}
                  onClick={() =>
                    setTargets((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <SettingsSwitchField
          controlId='model-route-enabled'
          checked={form.watch('enabled')}
          onCheckedChange={(checked) => form.setValue('enabled', checked)}
          label={t('Enabled')}
        />

        <div className='grid gap-1.5'>
          <Label htmlFor='model-route-remark'>{t('Remark')}</Label>
          <Input
            id='model-route-remark'
            placeholder={t('Optional note')}
            {...form.register('remark')}
          />
        </div>
      </form>
    </Dialog>
  )
}
