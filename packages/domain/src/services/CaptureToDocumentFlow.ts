import type { MindNodeType } from '../mind/types'

export interface CaptureToDocumentInput {
  userId: string
  rawText: string
  topic?: string | null
  sourceType?: 'text' | 'voice' | 'import' | 'chat'
}

export interface CaptureToDocumentResult {
  capture: {
    id: number
    rawText: string
    status: string
    processedAt: Date | null
    createdAt: Date
  }
  document: {
    id: number
    title: string
    content: string
    sourceCaptureId: number
    type: string
    createdAt: Date
  }
  mindNode: {
    id: string
    label: string
    nodeType: MindNodeType
    documentId: number
    state: string
  }
  recommendation: {
    id: string
    recommendationType: string
    status: string
    subjectType: string
    subjectId: number
    candidateType: string
    candidateId: string
  }
  recommendationEvent: {
    id: string
    eventType: string
  }
}

export function validateCaptureInput(input: CaptureToDocumentInput): string | null {
  if (!input.rawText || input.rawText.trim().length === 0) {
    return 'rawText must not be empty'
  }
  if (!input.userId || input.userId.trim().length === 0) {
    return 'userId must not be empty'
  }
  return null
}

export function extractDocumentTitle(rawText: string): string {
  const firstLine = rawText.trim().split('\n')[0].trim()
  if (firstLine.length <= 60) {
    return firstLine
  }
  return firstLine.slice(0, 57) + '...'
}
