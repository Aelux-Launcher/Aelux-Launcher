interface Props {
  size?: number
  className?: string
}

/**
 * 草方块图标 —— 仿 PCL 下载页里的 Minecraft 方块缩略图（等距立方体）。
 */
export function McBlockIcon({ size = 32, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* 顶面 */}
      <path d="M16 2.5 29 9.8v12.4L16 29.5 3 22.2V9.8L16 2.5Z" fill="#7c9a4c" />
      {/* 左面 */}
      <path d="M3 9.8 16 17.1v12.4L3 22.2V9.8Z" fill="#5f7539" />
      {/* 右面 */}
      <path d="M29 9.8 16 17.1v12.4l13-7.3V9.8Z" fill="#4c5f2e" />
      {/* 顶面草皮高光 */}
      <path d="M16 2.5 29 9.8l-13 7.3L3 9.8 16 2.5Z" fill="#8bb154" />
      {/* 泥土纹理 */}
      <path d="M6.5 14.2 13.5 17.8v3.1l-7-3.9v-2.8Z" fill="#6b4526" opacity=".55" />
      <path d="M9.5 20.4 13.5 22.3v3.1l-4-2.2v-2.8Z" fill="#6b4526" opacity=".4" />
      <path d="M18.5 20.6 22.5 18.5v2.8l-4 2.1v-2.8Z" fill="#6b4526" opacity=".45" />
    </svg>
  )
}
