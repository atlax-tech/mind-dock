import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Atlax MindDock',
  description: '知识结构操作系统 — 管理、探索、创作',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-[#0b0f11]">{children}</body>
    </html>
  )
}