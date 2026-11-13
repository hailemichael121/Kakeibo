import { describe, expect, it } from 'vitest'
import { displayAmount, maskAmountText, plainAmountText } from './privacy'

describe('privacy amounts', () => {
  it('masks digits with decorative glyphs', () => {
    const masked = maskAmountText('ETB 1,234.50')
    expect(masked).toContain('ETB')
    expect(masked).not.toMatch(/[0-9]/)
    expect(masked).toMatch(/[甲乙丙丁戊己庚辛壬癸]/)
  })

  it('hides formatted currency when requested', () => {
    const visible = displayAmount(1234.5, 'ETB', false)
    const hidden = displayAmount(1234.5, 'ETB', true)
    expect(hidden).not.toContain('1')
    expect(hidden).not.toContain('2')
    expect(visible).toMatch(/\d/)
  })

  it('formats plain amounts consistently', () => {
    expect(plainAmountText(10, 'USD')).toContain('10')
  })
})
