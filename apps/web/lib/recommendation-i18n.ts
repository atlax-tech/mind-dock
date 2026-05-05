import type { RecommendationCandidateType, RecommendationStatus } from '@atlax/domain'

export const SUPPORTED_CANDIDATE_TYPES: RecommendationCandidateType[] = ['tag', 'project', 'mindNode']

export function isSupportedCandidateType(candidateType: string): candidateType is 'tag' | 'project' | 'mindNode' {
  return candidateType === 'tag' || candidateType === 'project' || candidateType === 'mindNode'
}

export function describeRecommendationAction(candidateType: RecommendationCandidateType, candidateId: string): string {
  const shortId = candidateId.length > 30 ? candidateId.slice(0, 30) + '…' : candidateId
  switch (candidateType) {
    case 'tag': return `建议添加标签: #${shortId}`
    case 'project': return `建议加入项目: ${shortId}`
    case 'mindNode': return `建议建立关联: ${shortId}`
    case 'entry': return `建议关联条目: ${shortId}`
    case 'document': return `建议关联文档: ${shortId}`
    default: return `建议操作: ${shortId}`
  }
}

export function describeRecommendationReason(
  candidateType: RecommendationCandidateType,
  reasonSummary: { reason: string },
  evidenceSummary?: { evidenceCount: number; matchedValues: string[] } | null,
): string {
  if (evidenceSummary && evidenceSummary.evidenceCount > 0 && evidenceSummary.matchedValues.length > 0) {
    const values = evidenceSummary.matchedValues.slice(0, 3).join('、')
    return `基于内容匹配（${values}）生成`
  }
  switch (candidateType) {
    case 'tag': return '根据内容分析，建议添加相关标签'
    case 'project': return '根据内容分析，建议归入相关项目'
    case 'mindNode': return '根据内容分析，建议建立知识关联'
    case 'entry': return '根据内容分析，建议关联相关条目'
    case 'document': return '根据内容分析，建议关联相关文档'
    default: return reasonSummary.reason
  }
}

export function describeApplyResult(
  candidateType: RecommendationCandidateType,
  candidateId: string,
  changeDetail?: string,
): string {
  if (changeDetail) return changeDetail
  switch (candidateType) {
    case 'tag': return `已添加标签: #${candidateId}`
    case 'project': return `已加入项目: ${candidateId}`
    case 'mindNode': return `已建立关联: ${candidateId}`
    default: return '建议已应用'
  }
}

export function describeApplyPreview(candidateType: RecommendationCandidateType, candidateId: string): string {
  switch (candidateType) {
    case 'tag': return `接受后将为当前条目添加标签 #${candidateId}`
    case 'project': return `接受后将当前条目归入项目「${candidateId}」（会替换当前项目）`
    case 'mindNode': return `接受后将在知识图谱中建立关联`
    case 'entry': return '暂不支持自动应用此类型建议'
    case 'document': return '暂不支持自动应用此类型建议'
    default: return '暂不支持自动应用此类型建议'
  }
}

export function formatConfidenceLevel(score: number): string {
  if (score >= 0.8) return '较高'
  if (score >= 0.5) return '一般'
  return '较低'
}

export const CANDIDATE_TYPE_LABELS: Record<RecommendationCandidateType, string> = {
  tag: '标签',
  project: '项目',
  mindNode: '知识节点',
  entry: '条目',
  document: '文档',
}

export const STATUS_LABELS: Record<RecommendationStatus, { label: string; color: string }> = {
  generated: { label: '待查看', color: 'text-yellow-400' },
  shown: { label: '已查看', color: 'text-blue-400' },
  accepted: { label: '已接受', color: 'text-emerald-400' },
  rejected: { label: '已拒绝', color: 'text-red-400' },
  modified: { label: '已调整', color: 'text-purple-400' },
  ignored: { label: '已忽略', color: 'text-gray-500' },
  superseded: { label: '已过期', color: 'text-slate-600' },
}

export function isRecommendationResolved(status: RecommendationStatus | string): boolean {
  return status === 'accepted' || status === 'rejected' || status === 'ignored' || status === 'superseded'
}

export function isRecommendationPending(status: RecommendationStatus | string): boolean {
  return status === 'generated' || status === 'shown'
}
