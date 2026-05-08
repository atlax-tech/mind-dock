import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKSPACE_DIR = path.resolve(import.meta.dirname, '../app/workspace')

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(WORKSPACE_DIR, relativePath), 'utf-8')
}

describe('FE-001: GoldenTopNav — Plus / Capture button removed', () => {
  const src = readSource('_components/GoldenTopNav.tsx')

  it('does NOT declare onOpenRecorder prop', () => {
    // The interface GoldenTopNavProps must not include onOpenRecorder
    expect(src).not.toMatch(/\bonOpenRecorder\b/)
  })

  it('does NOT render any button with capture-related title', () => {
    // No <button title="Capture"> or similar should exist
    expect(src).not.toMatch(/title\s*=\s*\{\s*["']Capture["']/)
  })

  it('does NOT import Plus from lucide-react', () => {
    // The word "Plus" must not appear in the whole file after removal
    expect(src).not.toMatch(/\bPlus\b/)
  })

  it('lucide-react import contains only allowed icons', () => {
    const afterImport = src.split("from 'lucide-react'")[0]
    expect(afterImport).toContain('Home')
    expect(afterImport).toContain('Library')
    expect(afterImport).toContain('Network')
    expect(afterImport).not.toContain('Plus')
  })
})

describe('FE-001: page.tsx — FloatingRecorder / Classic-Chat removed', () => {
  const src = readSource('page.tsx')

  it('does NOT declare recorderState', () => {
    expect(src).not.toMatch(/\brecorderState\b/)
  })

  it('does NOT declare inputMode state', () => {
    expect(src).not.toMatch(/inputMode/)
  })

  it('does NOT declare inputText state', () => {
    expect(src).not.toMatch(/inputText/)
  })

  it('does NOT define FloatingRecorder function', () => {
    expect(src).not.toMatch(/function FloatingRecorder/)
  })

  it('does NOT render Classic / Chat tab buttons', () => {
    // No Classic or Chat tab labels in the old capture panel
    expect(src).not.toMatch(/>Classic</)
    expect(src).not.toMatch(/>Chat</)
  })

  it('does NOT import AppMode type', () => {
    expect(src).not.toMatch(/\bAppMode\b/)
  })

  it('does NOT import Send from lucide-react', () => {
    const afterImport = src.split("from 'lucide-react'")[0]
    expect(afterImport).not.toMatch(/\bSend\b/)
  })

  it('does NOT import Minimize2 from lucide-react', () => {
    const afterImport = src.split("from 'lucide-react'")[0]
    expect(afterImport).not.toMatch(/\bMinimize2\b/)
  })

  it('does NOT render <FloatingRecorder> JSX', () => {
    expect(src).not.toMatch(/<FloatingRecorder/)
  })

  it('does NOT export FloatingRecorder', async () => {
    const mod = await import('@/app/workspace/page')
    expect('FloatingRecorder' in mod).toBe(false)
  })

  it('onOpenRecorder fully removed (old DockFinderView replaced by DockView console)', () => {
    // In the new design, DockFinderView no longer exists.
    // The new DockView is a knowledge console that doesn't use onOpenRecorder.
    const matches = src.match(/onOpenRecorder/g)
    expect(matches).toBeNull()
  })
})

describe('FE-001: HomeView — capture input & entry cards preserved', () => {
  const src = readSource('features/home/HomeView.tsx')

  it('contains main capture input placeholder', () => {
    expect(src).toContain('Capture an idea... (Press Enter to Dock)')
  })

  it('uses forwardRef with captureInputRef', () => {
    expect(src).toMatch(/forwardRef/)
    expect(src).toMatch(/captureInputRef/)
  })

  it('exposes focusCaptureInput via useImperativeHandle', () => {
    expect(src).toMatch(/focusCaptureInput/)
  })

  it('renders New Document entry card', () => {
    expect(src).toContain('New Document')
    expect(src).toContain('Structured markdown workspace')
  })

  it('renders Process Dock entry card', () => {
    expect(src).toContain('Process Dock')
    expect(src).toContain('Organize unlinked fragments')
  })

  it('renders Graph Explorer entry card', () => {
    expect(src).toContain('Graph Explorer')
    expect(src).toContain('Navigate your knowledge base')
  })

  it('renders Knowledge, Structured heading', () => {
    expect(src).toContain('Knowledge, Structured.')
  })

  it('renders node count display', () => {
    expect(src).toContain('Nodes active')
  })

  it('exports HomeViewHandle type for forwardRef', () => {
    expect(src).toContain('HomeViewHandle')
  })
})
