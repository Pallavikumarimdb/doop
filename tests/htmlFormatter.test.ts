import { describe, expect, it } from 'vitest'
import { formatHtml } from '../src/lib/htmlFormatter'

describe('formatHtml', () => {
  it('returns empty string for empty input', () => {
    expect(formatHtml('')).toBe('')
  })

  it('formats unformatted single line HTML into indented block structure', () => {
    const raw = '<!doctype html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>'
    const formatted = formatHtml(raw)

    expect(formatted).toContain('<!doctype html>')
    expect(formatted).toContain('<html>')
    expect(formatted).toContain('  <head>')
    expect(formatted).toContain('    <title>')
    expect(formatted).toContain('  <body>')
    expect(formatted).toContain('    <h1>')
  })

  it('handles self-closing and void tags without inflating indent', () => {
    const raw = '<div><img src="test.jpg" /><br><input type="text"></div>'
    const formatted = formatHtml(raw)

    expect(formatted).toContain('<div>')
    expect(formatted).toContain('  <img src="test.jpg" />')
    expect(formatted).toContain('  <br>')
    expect(formatted).toContain('  <input type="text">')
    expect(formatted).toContain('</div>')
  })
})
