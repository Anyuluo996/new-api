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
import type { Table } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { CompactDateTimeRangePicker } from '../../components/compact-date-time-range-picker'
import {
  LogsFilterField,
  LogsFilterInput,
  LogsFilterToolbar,
} from '../../components/logs-filter-toolbar'
import type { RequestDetail, RequestDetailFilters } from '../api'

export function RequestDetailFilterBar(props: {
  table: Table<RequestDetail>
  filters: RequestDetailFilters
  onChange: (patch: Partial<RequestDetailFilters>) => void
  isFetching: boolean
  onSearch: () => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const dateFilter = (
    <LogsFilterField>
      <CompactDateTimeRangePicker
        start={
          props.filters.start_timestamp === undefined
            ? undefined
            : new Date(props.filters.start_timestamp * 1000)
        }
        end={
          props.filters.end_timestamp === undefined
            ? undefined
            : new Date(props.filters.end_timestamp * 1000)
        }
        onChange={({ start, end }) =>
          props.onChange({
            start_timestamp: start
              ? Math.floor(start.getTime() / 1000)
              : undefined,
            end_timestamp: end ? Math.floor(end.getTime() / 1000) : undefined,
          })
        }
      />
    </LogsFilterField>
  )
  const mainFilters = (
    <>
      <LogsFilterField>
        <LogsFilterInput
          aria-label={t('Model')}
          placeholder={t('Model')}
          value={props.filters.model_name ?? ''}
          onChange={(event) =>
            props.onChange({ model_name: event.target.value || undefined })
          }
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          aria-label={t('Channel ID')}
          placeholder={t('Channel ID')}
          inputMode='numeric'
          value={props.filters.channel_id ?? ''}
          onChange={(event) =>
            props.onChange({
              channel_id: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          aria-label={t('User ID')}
          placeholder={t('User ID')}
          inputMode='numeric'
          value={props.filters.user_id ?? ''}
          onChange={(event) =>
            props.onChange({
              user_id: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        />
      </LogsFilterField>
    </>
  )
  const advancedFilters = (
    <>
      <LogsFilterField>
        <LogsFilterInput
          aria-label={t('Token')}
          placeholder={t('Token')}
          value={props.filters.token_name ?? ''}
          onChange={(event) =>
            props.onChange({ token_name: event.target.value || undefined })
          }
        />
      </LogsFilterField>
      <LogsFilterField>
        <LogsFilterInput
          aria-label={t('Request ID')}
          placeholder={t('Request ID')}
          value={props.filters.request_id ?? ''}
          onChange={(event) =>
            props.onChange({ request_id: event.target.value || undefined })
          }
        />
      </LogsFilterField>
    </>
  )
  const advancedCount = [props.filters.token_name, props.filters.request_id]
    .filter(Boolean).length
  const filterCount =
    advancedCount +
    [
      props.filters.model_name,
      props.filters.channel_id,
      props.filters.user_id,
    ].filter(Boolean).length
  const hasFilters =
    filterCount > 0 ||
    props.filters.start_timestamp !== undefined ||
    props.filters.end_timestamp !== undefined
  return (
    <LogsFilterToolbar
      table={props.table}
      primaryFilters={
        <>
          {dateFilter}
          {mainFilters}
        </>
      }
      advancedFilters={advancedFilters}
      mobilePinnedFilters={dateFilter}
      mobileFilters={
        <>
          {mainFilters}
          {advancedFilters}
        </>
      }
      mobileFilterCount={filterCount}
      advancedFilterCount={advancedCount}
      hasActiveFilters={hasFilters}
      hasAdvancedActiveFilters={advancedCount > 0}
      searchLoading={props.isFetching}
      onSearch={props.onSearch}
      onReset={props.onReset}
    />
  )
}
