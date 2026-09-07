import { describe, expect, it } from 'vitest'
import { parseTimeoutMs } from '../server/agentModel.ts'
import {
  designSystemSlug,
  extractHtml,
  nextRepoFramePosition,
  resolveImport,
  treeExcerpt,
} from '../server/githubRecon.ts'
import { wrapGeneratedHtml } from '../server/github.ts'

/** The reconstruction pass's pure core: import resolution against a repo
 *  tree, and pulling the HTML document (+ declared height) out of a model
 *  reply. The model call itself is exercised in production, not here. */

describe('resolveImport', () => {
  const paths = new Set([
    'src/pages/index.tsx',
    'src/components/Hero.tsx',
    'src/components/ui/index.ts',
    'src/styles/globals.css',
    'apps/web/src/lib/util.ts',
  ])

  it('resolves relative specifiers with extension and index probing', () => {
    expect(resolveImport('../components/Hero', 'src/pages/index.tsx', paths)).toBe('src/components/Hero.tsx')
    expect(resolveImport('../components/ui', 'src/pages/index.tsx', paths)).toBe('src/components/ui/index.ts')
    expect(resolveImport('../styles/globals.css', 'src/pages/index.tsx', paths)).toBe('src/styles/globals.css')
  })

  it('maps @/ aliases to the nearest src root', () => {
    expect(resolveImport('@/components/Hero', 'src/pages/index.tsx', paths)).toBe('src/components/Hero.tsx')
    expect(resolveImport('@/lib/util', 'apps/web/src/pages/x.tsx', paths)).toBe('apps/web/src/lib/util.ts')
  })

  it('ignores package imports and unresolvable paths', () => {
    expect(resolveImport('react', 'src/pages/index.tsx', paths)).toBeUndefined()
    expect(resolveImport('./missing', 'src/pages/index.tsx', paths)).toBeUndefined()
  })
})

describe('extractHtml', () => {
  it('takes the document from plain text and reads the height comment', () => {
    const { html, height } = extractHtml([
      { type: 'text', text: 'Here it is:\n<!doctype html><html><body>x</body></html>\n<!-- doop-height: 1240 -->' },
    ])
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(height).toBe(1240)
  })

  it('unwraps markdown fences, clamps silly heights, defaults sans comment', () => {
    const fenced = extractHtml([
      { type: 'text', text: '```html\n<!doctype html><p>x</p>\n<!-- doop-height: 99999 -->\n```' },
    ])
    expect(fenced.height).toBe(8000)
    expect(extractHtml([{ type: 'text', text: '<!doctype html><p>x</p>' }]).height).toBe(900)
    expect(() => extractHtml([{ type: 'text', text: 'sorry, no' }])).toThrow(/no HTML/)
  })

  it('handles xml and generic code fences and unclosed markdown blocks', () => {
    const xmlFenced = extractHtml([{ type: 'text', text: '```xml\n<!doctype html><div>x</div>\n```' }])
    expect(xmlFenced.html).toContain('<!doctype html>')

    const unclosed = extractHtml([
      { type: 'text', text: '```html\n<!doctype html><div>unclosed\n<!-- doop-height: 1200 -->' },
    ])
    expect(unclosed.html).toContain('<!doctype html>')
    expect(unclosed.height).toBe(1200)
  })

  it('normalizes html without doctype and component fragments into documents', () => {
    const noDoctype = extractHtml([{ type: 'text', text: '<html><head></head><body><span>hello</span></body></html>' }])
    expect(noDoctype.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(noDoctype.html).toContain('<span>hello</span>')

    const fragment = extractHtml([{ type: 'text', text: '<div class="btn">Click me</div>' }])
    expect(fragment.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(fragment.html).toContain('<div class="btn">Click me</div>')
  })

  it('does not let an unrelated leading code fence shadow valid HTML', () => {
    const responseWithLeadingJson = extractHtml([
      {
        type: 'text',
        text: 'Here is the config:\n```json\n{ "title": "<Header>" }\n```\nAnd here is the screen:\n```html\n<div class="dashboard">Dashboard Content</div>\n```',
      },
    ])
    expect(responseWithLeadingJson.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(responseWithLeadingJson.html).toContain('Dashboard Content')

    const responseWithLeadingCodeAndUnfencedHtml = extractHtml([
      {
        type: 'text',
        text: 'Reviewing code:\n```typescript\nconst tag = "<Component>";\n```\nResulting markup:\n<main class="page">Page Content</main>',
      },
    ])
    expect(responseWithLeadingCodeAndUnfencedHtml.html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(responseWithLeadingCodeAndUnfencedHtml.html).toContain('Page Content')
  })
})

describe('parseTimeoutMs', () => {
  it('accepts valid integer millisecond strings', () => {
    expect(parseTimeoutMs('600000')).toBe(600000)
    expect(parseTimeoutMs('900000')).toBe(900000)
  })

  it('falls back to default for missing, negative, float, or invalid values', () => {
    expect(parseTimeoutMs(undefined)).toBe(900000)
    expect(parseTimeoutMs('')).toBe(900000)
    expect(parseTimeoutMs('-100')).toBe(900000)
    expect(parseTimeoutMs('0')).toBe(900000)
    expect(parseTimeoutMs('12.5')).toBe(900000)
    expect(parseTimeoutMs('Infinity')).toBe(900000)
    expect(parseTimeoutMs('not-a-number')).toBe(900000)
  })
})

describe('treeExcerpt', () => {
  it('surfaces styling and locale paths, drops binaries and node_modules', () => {
    const tree = treeExcerpt(
      [
        'src/pages/backup.tsx',
        'src/styles/theme.ts',
        'public/locales/en/backup.json',
        'src/components/Nav.tsx',
        'node_modules/react/index.js',
        'public/logo.png',
        'README.md',
      ],
      'src/pages/backup.tsx',
    )
    expect(tree).toContain('src/styles/theme.ts')
    expect(tree).toContain('public/locales/en/backup.json')
    expect(tree).not.toContain('node_modules')
    /* images stay listed — they are transplantable assets now */
    expect(tree).toContain('public/logo.png')
  })
})

describe('repo asset references', () => {
  it('keeps image paths in the tree so the model can transplant them', () => {
    const tree = treeExcerpt(['public/logos/ibm.svg', 'src/pages/index.tsx'], 'src/pages/index.tsx')
    expect(tree).toContain('public/logos/ibm.svg')
  })

  it('extractHtml raises the height ceiling for full pages', () => {
    const { height } = extractHtml([{ type: 'text', text: '<!doctype html><p>x</p>\n<!-- doop-height: 6600 -->' }])
    expect(height).toBe(6600)
  })
})

describe('nextRepoFramePosition', () => {
  const CONN = 'conn-1'
  const marked = (x: number, y: number, width: number, height: number, conn = CONN) => ({
    x,
    y,
    width,
    height,
    html: wrapGeneratedHtml(
      '<html><head></head><body>x</body></html>',
      { id: conn, repo: 'a/b', branch: 'main' },
      {
        kind: 'component',
        route: 'src/Button.tsx',
        sourcePath: 'src/Button.tsx',
      },
    ),
  })
  const plain = (x: number, y: number, width: number, height: number) => ({ x, y, width, height, html: '<p/>' })

  it('starts the import right of everything on the canvas, or at the origin on an empty one', () => {
    expect(nextRepoFramePosition([], CONN, 640)).toEqual({ x: 120, y: 120 })
    expect(nextRepoFramePosition([plain(100, 300, 1000, 500)], CONN, 640)).toEqual({ x: 1180, y: 120 })
  })

  it('flows siblings into the current row while it fits, then wraps under everything', () => {
    const frames = [plain(100, 300, 1000, 500), marked(1180, 120, 640, 420)]
    expect(nextRepoFramePosition(frames, CONN, 640)).toEqual({ x: 1900, y: 120 })
    const fullRow = [
      marked(120, 120, 1280, 900),
      marked(1480, 120, 1280, 700),
      /* a taller frame in the row decides where the next row starts */
    ]
    expect(nextRepoFramePosition(fullRow, CONN, 1280)).toEqual({ x: 120, y: 1100 })
  })

  it('only counts frames from the same connection as siblings', () => {
    const frames = [marked(120, 120, 640, 420, 'other-conn')]
    expect(nextRepoFramePosition(frames, CONN, 640)).toEqual({ x: 840, y: 120 })
  })
})

describe('designSystemSlug', () => {
  it('names the guide after the repository', () => {
    expect(designSystemSlug('acme/Web.App')).toBe('web-app-design-system')
  })
})
