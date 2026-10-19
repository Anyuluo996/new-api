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
import type { ModelRoute, ModelRouteTarget } from '../types'

type Translator = (key: string, options?: Record<string, unknown>) => string

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeTarget(raw: unknown): ModelRouteTarget {
  if (!isRecord(raw)) return { model: '' }
  return {
    model: typeof raw.model === 'string' ? raw.model : '',
    tag: typeof raw.tag === 'string' && raw.tag.length > 0 ? raw.tag : undefined,
    weight:
      typeof raw.weight === 'number' && Number.isFinite(raw.weight) && raw.weight > 0
        ? raw.weight
        : undefined,
  }
}

function normalizeRoute(raw: unknown): ModelRoute {
  if (!isRecord(raw)) return { name: '', targets: [], enabled: true }
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    targets: Array.isArray(raw.targets) ? raw.targets.map(normalizeTarget) : [],
    enabled: raw.enabled !== false,
    remark: typeof raw.remark === 'string' && raw.remark.length > 0 ? raw.remark : undefined,
  }
}

export function parseRoutes(jsonStr: string): ModelRoute[] {
  try {
    const parsed: unknown = JSON.parse(jsonStr || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeRoute)
  } catch {
    return []
  }
}

export function serializeRoutes(routes: ModelRoute[]): string {
  return JSON.stringify(
    routes.map((route) => {
      const targets = route.targets
        .map((target) => ({
          model: target.model.trim(),
          tag: target.tag?.trim() || undefined,
          weight:
            target.weight !== undefined && target.weight > 0
              ? Math.floor(target.weight)
              : undefined,
        }))
        .filter((target) => target.model.length > 0)
      const uniqueTargets = targets.filter(
        (target, index) =>
          targets.findIndex(
            (other) => other.model === target.model && other.tag === target.tag
          ) === index
      )
      return {
        name: route.name.trim(),
        targets: uniqueTargets,
        enabled: route.enabled,
        remark: route.remark?.trim() || undefined,
      }
    })
  )
}

export function routesEqual(a: string, b: string): boolean {
  return JSON.stringify(parseRoutes(a)) === JSON.stringify(parseRoutes(b))
}

/** True when the trimmed alias name matches an enabled channel model. */
export function isKnownModel(name: string, models: string[]): boolean {
  const trimmed = name.trim()
  return trimmed.length > 0 && models.includes(trimmed)
}

/** Mirrors the backend maxTargetWeight so the option validator never rejects
 * what the editor produced. */
const MAX_TARGET_WEIGHT = 1_000_000

/** Mirrors the backend ValidateRoutes invariants; returns a message key with
 * interpolations or null when the routes are valid. */
export function validateRoutes(
  routes: ModelRoute[],
  t: Translator
): string | null {
  const aliases = new Set<string>()
  for (const route of routes) {
    const name = route.name.trim()
    if (!name) return t('Model route name cannot be empty')
    if (aliases.has(name)) return t('Duplicate model route name: {{name}}', { name })
    aliases.add(name)
  }
  for (const route of routes) {
    const name = route.name.trim()
    const targets = route.targets.filter((target) => target.model.trim().length > 0)
    if (targets.length === 0) {
      return t('Model route {{name}} must define at least one target', { name })
    }
    for (const target of targets) {
      const model = target.model.trim()
      if (model === name) {
        return t('Model route {{name}} cannot target itself', { name })
      }
      if (aliases.has(model)) {
        return t(
          'Route target {{target}} is itself a route name; targets must be real models',
          { target: model }
        )
      }
      if (target.weight !== undefined && target.weight > MAX_TARGET_WEIGHT) {
        return t('Target weight exceeds the limit {{max}}', {
          max: MAX_TARGET_WEIGHT,
        })
      }
    }
  }
  return null
}
