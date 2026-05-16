'use client'

import React, { useState, useRef } from 'react'
import { Sparkles, ArrowUp, X } from 'lucide-react'

interface QuickCaptureProps {
  onSubmit: (text: string) => Promise<void>
  variant?: 'center' | 'corner'
  hidden?: boolean
}

export default function QuickCapture({ onSubmit, variant = 'center', hidden = false }: QuickCaptureProps) {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (hidden) return null

  const placementClass = variant === 'corner'
    ? 'fixed bottom-5 right-5 z-[90]'
    : 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[90]'

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      setText('')
      setExpanded(false)
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      setExpanded(false)
      setText('')
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`${placementClass} flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/[0.04] backdrop-blur-[40px] border border-white/[0.06] hover:border-[#86d7ff]/30 hover:bg-white/[0.06] transition-all duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.3)] group`}
      >
        <Sparkles className="w-3.5 h-3.5 text-[#86d7ff]/60 group-hover:text-[#86d7ff] transition-colors duration-300" />
        <span className="text-[11px] text-[#899298] group-hover:text-white/70 transition-colors duration-300 font-light">Capture</span>
      </button>
    )
  }

  return (
    <div className={`${placementClass} ${variant === 'corner' ? 'w-[360px] max-w-[calc(100vw-2.5rem)]' : 'w-full max-w-md px-4'}`}>
      <div className="flex items-center gap-2 px-4 py-3 rounded-[22px] bg-white/[0.06] backdrop-blur-[40px] border border-white/[0.08] shadow-[0_12px_40px_rgba(0,0,0,0.4)] transition-all duration-300">
        <Sparkles className="w-3.5 h-3.5 text-[#86d7ff]/60 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="闪念捕获..."
          className="flex-1 bg-transparent text-[13px] text-[#e0e3e6] placeholder:text-[#899298]/50 outline-none font-light"
        />
        <button
          onClick={() => { setExpanded(false); setText('') }}
          className="p-1 rounded-full hover:bg-white/5 text-[#899298] hover:text-white transition-colors duration-200 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="p-1.5 rounded-full bg-[#86d7ff]/10 text-[#86d7ff] border border-[#86d7ff]/20 hover:bg-[#86d7ff]/20 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
