import { useEffect, useMemo, useState } from 'react'
import { toast, IconFolder, IconPackage, IconPlus, IconSettings, IconStar, IconTrash } from 'aelux-components'
import type { GameInstance } from 'aelux-launcher-lib'
import { useApp, platform } from '../store'
import { AlxPage } from '../components/AlxPage'
import { AlxCard } from '../components/AlxCard'
import { AlxNavItem } from '../components/AlxNavItem'
import { AlxBlockIcon } from '../components/AlxBlockIcon'
import { AlxButton, AlxIconButton, AlxListItem, AlxModal } from '../components/AlxControls'
import { LOADER_LABEL, loadInstanceUiMap, saveInstanceUi, summarizeInstance, type InstanceUi } from './instanceMeta'

/**
 * 版本选择子页（从主页「版本选择」进入）。
 *
 * 左栏：当前 Minecraft 文件夹 + 添加/导入入口。
 * 右栏：按加载器分组的实例列表。
 *
 * 实例清单来自 store 的 `instances`；点击实例进入该实例的设置子页。
 */

/** 分组标题 → 该组实例。 */
interface InstanceGroup {
  key: string
  /** 卡片标题，例如「Fabric 版本」 */
  label: string
  items: GameInstance[]
}

/** 按加载器分组：没有加载器的归入「常规版本」。 */
function groupInstances(instances: GameInstance[]): InstanceGroup[] {
  const groups = new Map<string, InstanceGroup>()
  for (const inst of instances) {
    const key = inst.loader ?? 'vanilla'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: key === 'vanilla' ? '常规版本' : `${LOADER_LABEL[key] ?? key} 版本`,
        items: [],
      }
      groups.set(key, group)
    }
    group.items.push(inst)
  }
  // 「常规版本」排在最前，其余按加载器名排序。
  return [...groups.values()].sort((a, b) => {
    if (a.key === 'vanilla') return -1
    if (b.key === 'vanilla') return 1
    return a.label.localeCompare(b.label, 'zh-CN')
  })
}

/** 版本选择页。 */
export function Select() {
  const { instances, instanceSettings, openSubPage, deleteInstance, setView, loadInstanceSettings } =
    useApp()

  const [folderPath, setFolderPath] = useState('')
  const [folderName, setFolderName] = useState('.minecraft')
  const [uiMap, setUiMap] = useState<Record<string, InstanceUi>>({})
  const [pendingDelete, setPendingDelete] = useState<GameInstance | null>(null)

  // 当前 Minecraft 目录：优先取启动器的数据目录，取不到时退回全局设置里的实例目录。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      let path = ''
      try {
        const dataDir = await platform.invoke<string>('get_data_dir')
        path = `${dataDir}/.aelux/minecraft`
      } catch {
        path = ''
      }
      if (cancelled) return
      setFolderPath(path)
      setFolderName(path ? path.split(/[\\/]/).filter(Boolean).pop() ?? '.minecraft' : '.minecraft')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 列表里的每个实例都读一次设置，副文本才能显示各自的登录方式。
  useEffect(() => {
    for (const inst of instances) {
      void loadInstanceSettings(inst.id)
    }
  }, [instances, loadInstanceSettings])

  // 收藏等外观偏好。
  useEffect(() => {
    let cancelled = false
    void loadInstanceUiMap().then((map) => {
      if (!cancelled) setUiMap(map)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo(() => groupInstances(instances), [instances])

  async function toggleFavorite(inst: GameInstance) {
    const next = !(uiMap[inst.id]?.favorite ?? false)
    setUiMap((prev) => ({ ...prev, [inst.id]: { ...(prev[inst.id] ?? {}), favorite: next } }))
    await saveInstanceUi(inst.id, { favorite: next })
    toast.success(next ? `已收藏 ${inst.name}` : `已取消收藏 ${inst.name}`)
  }

  async function confirmDelete() {
    const inst = pendingDelete
    setPendingDelete(null)
    if (!inst) return
    try {
      await deleteInstance(inst.id)
      toast.success(`已删除 ${inst.name}`)
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  const left = (
    <div className="alx-nav">
      {/* 当前文件夹：副文本显示完整路径，右侧齿轮进入全局设置。 */}
      <div>
        <div className="alx-nav-group">文件夹列表</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <AlxNavItem title={folderName} info={folderPath || '（未找到 Minecraft 目录）'} />
          </div>
          <AlxIconButton
            label="文件夹设置"
            onClick={() => {
              setView('settings')
              toast.info('请在全局设置中调整实例目录')
            }}
          >
            <IconSettings size={14} />
          </AlxIconButton>
        </div>
      </div>

      <div>
        <div className="alx-nav-group">添加或导入</div>
        <AlxNavItem
          title="添加已有文件夹"
          icon={<IconPlus size={17} />}
          onClick={() => toast.info('请选择已有的 Minecraft 文件夹后导入')}
        />
        <AlxNavItem
          title="导入整合包"
          icon={<IconPackage size={17} />}
          onClick={() => toast.info('请选择整合包文件后导入')}
        />
        <AlxNavItem
          title="新建 Minecraft 文件夹"
          icon={<IconFolder size={17} />}
          onClick={() => toast.info('新建文件夹后可在此安装新的游戏版本')}
        />
      </div>
    </div>
  )

  return (
    <AlxPage left={left} leftWidth={250}>
      {groups.length === 0 ? (
        <AlxCard title="无可用版本">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 12px' }}>
            <div
              style={{
                width: 120,
                height: 2,
                background: 'var(--alx-3)',
                borderRadius: 1,
              }}
            />
            <div
              style={{
                fontSize: 13,
                lineHeight: '20px',
                color: 'var(--alx-1)',
                opacity: 0.7,
                textAlign: 'center',
              }}
            >
              当前还没有已安装的游戏版本。到「下载」页选择一个版本并安装，
              完成后它会出现在这里，随时可以单独调整它的启动参数与 Mod。
            </div>
            <AlxButton highlight onClick={() => setView('download')}>
              下载游戏
            </AlxButton>
          </div>
        </AlxCard>
      ) : (
        groups.map((group) => (
          <AlxCard
            key={group.key}
            title={`${group.label} (${group.items.length})`}
            extra={
              <span style={{ fontSize: 12, color: 'var(--alx-1)', opacity: 0.6 }}>
                共 {group.items.length} 个
              </span>
            }
          >
            {group.items.map((inst) => (
              <AlxListItem
                key={inst.id}
                icon={<AlxBlockIcon size={32} />}
                title={inst.name}
                info={summarizeInstance(inst, instanceSettings[inst.id]?.serverLogin)}
                onClick={() =>
                  openSubPage({ kind: 'instance', instanceId: inst.id, tab: 'overall' })
                }
                actions={
                  <>
                    <AlxIconButton
                      label="实例设置"
                      onClick={() =>
                        openSubPage({ kind: 'instance', instanceId: inst.id, tab: 'setup' })
                      }
                    >
                      <IconSettings size={14} />
                    </AlxIconButton>
                    <AlxIconButton label="删除版本" onClick={() => setPendingDelete(inst)}>
                      <IconTrash size={14} />
                    </AlxIconButton>
                    <AlxIconButton
                      label={uiMap[inst.id]?.favorite ? '取消收藏' : '收藏'}
                      onClick={() => void toggleFavorite(inst)}
                    >
                      <IconStar size={14} />
                    </AlxIconButton>
                  </>
                }
              />
            ))}
          </AlxCard>
        ))
      )}

      <AlxModal
        open={!!pendingDelete}
        title="删除版本"
        onClose={() => setPendingDelete(null)}
        actions={
          <>
            <AlxButton danger onClick={() => void confirmDelete()}>
              删除
            </AlxButton>
            <AlxButton onClick={() => setPendingDelete(null)}>取消</AlxButton>
          </>
        }
      >
        确定要删除「{pendingDelete?.name}」吗？该版本的文件将一并移除，此操作不可撤销。
      </AlxModal>
    </AlxPage>
  )
}
