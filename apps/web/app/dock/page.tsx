'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 旧版 Dock 独立页面 — 已废弃
 * 
 * Dock 功能已整合进 /workspace 页面的 "dock" 标签页。
 * 此页面仅做重定向，保留以兼容旧书签/链接。
 * 
 * 后端 API 仍可用：
 * - listDockItems(), archiveItem(), ignoreItem(), restoreItem(), suggestItem()
 *   来自 @/lib/repository
 * - getCurrentUser() 来自 @/lib/auth
 * 
 * To-do: 这些 API 需要在新 workspace DockView 中接入
 */
export default function DockPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/workspace')
  }, [router])

  return (
    <div className="flex h-screen items-center justify-center bg-[#0b0f11]">
      <div className="text-center">
        <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-blue-500 animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">正在跳转至工作区...</p>
      </div>
    </div>
  )
}
