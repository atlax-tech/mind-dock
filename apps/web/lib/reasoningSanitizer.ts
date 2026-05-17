export function sanitizeReasoningContent(rawContent: string): string | null {
  let content = rawContent

  content = content.replace(/<think[\s\S]*?<\/think\s*>?/gi, '')

  content = content.replace(/\.{3,}/g, '')

  content = content
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return !/^(let me think step by step|step \d+|analysis|reasoning)\s*:/i.test(trimmed)
    })
    .join('\n')

  content = content.trim()

  return content.length === 0 ? null : content
}
