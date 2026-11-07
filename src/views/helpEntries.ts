/**
 * 帮助条目库（「更多 → 帮助」页的分组与详情页共用）。
 *
 * 目前只保留与 Aelux Launcher 现有功能对应的三个案例教程：
 *   Minecraft 教程（草方块）、购买正版账号（命令方块）、手动选择 Java（干草块）。
 * 图标名来自 components/icons.ts 的图标注册表。
 */
import type { IconName } from '../components/icons'

/** 帮助条目。 */
export interface HelpEntry {
  /** 条目标识 */
  id: string
  /** 所属分组 */
  group: string
  /** 条目标题 */
  title: string
  /** 条目图标 */
  icon: IconName
  /** 正文段落 */
  paragraphs: string[]
  /** 相关链接 */
  links?: { label: string; url: string }[]
}

/** 帮助条目库（更多 → 帮助 页的分组会读它）。 */
export const HELP_ENTRIES: HelpEntry[] = [
  {
    id: 'minecraft-guide',
    group: '指南',
    title: 'Minecraft 教程',
    icon: 'grass-block',
    paragraphs: [
      '在「下载」页选择原版游戏，输入需要的版本号（例如 1.21.4），回车即可开始下载。',
      '下载完成后，在「版本选择」页找到该版本，点击行尾的播放按钮启动。首次启动会自动准备 Java 运行时与缺失的依赖库。',
      '如果启动失败，可以到「更多 → 日志」里查看该版本的启动日志，日志会写明失败原因。',
    ],
  },
  {
    id: 'buy-account',
    group: '指南',
    title: '购买正版账号',
    icon: 'command-block',
    paragraphs: [
      'Aelux Launcher 不提供账号售卖。请前往 Minecraft 官网或 Microsoft Store 购买 Minecraft: Java & Bedrock Edition。',
      '购买后回到「账户」页，点击「正版登录」，按提示在浏览器中完成 Microsoft 账号授权。',
      '登录成功后，启动器会自动读取正版账号的头像与皮肤；如果头像没有立即刷新，可以稍等片刻或重新进入账户页。',
    ],
    links: [{ label: 'Minecraft 官网', url: 'https://www.minecraft.net/zh-hans/store/minecraft-java-bedrock-edition-pc' }],
  },
  {
    id: 'choose-java',
    group: '指南',
    title: '手动选择 Java',
    icon: 'hay-block',
    paragraphs: [
      '启动器默认会优先使用自动下载的 Java 运行时，大多数情况下不需要手动设置。',
      '如果需要指定其他 Java，可以在「设置 → 启动」里关闭自动选择并填写 Java 可执行文件路径；也可以在「版本设置 → 启动选项」里只对当前版本生效。',
      '版本对应关系：Java 17 适合 1.17 – 1.20.4，Java 21 适合 1.20.5 及以上版本。选择不匹配的 Java 可能导致游戏无法启动。',
    ],
  },
]

/** 查找帮助条目。 */
export function findHelpEntry(id: string): HelpEntry | undefined {
  return HELP_ENTRIES.find((e) => e.id === id)
}
