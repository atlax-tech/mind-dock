'use client'

import React from 'react'
import { ExternalLink, EyeOff, X, Link2, CornerDownLeft, ArrowRightLeft } from 'lucide-react'

interface MindNodeActionBarProps {
  selectedNodeId: string | null
  selectedNodeIsRoot?: boolean
  connectMode?: boolean
  changeParentMode?: boolean
  onConnect?: () => void
  onMoveParent?: () => void
  onOpen?: () => void
  onArchive?: () => void
  onClose?: () => void
  onCancelConnect?: () => void
  onCancelChangeParent?: () => void
}

export default function MindNodeActionBar({
  selectedNodeId,
  selectedNodeIsRoot = false,
  connectMode = false,
  changeParentMode = false,
  onConnect,
  onMoveParent,
  onOpen,
  onArchive,
  onClose,
  onCancelConnect,
  onCancelChangeParent,
}: MindNodeActionBarProps) {
  if (!selectedNodeId) return null

  if (connectMode) {
    return (
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-2xl shadow-2xl z-30 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
        style={{
          background: 'rgba(15,15,20,0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(134,215,255,0.3)',
          boxShadow: '0 20px 50px -12px rgba(0,0,0,0.7), 0 0 20px rgba(134,215,255,0.15)'
        }}
      >
        <div className="flex items-center gap-3 px-5 h-11">
          <Link2 size={16} className="text-[#86d7ff] animate-pulse" />
          <span className="text-[13px] font-bold text-[#86d7ff]">选择目标节点建立链接</span>
          <span className="text-[10px] text-[#8d989f]">点击节点完成连接</span>
        </div>
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button
          onClick={onCancelConnect}
          className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-[#8d989f] hover:text-white font-medium text-[12px] transition-all border border-white/5"
        >
          <CornerDownLeft size={14} />
          取消
        </button>
      </div>
    )
  }

  if (changeParentMode) {
    return (
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-2xl shadow-2xl z-30 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
        style={{
          background: 'rgba(15,15,20,0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(200,160,240,0.3)',
          boxShadow: '0 20px 50px -12px rgba(0,0,0,0.7), 0 0 20px rgba(200,160,240,0.15)'
        }}
      >
        <div className="flex items-center gap-3 px-5 h-11">
          <ArrowRightLeft size={16} className="text-[#c8a0f0] animate-pulse" />
          <span className="text-[13px] font-bold text-[#c8a0f0]">选择新的父节点</span>
          <span className="text-[10px] text-[#8d989f]">点击目标节点完成迁移</span>
        </div>
        <div className="w-px h-6 bg-white/10 mx-1" />
        <button
          onClick={onCancelChangeParent}
          className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-[#8d989f] hover:text-white font-medium text-[12px] transition-all border border-white/5"
        >
          <CornerDownLeft size={14} />
          取消
        </button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-2xl shadow-2xl z-30 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
      style={{
        background: 'rgba(15,15,20,0.9)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 20px 50px -12px rgba(0,0,0,0.7)'
      }}
    >
      <button
        onClick={onConnect}
        className="flex items-center gap-2 px-6 h-11 rounded-xl bg-[#86d7ff]/10 hover:bg-[#86d7ff]/20 text-[#86d7ff] font-bold text-[13px] transition-all border border-[#86d7ff]/20 hover:border-[#86d7ff]/40 group"
      >
        <Link2 size={16} className="group-hover:rotate-12 transition-transform" />
        Connect
      </button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <div className="flex items-center gap-1">
        <button
          onClick={onMoveParent}
          className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-[#c8a0f0] hover:text-[#d4b4f8] font-medium text-[12px] transition-all border border-white/5 hover:border-[#c8a0f0]/20"
        >
          <ArrowRightLeft size={14} />
          Move Parent
        </button>

        <button
          onClick={onOpen}
          className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-[12px] transition-all border border-white/5"
        >
          <ExternalLink size={14} className="text-[#9cf4d4]" />
          Open in Dock
        </button>

        <button
          onClick={onArchive}
          disabled={selectedNodeIsRoot}
          title={selectedNodeIsRoot ? '根节点不可隐藏' : '从图谱隐藏此节点'}
          className={`flex items-center gap-2 px-4 h-11 rounded-xl font-medium text-[12px] transition-all border ${
            selectedNodeIsRoot
              ? 'bg-white/[0.02] text-[#4a5568] border-white/[0.03] cursor-not-allowed'
              : 'bg-white/5 hover:bg-white/10 text-[#8d989f] hover:text-white border-white/5'
          }`}
        >
          <EyeOff size={14} className={selectedNodeIsRoot ? 'text-[#4a5568]' : ''} />
          隐藏
        </button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      <button
        onClick={onClose}
        className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-[#8d989f] hover:text-white transition-all border border-white/5"
      >
        <X size={18} />
      </button>
    </div>
  )
}
