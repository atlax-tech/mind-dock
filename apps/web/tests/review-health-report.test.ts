import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const APP_DIR = path.resolve(import.meta.dirname, '../app')

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(APP_DIR, relativePath), 'utf-8')
}

function getReviewSection(src: string): string {
  const start = src.indexOf('const ReviewView')
  if (start === -1) return src
  return src.substring(start)
}

describe('ReviewView source code assertions', () => {
  const src = readSource('workspace/page.tsx')
  const review = getReviewSection(src)

  it('imports getLocalHealthReport from @/lib/localHealthReport', () => {
    expect(src).toMatch(/import.*getLocalHealthReport.*from\s+['"]@\/lib\/localHealthReport['"]/)
  })

  it('no longer contains hardcoded health score 92', () => {
    expect(review).not.toMatch(/\b92\b/)
  })

  it('no longer contains hardcoded Quick Notes numbers (56)', () => {
    expect(review).not.toMatch(/\b56\b/)
  })

  it('no longer contains hardcoded Drafts numbers (24)', () => {
    expect(review).not.toMatch(/\b24\b(?!-|\.)/)
  })

  it('imports LocalHealthReport type', () => {
    expect(src).toMatch(/import.*LocalHealthReport.*from\s+['"]@\/lib\/localHealthReport['"]/)
  })

  it('has healthReport state with LocalHealthReport type', () => {
    expect(src).toMatch(/useState<LocalHealthReport/)
  })

  it('has reportLoading state', () => {
    expect(src).toMatch(/reportLoading/)
  })
})

describe('ReviewView binds to report summary data', () => {
  const src = readSource('workspace/page.tsx')
  const review = getReviewSection(src)

  it('health score comes from healthReport.score', () => {
    expect(review).toMatch(/healthReport.*\.score/)
  })

  it('Quick Notes flow uses report tips metrics', () => {
    expect(review).toMatch(/healthReport.*activeTips|healthReport.*convertedTips|healthReport.*discardedTips/)
  })

  it('Drafts flow uses report drafts metrics (not hardcoded)', () => {
    expect(review).toMatch(/healthReport.*draftsTotal|healthReport.*staleDrafts/)
  })

  it('Drafts published uses sections.drafts.published (not .total)', () => {
    expect(review).toMatch(/sections\.drafts\.published/)
    expect(review).not.toMatch(/sections\.drafts\.total[^.]/)
  })

  it('Drafts discarded uses sections.drafts.discarded (not hardcoded 0)', () => {
    expect(review).toMatch(/sections\.drafts\.discarded/)
    expect(review).not.toMatch(/>\s*0\s*<.*废弃/)
  })

  it('suggestions come from healthReport.suggestions', () => {
    expect(review).toMatch(/healthReport.*\.suggestions/)
  })

  it('Mind topology uses real mindNodes/mindEdges', () => {
    expect(review).toMatch(/healthReport.*mindNodes|healthReport.*mindEdges/)
  })

  it('project distribution uses projectDistribution', () => {
    expect(review).toMatch(/projectDistribution/)
  })

  it('Mind topology uses mindGraphPreview data', () => {
    expect(review).toMatch(/mindGraphPreview/)
  })

  it('Mind topology has click handler to navigate to Mind view', () => {
    expect(review).toMatch(/onNavigateToMind/)
  })

  it('ReviewView accepts onNavigateToMind prop', () => {
    expect(src).toMatch(/ReviewView.*onNavigateToMind/)
  })
})

describe('Dock layout and health source assertions', () => {
  const src = readSource('workspace/page.tsx')
  const dockStart = src.indexOf('const DockView')
  const dockEnd = src.indexOf('// 5. 回顾视图', dockStart)
  const dock = dockStart === -1 ? src : src.substring(dockStart, dockEnd === -1 ? undefined : dockEnd)

  it('Dock workspace shell is constrained to viewport width', () => {
    expect(src).toMatch(/w-\[calc\(100vw-48px\)\]/)
    expect(src).toMatch(/<main className=\{`flex-1 min-w-0/)
  })

  it('Dock inspector stays inside the viewport and scrolls internally', () => {
    expect(dock).toMatch(/w-\[min\(318px,24vw\)\]/)
    expect(dock).toMatch(/max-w-\[318px\]/)
    expect(dock).toMatch(/overflow-y-auto custom-scrollbar/)
  })

  it('Dock exposes weak taxonomy as a health signal', () => {
    expect(dock).toMatch(/key:\s*['"]weaklyClassified['"]/)
    expect(dock).toMatch(/weaklyClassified:\s*\(\)\s*=>\s*vm\.setDockMode\(['"]health['"],\s*['"]weaklyClassified['"]\)/)
  })

  it('Dock side navigation keeps a stable selected frame', () => {
    expect(dock).toMatch(/border flex items-center gap-2 cursor-pointer transition-colors/)
    expect(dock).toMatch(/border-transparent text-\[#8d989f\]/)
    expect(dock).not.toMatch(/transition-all duration-200/)
  })

  it('external workflow module is explicitly preview/planned', () => {
    const review = getReviewSection(src)
    expect(review).toMatch(/Preview \/ Planned 外部工作流/)
    expect(review).toMatch(/Linear Planned/)
    expect(review).toMatch(/Planned 展示位/)
  })
})
