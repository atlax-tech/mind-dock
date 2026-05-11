'use client'

import React from 'react'
import { ArrowRight, ExternalLink, Archive, X, Clock } from 'lucide-react'

interface MindNodeActionBarProps {
  selectedNodeId: string | null
  onConnect?: () => void
  onMove?: () => void
  onOpen?: () => void
  onArchive?: () => void
  onClose?: () => void
}

export default function MindNodeActionBar({
  selectedNodeId,
  onConnect: _onConnect,
  onMove,
  onOpen,
  onArchive,
  onClose,
}: MindNodeActionBarProps) {
  if (!selectedNodeId) return null

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1.5 rounded-2xl shadow-2xl z-30 animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
      style={{ 
        background: 'rgba(15,15,20,0.9)', 
        backdropFilter: 'blur(20px)', 
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 20px 50px -12px rgba(0,0,0,0.7)'
      }}
    >
      {/* Primary Action: Connect (Planned - disabled) */}
      <button 
        disabled
        className="flex items-center gap-2 px-6 h-11 rounded-xl bg-white/5 text-[#8d989f] font-bold text-[13px] cursor-not-allowed opacity-60 border border-white/5 group"
        title="Connect feature is coming soon"
      >
        <Clock size={16} className="group-hover:rotate-12 transition-transform" />
        Connect
        <span className="text-[9px] font-semibold tracking-wider uppercase bg-[#c8a0f0]/20 text-[#c8a0f0] px-1.5 py-0.5 rounded">Planned</span>
      </button>

      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Secondary Actions */}
      <div className="flex items-center gap-1">
        <button 
          onClick={onMove}
          className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-[12px] transition-all border border-white/5"
        >
          <ArrowRight size={14} className="text-[#c8a0f0]" />
          Move to Cluster
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
          className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-[12px] transition-all border border-white/5"
        >
          <Archive size={14} className="text-[#8d989f]" />
          Archive
        </button>
      </div>

      <div className="w-px h-6 bg-white/10 mx-1" />

      {/* Close Button */}
      <button 
        onClick={onClose}
        className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-[#8d989f] hover:text-white transition-all border border-white/5"
      >
        <X size={18} />
      </button>
    </div>
  )
}
