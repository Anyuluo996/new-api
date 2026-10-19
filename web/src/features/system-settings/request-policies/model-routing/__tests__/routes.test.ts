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
import { describe, expect, it, vi } from 'vitest'

import {
  isKnownModel,
  parseRoutes,
  routesEqual,
  serializeRoutes,
  validateRoutes,
} from '../lib/routes'

const t = vi.fn((key: string) => key)

describe('parseRoutes', () => {
  it('returns an empty list for empty, malformed, or non-array JSON', () => {
    expect(parseRoutes('')).toEqual([])
    expect(parseRoutes('not-json')).toEqual([])
    expect(parseRoutes('{"name":"a"}')).toEqual([])
  })

  it('normalizes routes and defaults enabled to true', () => {
    const routes = parseRoutes(
      '[{"name":"a","targets":[{"model":"m1"},{"tag":"cn"}],"remark":"r"}]'
    )
    expect(routes).toEqual([
      {
        name: 'a',
        targets: [
          { model: 'm1', tag: undefined },
          { model: '', tag: 'cn' },
        ],
        enabled: true,
        remark: 'r',
      },
    ])
  })
})

describe('serializeRoutes', () => {
  it('trims fields, drops empty targets, and omits blank remark/tag', () => {
    const json = serializeRoutes([
      {
        name: ' a ',
        targets: [
          { model: ' m1 ', tag: ' cn ' },
          { model: '   ' },
        ],
        enabled: false,
        remark: ' ',
      },
    ])
    expect(JSON.parse(json)).toEqual([
      { name: 'a', targets: [{ model: 'm1', tag: 'cn' }], enabled: false },
    ])
  })

  it('round-trips through parse', () => {
    const source =
      '[{"name":"a","targets":[{"model":"m1","tag":"cn"}],"enabled":true,"remark":"r"}]'
    expect(serializeRoutes(parseRoutes(source))).toBe(
      '[{"name":"a","targets":[{"model":"m1","tag":"cn"}],"enabled":true,"remark":"r"}]'
    )
  })
})

describe('routesEqual', () => {
  it('compares by parsed content, not formatting', () => {
    expect(routesEqual('[{"name":"a","targets":[]}]', '[ {"name":"a","targets":[]} ]')).toBe(
      true
    )
    expect(routesEqual('[{"name":"a","targets":[]}]', '[{"name":"b","targets":[]}]')).toBe(
      false
    )
  })
})

describe('isKnownModel', () => {
  it('matches only non-empty trimmed names against enabled models', () => {
    const models = ['gpt-4o', 'claude-3']
    expect(isKnownModel('gpt-4o', models)).toBe(true)
    expect(isKnownModel(' gpt-4o ', models)).toBe(true)
    expect(isKnownModel('gpt-4o-all', models)).toBe(false)
    expect(isKnownModel('', models)).toBe(false)
    expect(isKnownModel('  ', models)).toBe(false)
    expect(isKnownModel('gpt-4o', [])).toBe(false)
  })
})

describe('validateRoutes', () => {
  it('accepts valid routes', () => {
    const routes = parseRoutes(
      '[{"name":"a","targets":[{"model":"m1"}],"enabled":true}]'
    )
    expect(validateRoutes(routes, t)).toBeNull()
  })

  it('rejects empty, duplicate, self-targeting, and chained names', () => {
    expect(
      validateRoutes(parseRoutes('[{"name":" ","targets":[{"model":"m"}]}]'), t)
    ).toContain('cannot be empty')
    expect(
      validateRoutes(
        parseRoutes(
          '[{"name":"a","targets":[{"model":"m"}]},{"name":"a","targets":[{"model":"m"}]}]'
        ),
        t
      )
    ).toContain('Duplicate')
    expect(
      validateRoutes(parseRoutes('[{"name":"a","targets":[]}]'), t)
    ).toContain('at least one target')
    expect(
      validateRoutes(parseRoutes('[{"name":"a","targets":[{"model":"a"}]}]'), t)
    ).toContain('cannot target itself')
    expect(
      validateRoutes(
        parseRoutes(
          '[{"name":"a","targets":[{"model":"b"}]},{"name":"b","targets":[{"model":"m"}]}]'
        ),
        t
      )
    ).toContain('real models')
  })
})
