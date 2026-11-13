import { describe, expect, it } from 'vitest'
import { expenseDisplayTitle } from './expenseDisplay'

describe('expenseDisplayTitle', () => {
  it('uses the label when provided', () => {
    expect(expenseDisplayTitle({ category: 'Survival', note: '  Taxi fare  ' })).toBe('Taxi fare')
  })

  it('falls back to the category', () => {
    expect(expenseDisplayTitle({ category: 'Culture', note: '' })).toBe('Culture')
    expect(expenseDisplayTitle({ category: 'Optional' })).toBe('Optional')
  })
})
