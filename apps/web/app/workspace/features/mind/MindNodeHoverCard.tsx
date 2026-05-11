'use client'

import React, { useMemo } from 'react'
import { X, Tag, Unlink2, Lock } from 'lucide-react'
import type { MindGraphSnapshot, MindGraphSnapshotEdge } from './types'
import { NODE_COLOR, getNodeTypeLabel } from './mindGraphStyle'

const BASELINE_REASON = 'baseline-auto-connect'

function isBaselineEdge(edge: MindGraphSnapshotEdge): boolean {
  return edge.reason === BASELINE_REASON
}

interface MindNodeHoverCardProps {
  nodeId: string
  snapshot: MindGraphSnapshot
  screenPos: { x: number; y: number }
  onUnlinkEdge: (edgeId: string) => void
}

export default function MindNodeHoverCard({
  nodeId,
  snapshot,
  screenPos,
  onUnlinkEdge,
}: MindNodeHoverCardProps) {
  const node = snapshot.nodes.find(n => n.id === nodeId)

  const connectedEdges = useMemo(
    () => snapshot.edges.filter(e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId),
    [snapshot.edges, nodeId],
  )

  const tagEdges = useMemo(
    () =>
      connectedEdges.filter(e => {
        const otherId = e.sourceNodeId === nodeId ? e.targetNodeId : e.sourceNodeId
        const otherNode = snapshot.nodes.find(n => n.id === otherId)
        return otherNode?.nodeType === 'tag'
      }),
    [connectedEdges, nodeId, snapshot.nodes],
  )

  const linkEdges = useMemo(
    () => connectedEdges.filter(e => !tagEdges.includes(e)),
    [connectedEdges, tagEdges],
  )

  if (!node) return null

  const getOtherNode = (edge: MindGraphSnapshotEdge) => {
    const otherId = edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId
    return snapshot.nodes.find(n => n.id === otherId)
  }

  const posX = Math.min(screenPos.x + 20, window.innerWidth - 280)
  const posY = Math.min(screenPos.y - 10, window.innerHeight - 400)

  return (
    <div
      className="fixed z-50 pointer-events-auto animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
      style={{
        left: posX,
        top: posY,
        width: 260,
        background: 'rgba(15,18,20,0.96)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 12,
        boxShadow: '0 16px 48px -8px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        overflow: 'hidden',
      }}
    >
      <div className="px-3.5 pt-3 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: NODE_COLOR[node.nodeType] || '#a78bfa' }}
          />
          <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
            {getNodeTypeLabel(node.nodeType)}
          </span>
        </div>
        <div className="text-[13px] font-semibold text-white/90 leading-snug truncate">
          {node.label}
        </div>
      </div>

      {tagEdges.length > 0 && (
        <div className="px-3.5 py-2.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-1.5 mb-2">
            <Tag size={10} className="text-[#8b5cf6]" />
            <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
              Tags
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tagEdges.map(edge => {
              const other = getOtherNode(edge)
              if (!other) return null
              const baseline = isBaselineEdge(edge)
              return (
                <span
                  key={edge.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#8b5cf6]/15 text-[#c4b5fd] border border-[#8b5cf6]/20"
                >
                  {other.label}
                  {baseline ? (
                    <span className="ml-0.5 p-0.5 text-white/20" title="基线连接，不可取消">
                      <Lock size={8} />
                    </span>
                  ) : (
                    <button
                      onClick={() => onUnlinkEdge(edge.id)}
                      className="ml-0.5 p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/70 transition-colors"
                      title="取消链接"
                    >
                      <X size={9} />
                    </button>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {linkEdges.length > 0 && (
        <div className="px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Unlink2 size={10} className="text-[#86d7ff]" />
            <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">
              Links
            </span>
            <span className="text-[10px] text-white/25 ml-auto">{linkEdges.length}</span>
          </div>
          <div className="flex flex-col gap-0.5 max-h-[180px] overflow-y-auto custom-scrollbar">
            {linkEdges.map(edge => {
              const other = getOtherNode(edge)
              if (!other) return null
              const baseline = isBaselineEdge(edge)
              return (
                <div
                  key={edge.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] group transition-colors"
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: NODE_COLOR[other.nodeType] || '#a78bfa' }}
                  />
                  <span className="text-[11px] text-white/70 truncate flex-1">
                    {other.label}
                  </span>
                  <span className="text-[9px] text-white/25 shrink-0">
                    {edge.edgeType.replace('_', ' ')}
                  </span>
                  {baseline ? (
                    <span className="text-white/15 shrink-0" title="基线连接，不可取消">
                      <Lock size={10} />
                    </span>
                  ) : (
                    <button
                      onClick={() => onUnlinkEdge(edge.id)}
                      className="p-1 rounded hover:bg-white/10 text-white/0 group-hover:text-white/40 hover:!text-red-400 transition-colors shrink-0"
                      title="取消链接"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tagEdges.length === 0 && linkEdges.length === 0 && (
        <div className="px-3.5 py-3 text-center">
          <span className="text-[11px] text-white/25">暂无关联链接</span>
        </div>
      )}
    </div>
  )
}
