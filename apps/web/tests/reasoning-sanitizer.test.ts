import { describe, it, expect } from 'vitest'
import { sanitizeReasoningContent } from '@/lib/reasoningSanitizer'

describe('sanitizeReasoningContent', () => {
  it('returns content unchanged when no reasoning present', () => {
    const result = sanitizeReasoningContent('Hello world')
    expect(result).toBe('Hello world')
  })

  it('strips think tags', () => {
    const result = sanitizeReasoningContent('<think some reasoning here </think The actual content')
    expect(result).toBe('The actual content')
  })

  it('strips think tags with attributes', () => {
    const result = sanitizeReasoningContent('<think thinking="deep" another reasoning </think Real output')
    expect(result).toBe('Real output')
  })

  it('strips multiline think tags', () => {
    const result = sanitizeReasoningContent('<think\nline1\nline2\n</think\nResult')
    expect(result).toBe('Result')
  })

  it('strips chain-of-thought patterns', () => {
    const result = sanitizeReasoningContent('Let me think step by step:\nFirst we do this.\nThe answer is 42.')
    expect(result).not.toContain('Let me think step by step')
    expect(result).toContain('The answer is 42.')
  })

  it('strips Step N: patterns', () => {
    const result = sanitizeReasoningContent('Step 1: Analyze the problem\nStep 2: Find solution\nFinal answer: yes')
    expect(result).not.toContain('Step 1')
    expect(result).not.toContain('Step 2')
    expect(result).toContain('Final answer: yes')
  })

  it('strips Analysis: pattern', () => {
    const result = sanitizeReasoningContent('Analysis: The data shows trend\nConclusion: Upward')
    expect(result).not.toContain('Analysis')
    expect(result).toContain('Conclusion: Upward')
  })

  it('returns null when content is empty after sanitization', () => {
    const result = sanitizeReasoningContent('<think only reasoning </think ')
    expect(result).toBeNull()
  })

  it('returns null when content is only whitespace after sanitization', () => {
    const result = sanitizeReasoningContent('<think reasoning </think   ')
    expect(result).toBeNull()
  })

  it('handles content with only reasoning and no output', () => {
    const result = sanitizeReasoningContent('Let me think step by step:\nStep 1: Consider\nStep 2: Evaluate')
    expect(result).toBeNull()
  })

  it('preserves normal content without reasoning markers', () => {
    const content = 'This is a normal summary of the document. It contains no reasoning markers.'
    const result = sanitizeReasoningContent(content)
    expect(result).toBe(content)
  })

  it('handles empty string input', () => {
    const result = sanitizeReasoningContent('')
    expect(result).toBeNull()
  })

  it('handles whitespace-only input', () => {
    const result = sanitizeReasoningContent('   ')
    expect(result).toBeNull()
  })

  it('does not accept rawReasoning parameter - function only takes content', () => {
    expect(sanitizeReasoningContent.length).toBe(1)
  })
})
