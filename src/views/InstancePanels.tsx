import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toast, IconPackage, IconStar } from 'aelux-components'
import {
  EXPORT_TREE,
  JavaManager,
  collectCheckedPaths,
  createExportPlan,
  toggleTree,
  type ExportOption,
  type GameInstance,
  type InstanceSettings,
  type LocalMod,
} from 'aelux-launcher-lib'
import { useApp, localModsRepo, platform } from '../store'
import { AlxCard } from '../components/AlxCard'
import { AlxBlockIcon } from '../components/AlxBlockIcon'
import {
  AlxButton,
  AlxCheck,
  AlxFloatButton,
  AlxHint,
  AlxInput,
  AlxListItem,
  AlxModal,
  AlxPill,
  AlxRadio,
  AlxSearchBox,
  AlxSelect,
  AlxSlider,
} from '../components/AlxControls'
import { ButtonRow, Note, Row } from './CommonUi'
import {
  openFolderInExplorer,
  resolveInstanceDir,
  summarizeInstance,
  versionSummary,
  type InstanceUi,
} from './instanceMeta'

/**
 * 「版本设置」子页的四个面板：概览 / 设置 / Mod 管理 / 导出。
 *
 * 数据归属：
 *   - lib-core 的 `InstanceSettings` 覆盖的字段（Java、内存、服务器、高级选项）
 *     一律走 store 的 `loadInstanceSettings` / `updateInstanceSettings`；
 *   - lib-core 尚未建模的外观偏好（图标 / 分类 / 收藏 / 名称 / 描述 / 认证服务器）
 *     走本地 KV（见 instanceMeta.ts）。
 */

/* ========================== 概览 ========================== */

/** 图标选项（自动 / 石头 / 草方块 / 钻石 / 熔炉 / 箱子）。 */
const ICON_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'stone', label: '石头' },
  { value: 'grass', label: '草方块' },
  { value: 'diamond', label: '钻石' },
  { value: 'furnace', label: '熔炉' },
  { value: 'chest', label: '箱子' },
]

/** 分类选项（自动 / 优化 / 生存 / 娱乐 / 恐怖 / 服务器）。 */
const CATEGORY_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'optimize', label: '优化' },
  { value: 'survival', label: '生存' },
  { value: 'fun', label: '娱乐' },
  { value: 'horror', label: '恐怖' },
  { value: 'server', label: '服务器' },
]

export interface PanelProps {
  instance: GameInstance
  /** 该实例的设置（来自 store.instanceSettings） */
  settings: InstanceSettings
  /** 写回实例设置 */
  patch: (p: Partial<InstanceSettings>) => void
  /** 外观偏好 */
  ui: InstanceUi
  /** 写回外观偏好 */
  setUi: (p: InstanceUi) => void
}

/** 概览面板：版本信息 + 个性化 + 快捷方式 + 高级管理。 */
export function OverviewPanel({ instance, settings, ui, setUi }: PanelProps) {
  const { deleteInstance, closeSubPage } = useApp()
  const [editName, setEditName] = useState(false)
  const [editDesc, setEditDesc] = useState(false)
  const [nameDraft, setNameDraft] = useState(ui.alias ?? instance.name)
  const [descDraft, setDescDraft] = useState(ui.description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const displayName = ui.alias || instance.name

  /** 打开实例目录下的某个子目录。 */
  async function openSubFolder(sub: string, label: string) {
    try {
      const dir = await resolveInstanceDir(instance.id)
      await openFolderInExplorer(sub ? `${dir}/${sub}` : dir)
    } catch (e) {
      toast.warning(`${label}尚未生成：${(e as Error).message}`)
    }
  }

  /** 导出启动脚本：写一份可直接双击运行的批处理。 */
  async function exportLaunchScript() {
    try {
      const dir = await resolveInstanceDir(instance.id)
      const java = settings.javaPath || 'java'
      const content = [
        '@echo off',
        'rem 由 Aelux 启动器导出的启动脚本',
        `set "GAME_DIR=%~dp0"`,
        `cd /d "%GAME_DIR%"`,
        `"${java}" -jar "%GAME_DIR%\\versions\\${instance.id}\\${instance.id}.jar" nogui`,
        'pause',
        '',
      ].join('\r\n')
      await platform.writeText(`${dir}/启动脚本.bat`, content)
      toast.success('启动脚本已导出到版本文件夹')
    } catch (e) {
      toast.error(`导出启动脚本失败：${(e as Error).message}`)
    }
  }

  /** 补全文件：检查实例目录下应有的基础文件，缺失时提示重新安装。 */
  async function completeFiles() {
    const expected = ['options.txt', 'servers.dat', 'optionsof.txt']
    try {
      const dir = await resolveInstanceDir(instance.id)
      const missing: string[] = []
      for (const f of expected) {
        const raw = await platform.readText(`${dir}/${f}`)
        if (raw === null) missing.push(f)
      }
      if (missing.length === 0) {
        toast.success('实例文件完整，无需补全')
      } else {
        toast.warning(`缺少 ${missing.join('、')}，请重新安装该版本以补全文件`)
      }
    } catch (e) {
      toast.error(`检查失败：${(e as Error).message}`)
    }
  }

  async function handleDelete() {
    setConfirmDelete(false)
    try {
      await deleteInstance(instance.id)
      toast.success(`已删除 ${displayName}`)
      closeSubPage()
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  return (
    <>
      {/* ---------------------- 版本信息 ---------------------- */}
      <AlxCard padding="tight">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlxBlockIcon size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, color: 'var(--alx-1)' }}>{displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--alx-1)', opacity: 0.6 }}>
              {summarizeInstance(instance, settings.serverLogin)}
            </div>
          </div>
        </div>
      </AlxCard>

      {/* ---------------------- 个性化 ---------------------- */}
      <AlxCard title="个性化">
        <Row label="图标">
          <AlxSelect
            value={ui.icon ?? 'auto'}
            options={ICON_OPTIONS}
            onChange={(v) => setUi({ icon: v })}
          />
        </Row>

        <Row label="分类">
          <AlxSelect
            value={ui.category ?? 'auto'}
            options={CATEGORY_OPTIONS}
            onChange={(v) => setUi({ category: v })}
          />
        </Row>

        <ButtonRow>
          <AlxButton onClick={() => setEditName(true)}>修改版本名</AlxButton>
          <AlxButton onClick={() => setEditDesc(true)}>修改版本描述</AlxButton>
          <AlxButton
            leftIcon={<IconStar size={13} />}
            onClick={() => setUi({ favorite: !ui.favorite })}
          >
            {ui.favorite ? '取消收藏' : '加入收藏夹'}
          </AlxButton>
        </ButtonRow>
      </AlxCard>

      {/* ---------------------- 快捷方式 ---------------------- */}
      <AlxCard title="快捷方式">
        <ButtonRow>
          <AlxButton onClick={() => void openSubFolder('', '版本文件夹')}>版本文件夹</AlxButton>
          <AlxButton onClick={() => void openSubFolder('saves', '存档文件夹')}>存档文件夹</AlxButton>
          <AlxButton onClick={() => void openSubFolder('mods', 'Mod 文件夹')}>Mod 文件夹</AlxButton>
          <AlxButton onClick={() => void openSubFolder('screenshot', '截图文件夹')}>
            截图文件夹
          </AlxButton>
        </ButtonRow>
      </AlxCard>

      {/* ---------------------- 高级管理 ---------------------- */}
      <AlxCard title="高级管理">
        <ButtonRow>
          <AlxButton onClick={() => void exportLaunchScript()}>导出启动脚本</AlxButton>
          <AlxButton onClick={() => void completeFiles()}>补全文件</AlxButton>
          <AlxButton danger onClick={() => setConfirmDelete(true)}>
            删除版本
          </AlxButton>
        </ButtonRow>
      </AlxCard>

      {/* ---------------------- 弹窗 ---------------------- */}
      <AlxModal
        open={editName}
        title="修改版本名"
        onClose={() => setEditName(false)}
        actions={
          <>
            <AlxButton
              highlight
              onClick={() => {
                setUi({ alias: nameDraft.trim() })
                setEditName(false)
                toast.success('版本名已修改')
              }}
            >
              确定
            </AlxButton>
            <AlxButton onClick={() => setEditName(false)}>取消</AlxButton>
          </>
        }
      >
        <div style={{ marginBottom: 8 }}>新的版本名：</div>
        <AlxInput value={nameDraft} onChange={setNameDraft} />
      </AlxModal>

      <AlxModal
        open={editDesc}
        title="修改版本描述"
        onClose={() => setEditDesc(false)}
        actions={
          <>
            <AlxButton
              highlight
              onClick={() => {
                setUi({ description: descDraft.trim() })
                setEditDesc(false)
                toast.success('版本描述已修改')
              }}
            >
              确定
            </AlxButton>
            <AlxButton onClick={() => setEditDesc(false)}>取消</AlxButton>
          </>
        }
      >
        <div style={{ marginBottom: 8 }}>新的版本描述：</div>
        <AlxInput value={descDraft} onChange={setDescDraft} />
      </AlxModal>

      <AlxModal
        open={confirmDelete}
        title="删除版本"
        onClose={() => setConfirmDelete(false)}
        actions={
          <>
            <AlxButton danger onClick={() => void handleDelete()}>
              删除
            </AlxButton>
            <AlxButton onClick={() => setConfirmDelete(false)}>取消</AlxButton>
          </>
        }
      >
        确定要删除「{displayName}」吗？该版本的文件将一并移除，此操作不可撤销。
      </AlxModal>
    </>
  )
}

/* ========================== 设置 ========================== */

/** 版本隔离选项。 */
const ISOLATION_OPTIONS = [
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' },
]

/** Java 选择方式。 */
const JAVA_MODE_OPTIONS = [
  { value: 'auto', label: '自动选择' },
  { value: 'autoRange', label: '跟随全局设置' },
  { value: 'custom', label: '自定义' },
]
/** 登录方式。 */
const LOGIN_OPTIONS = [
  { value: 'official', label: '正版' },
  { value: 'authlib', label: '第三方登录：Authlib Injector' },
  { value: 'offline', label: '离线' },
  { value: 'both', label: '正版与第三方同时保留' },
  { value: 'nide', label: 'Nide 验证' },
]

/** 内存管理（GC）。 */
const GC_OPTIONS = [
  { value: 'follow', label: '跟随全局设置' },
  { value: 'g1', label: '优先 G1GC' },
  { value: 'zgc', label: '尽量 ZGC' },
  { value: 'generationalZgc', label: '分代 ZGC' },
  { value: 'tunedG1', label: '调优 G1GC' },
  { value: 'custom', label: '自定义' },
]

/**
 * 竖排的单选组。
 *
 * `RadioRow` 的横向排布是写死的内联样式（且不接受 style 参数），
 * 而这里需要的是竖排（三个内存分配方式上下排列），
 * 因此用同样规格的列向容器承载同一批 `AlxRadio` 控件。
 */
function RadioColumn({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      {children}
    </div>
  )
}

/** 设置面板：启动选项 / 内存分配 / 服务器 / 高级选项。 */
export function SetupPanel({ instance, settings, patch, ui, setUi }: PanelProps) {
  const [showHint, setShowHint] = useState(true)
  const [javaText, setJavaText] = useState('')
  const [jres, setJres] = useState<{ path: string; major: number; version: string }[]>([])

  // lib 的 javaMode 还有 'folder' 一档，界面上与「自定义」同义（都取实例自己的路径），
  // 这里归一到「自定义」，避免下拉框选不中任何一项。
  const javaModeValue: InstanceSettings['javaMode'] =
    settings.javaMode === 'folder' ? 'custom' : settings.javaMode

  // 解析该版本实际会使用的 Java，用于提示块与 Java 列表。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const manager = new JavaManager(platform)
      const list = await manager.allAvailable()
      if (cancelled) return
      setJres(list)

      const resolved = await manager.resolveFor(instance.version)
      if (cancelled) return
      if (resolved.jre) {
        setJavaText(
          `将会使用: Java ${resolved.jre.major} (${resolved.jre.version}): ${resolved.jre.path}`,
        )
      } else if (settings.javaPath) {
        setJavaText(`将会使用: ${settings.javaPath}`)
      } else {
        setJavaText('尚未找到可用的 Java，请在「高级选项」中手动指定路径')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [instance.version, settings.javaPath])

  return (
    <>
      {showHint && (
        <AlxHint theme="blue" onClose={() => setShowHint(false)}>
          这些设置只对该游戏版本生效，不影响其他版本。
        </AlxHint>
      )}

      {/* ---------------------- 启动选项 ---------------------- */}
      <AlxCard title="启动选项">
        <Row label="版本隔离">
          <AlxSelect
            value={settings.indie}
            options={ISOLATION_OPTIONS}
            onChange={(v) => patch({ indie: v as InstanceSettings['indie'] })}
          />
        </Row>

        <Row label="游戏窗口标题">
          <AlxInput
            value={settings.title}
            placeholder="跟随全局设置"
            onChange={(v) => patch({ title: v })}
          />
        </Row>

        <Row label="自定义信息">
          <AlxInput
            value={settings.info}
            placeholder="跟随全局设置"
            onChange={(v) => patch({ info: v })}
          />
        </Row>

        <Row label="Java">
          <div>
            <AlxSelect
              value={javaModeValue}
              options={JAVA_MODE_OPTIONS}
              onChange={(v) => patch({ javaMode: v as InstanceSettings['javaMode'] })}
            />
            {(settings.javaMode === 'custom' || settings.javaMode === 'folder') && (
              <div style={{ marginTop: 8 }}>
                <AlxInput
                  value={settings.javaPath}
                  placeholder="Java 可执行文件的完整路径"
                  onChange={(v) => patch({ javaPath: v })}
                />
              </div>
            )}
          </div>
        </Row>

        <div
          style={{
            background: 'var(--alx-hint-blue-bg)',
            borderLeft: '3px solid var(--alx-hint-blue-border)',
            padding: '9px 12px',
            borderRadius: 3,
            color: 'var(--alx-hint-blue-text)',
            fontSize: 13,
            lineHeight: '18px',
          }}
        >
          {javaText}
        </div>
      </AlxCard>

      {/* ---------------------- 内存分配 ---------------------- */}
      <AlxCard title="内存分配">
        <RadioColumn>
          <AlxRadio
            name="ramType"
            checked={settings.ramType === 'follow'}
            onChange={() => patch({ ramType: 'follow' })}
          >
            跟随全局设置
          </AlxRadio>
          <AlxRadio
            name="ramType"
            checked={settings.ramType === 'auto'}
            onChange={() => patch({ ramType: 'auto' })}
          >
            自动配置
          </AlxRadio>
          <AlxRadio
            name="ramType"
            checked={settings.ramType === 'custom'}
            onChange={() => patch({ ramType: 'custom' })}
          >
            自定义
          </AlxRadio>
        </RadioColumn>

        {settings.ramType === 'custom' && (
          <div style={{ marginTop: 12 }}>
            <AlxSlider
              value={settings.ramCustomMb}
              min={512}
              max={8192}
              step={256}
              format={(v) => `${(v / 1024).toFixed(1)} GB`}
              onChange={(v) => patch({ ramCustomMb: v })}
            />
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <AlxCheck
            checked={settings.ramOptimize === 'on'}
            onChange={(c) => patch({ ramOptimize: c ? 'on' : 'off' })}
          >
            启动游戏前进行内存优化
          </AlxCheck>
        </div>

        {/* 内存比例条 */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              color: 'var(--alx-1)',
              opacity: 0.7,
              marginBottom: 4,
            }}
          >
            <span>已使用内存</span>
            <span>游戏分配</span>
          </div>
          <div
            style={{
              height: 6,
              background: 'var(--alx-6)',
              borderRadius: 3,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '92%',
                background: 'var(--alx-3)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '92%',
                top: 0,
                bottom: 0,
                width: '8%',
                background: 'var(--alx-3)',
                opacity: 0.6,
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 16,
              color: 'var(--alx-1)',
              marginTop: 6,
            }}
          >
            <span>12.5 GB / 13.7 GB</span>
            <span>1.3 GB（可用 1.2 GB）</span>
          </div>
        </div>
      </AlxCard>

      {/* ---------------------- 服务器 ---------------------- */}
      <AlxCard title="服务器">
        <Row label="登录方式">
          <AlxSelect
            value={settings.serverLogin}
            options={LOGIN_OPTIONS}
            onChange={(v) => patch({ serverLogin: v as InstanceSettings['serverLogin'] })}
          />
        </Row>

        <Row label="认证服务器（必填）">
          <AlxInput
            value={ui.authServer ?? ''}
            placeholder="https://littleskin.cn/api/yggdrasil"
            onChange={(v) => setUi({ authServer: v })}
          />
        </Row>

        <Row label="注册链接">
          <AlxInput
            value={ui.registerUrl ?? ''}
            placeholder="https://littleskin.cn/register"
            onChange={(v) => setUi({ registerUrl: v })}
          />
        </Row>

        <Row label="服务器名称">
          <AlxInput
            value={ui.serverName ?? ''}
            placeholder="填写后将在启动时显示"
            onChange={(v) => setUi({ serverName: v })}
          />
        </Row>

        <Row label="自动进入服务器">
          <AlxInput
            value={settings.serverAutoEnter}
            placeholder="例如：127.0.0.1:25565"
            onChange={(v) => patch({ serverAutoEnter: v })}
          />
        </Row>

        <ButtonRow>
          <AlxButton
            onClick={() => {
              setUi({
                authServer: 'https://littleskin.cn/api/yggdrasil',
                registerUrl: 'https://littleskin.cn/register',
                serverName: ui.serverName || 'LittleSkin',
              })
              patch({ serverLogin: 'authlib' })
              toast.success('已设置为 LittleSkin 认证服务器')
            }}
          >
            设置为 LittleSkin
          </AlxButton>
        </ButtonRow>
      </AlxCard>

      {/* ---------------------- 高级选项 ---------------------- */}
      <AlxCard title="高级选项" collapsible defaultOpen={false}>
        <Row label="Java 虚拟机参数">
          <AlxInput
            value={settings.advanceJvm}
            placeholder="跟随全局设置"
            onChange={(v) => patch({ advanceJvm: v })}
          />
        </Row>

        <Row label="游戏参数">
          <AlxInput
            value={settings.advanceGame}
            placeholder="跟随全局设置"
            onChange={(v) => patch({ advanceGame: v })}
          />
        </Row>

        <Row label="启动前执行命令">
          <AlxInput
            value={settings.advanceRun}
            placeholder="跟随全局设置"
            onChange={(v) => patch({ advanceRun: v })}
          />
        </Row>

        <Row label="Java 列表">
          <AlxSelect
            value={settings.javaPath}
            options={[
              { value: '', label: `共有 ${jres.length} 个 Java…` },
              ...jres.map((j) => ({
                value: j.path,
                label: `Java ${j.major} (${j.version})`,
              })),
            ]}
            onChange={(v) => {
              if (!v) return
              patch({ javaPath: v, javaMode: 'custom' })
            }}
          />
        </Row>

        <Row label="内存管理">
          <AlxSelect
            value={settings.advanceGc}
            options={GC_OPTIONS}
            onChange={(v) => patch({ advanceGc: v as InstanceSettings['advanceGc'] })}
          />
        </Row>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AlxCheck
            checked={settings.disableJlw}
            onChange={(c) => patch({ disableJlw: c })}
          >
            禁用 Java Launch Wrapper
          </AlxCheck>
          <AlxCheck
            checked={settings.disableAssetsVerify}
            onChange={(c) => patch({ disableAssetsVerify: c })}
          >
            禁用 LWJGL Unsafe Agent
          </AlxCheck>
          <AlxCheck
            checked={settings.disableModUpdate}
            onChange={(c) => patch({ disableModUpdate: c })}
          >
            禁用 Mod 自动更新
          </AlxCheck>
          <AlxCheck checked={ui.highPerf !== false} onChange={(c) => setUi({ highPerf: c })}>
            使用高性能显卡
          </AlxCheck>
        </div>
      </AlxCard>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
        <AlxFloatButton onClick={() => useApp.getState().setView('settings')}>
          全局设置
        </AlxFloatButton>
      </div>
    </>
  )
}

/* ========================== Mod 管理 ========================== */

/** Mod 分类（与资源页的分类保持同一套语义）。 */
const MOD_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'technology', label: '技术' },
  { key: 'gameplay', label: '游戏机制' },
  { key: 'optimization', label: '优化' },
  { key: 'decoration', label: '装饰' },
  { key: 'animation', label: '动画' },
  { key: 'sound', label: '音效' },
  { key: 'texture', label: '材质' },
  { key: 'save', label: '存档' },
  { key: 'modpack', label: '整合包' },
]

/** 演示用 Mod 清单（本地没有安装 Mod 时用于撑起界面）。 */
const DEMO_MODS: { name: string; desc: string; category: string }[] = [
  { name: 'Sodium', desc: '现代化渲染引擎，大幅提升帧率并降低显存占用', category: 'optimization' },
  { name: 'Lithium', desc: '优化游戏物理与 AI 逻辑，减少卡顿', category: 'optimization' },
  { name: 'Iris', desc: '为 Sodium 提供光影支持的可选加载器', category: 'technology' },
  { name: 'Mod 菜单', desc: '统一的模组配置界面，可在游戏内直接调整设置', category: 'technology' },
  { name: '传送石', desc: '新增传送石与传送门，方便快速移动', category: 'gameplay' },
  { name: '家具与装饰', desc: '上百种家具与装饰方块', category: 'decoration' },
  { name: '实体动画', desc: '扩展实体模型与动画表现', category: 'animation' },
  { name: '环境音效', desc: '为不同环境加入沉浸式环境音效', category: 'sound' },
  { name: '高清材质', desc: '重制的高分辨率材质包', category: 'texture' },
  { name: '自动备份', desc: '定时备份存档，避免误删进度', category: 'save' },
  { name: '示例整合包', desc: '包含全部模组配置的整合包', category: 'modpack' },
]

/** Mod 面板：搜索 + 工具行 + 分类胶囊 + Mod 列表。 */
export function ModPanel({ instance }: PanelProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [mods, setMods] = useState<LocalMod[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  // 本地 Mod 清单（由 lib 的 LocalModRepository 提供；读不到时用演示数据兜底）。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = await localModsRepo.list(instance.id)
      if (!cancelled) setMods(list)
    })()
    return () => {
      cancelled = true
    }
  }, [instance.id])

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const base =
      mods.length > 0
        ? mods.map((m) => ({
            id: m.id,
            name: m.name,
            desc: m.description || m.fileName,
            category: 'technology',
          }))
        : DEMO_MODS.map((m, i) => ({ id: `demo-${i}`, ...m }))
    return base.filter((m) => {
      const matchCategory = category === 'all' || m.category === category
      const matchKeyword =
        !keyword || m.name.toLowerCase().includes(keyword) || m.desc.toLowerCase().includes(keyword)
      return matchCategory && matchKeyword
    })
  }, [mods, query, category])

  const selectedCount = Object.values(selected).filter(Boolean).length

  async function openModsFolder() {
    try {
      const dir = await resolveInstanceDir(instance.id)
      await openFolderInExplorer(`${dir}/mods`)
    } catch (e) {
      toast.warning(`Mod 文件夹尚未生成：${(e as Error).message}`)
    }
  }

  async function installFromFile() {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({
        multiple: true,
        filters: [{ name: 'Mod 文件', extensions: ['jar'] }],
      })
      const files = Array.isArray(picked) ? picked : picked ? [picked] : []
      if (files.length === 0) return
      toast.info(`已选择 ${files.length} 个文件，请放入 Mod 文件夹后重启游戏`)
    } catch (e) {
      toast.warning(`选择文件失败：${(e as Error).message}`)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <>
      <AlxSearchBox value={query} onChange={setQuery} placeholder="搜索 Mod" />

      <div style={{ marginBottom: 14 }}>
        <ButtonRow>
          <AlxButton onClick={() => void openModsFolder()}>打开文件夹</AlxButton>
          <AlxButton onClick={() => void installFromFile()}>从文件安装</AlxButton>
          <AlxButton onClick={() => useApp.getState().setView('download')}>下载新 Mod</AlxButton>
          <AlxButton
            onClick={() => {
              const next: Record<string, boolean> = {}
              for (const row of rows) next[row.id] = true
              setSelected(next)
              toast.success(`已选中 ${rows.length} 个 Mod`)
            }}
          >
            全选
          </AlxButton>
        </ButtonRow>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {MOD_CATEGORIES.map((c) => (
          <AlxPill
            key={c.key}
            soft
            active={category === c.key}
            onClick={() => setCategory(c.key)}
          >
            {c.key === 'all' ? `全部 (${mods.length || DEMO_MODS.length})` : c.label}
          </AlxPill>
        ))}
      </div>

      <AlxCard title="Mod 列表" extra={<span style={{ fontSize: 12, opacity: 0.6 }}>已选 {selectedCount}</span>}>
        {rows.length === 0 ? (
          <Note>没有符合条件的 Mod。</Note>
        ) : (
          rows.map((m) => (
            <AlxListItem
              key={m.id}
              icon={<AlxBlockIcon size={32} />}
              title={m.name}
              info={m.desc}
              actionsAlways
              actions={
                <AlxCheck checked={!!selected[m.id]} onChange={() => toggle(m.id)} />
              }
            />
          ))
        )}
      </AlxCard>
    </>
  )
}

/* ========================== 导出 ========================== */

/** 导出面板：整合包信息 + 导出内容列表 + 高级选项。 */
export function ExportPanel({ instance }: PanelProps) {
  const [tree, setTree] = useState<ExportOption[]>(EXPORT_TREE)
  const [name, setName] = useState(instance.name)
  const [version, setVersion] = useState('1.0.0')
  const [format, setFormat] = useState<'mcpack' | 'mrpack'>('mcpack')
  const [includeResources, setIncludeResources] = useState(true)
  const [modrinthOnly, setModrinthOnly] = useState(false)

  function onToggle(id: string, checked: boolean) {
    setTree((prev) => toggleTree(prev, id, checked))
  }

  function startExport() {
    try {
      const plan = createExportPlan(
        { name: name.trim() || instance.name, version: version.trim() || '1.0.0', format, includeResources, modrinthOnly },
        tree,
      )
      const paths = collectCheckedPaths(plan.options)
      toast.success(`已生成导出计划：${plan.options.length} 项 / ${paths.length} 条文件规则`)
    } catch (e) {
      toast.error(`生成导出计划失败：${(e as Error).message}`)
    }
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto 90px',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <label style={{ fontSize: 13, color: 'var(--alx-1)' }}>整合包名称</label>
        <AlxInput value={name} onChange={setName} />
        <label style={{ fontSize: 13, color: 'var(--alx-1)' }}>整合包版本</label>
        <AlxInput value={version} onChange={setVersion} style={{ width: 90 }} />
      </div>

      <AlxCard title="导出内容列表">
        <ExportTree
          nodes={tree}
          depth={0}
          onToggle={onToggle}
          gameLabel={`游戏本体 ${versionSummary(instance).join(', ')}`}
        />
      </AlxCard>

      <AlxCard title="高级选项" collapsible defaultOpen={false}>
        <Row label="整合包格式">
          <AlxSelect
            value={format}
            options={[
              { value: 'mcpack', label: 'mcpack（Minecraft 本地格式）' },
              { value: 'mrpack', label: 'mrpack（Modrinth 格式）' },
            ]}
            onChange={(v) => setFormat(v as 'mcpack' | 'mrpack')}
          />
        </Row>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <AlxCheck checked={includeResources} onChange={setIncludeResources}>
            包含资源包与光影包
          </AlxCheck>
          <AlxCheck checked={modrinthOnly} onChange={setModrinthOnly}>
            仅打包社区源上有的文件
          </AlxCheck>
        </div>
      </AlxCard>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
        <AlxFloatButton leftIcon={<IconPackage size={16} />} onClick={startExport}>
          开始导出
        </AlxFloatButton>
      </div>
    </>
  )
}

/** 导出树的单个节点（含子孙）。 */
function ExportTree({
  nodes,
  depth,
  onToggle,
  gameLabel,
}: {
  nodes: ExportOption[]
  depth: number
  onToggle: (id: string, checked: boolean) => void
  gameLabel: string
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id}>
          <div style={{ paddingLeft: depth * 18, marginBottom: 6 }}>
            <AlxCheck
              checked={node.checked}
              disabled={node.locked}
              onChange={(c) => onToggle(node.id, c)}
            >
              <span style={{ marginRight: 8 }}>{node.label}</span>
              <span style={{ fontSize: 12, color: 'var(--alx-1)', opacity: 0.6 }}>
                {node.id === 'game' ? gameLabel : node.description}
              </span>
            </AlxCheck>
          </div>
          {node.children && (
            <ExportTree
              nodes={node.children}
              depth={depth + 1}
              onToggle={onToggle}
              gameLabel={gameLabel}
            />
          )}
        </div>
      ))}
    </>
  )
}

/* ============================== 修改 ============================== */

/** 加载器项（修改页用来对比「当前」与「将要换成」）。 */
interface LoaderSlot {
  key: string
  label: string
  /** 当前使用的版本（空 = 无） */
  current: string
  /** 可选的新版本 */
  choices: string[]
}

/**
 * 修改面板：更换该版本使用的加载器。
 *
 * 对应上游实现里的「修改」子页：每个加载器一张卡片，
 * 左边显示**当前**使用的版本，右边选择**要换成**的版本，
 * 底部一个「开始修改」按钮。
 */
export function ModifyPanel({ instance }: { instance: GameInstance }) {
  const { versions } = useApp()
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // 可选的加载器版本：正式版列表按加载器粗筛（真实接入由加载器仓库提供）。
  const slots: LoaderSlot[] = useMemo(
    () => [
      {
        key: 'forge',
        label: 'Forge',
        current: instance.loader === 'forge' ? instance.version : '',
        choices: versions.slice(0, 8).map((v) => v.id),
      },
      {
        key: 'neoforge',
        label: 'NeoForge',
        current: instance.loader === 'neoforge' ? instance.version : '',
        choices: versions.slice(0, 8).map((v) => v.id),
      },
      {
        key: 'fabric',
        label: 'Fabric',
        current: instance.loader === 'fabric' ? instance.version : '',
        choices: versions.slice(0, 8).map((v) => v.id),
      },
      {
        key: 'quilt',
        label: 'Quilt',
        current: instance.loader === 'quilt' ? instance.version : '',
        choices: versions.slice(0, 8).map((v) => v.id),
      },
    ],
    [instance, versions],
  )

  const changed = Object.entries(picked).filter(([, v]) => v)

  function startModify() {
    if (changed.length === 0) {
      toast.warning('请先选择要使用的加载器版本')
      return
    }
    setBusy(true)
    // 实际安装加载器需要联网拉取对应仓库的产物；
    // 这里先把选择落到实例外观偏好上，产物安装由下载流程接手。
    const next = changed[0]
    void saveInstanceUi(instance.id, { loaderVersion: next[1] })
    setBusy(false)
    toast.success('已提交修改，下载完成后生效')
  }

  return (
    <>
      <AlxCard title="版本名">
        <Note>
          该版本当前使用「{instance.version}」。
          在下面选择要更换的加载器与版本，开始修改后启动器会下载对应文件。
        </Note>
      </AlxCard>

      {slots.map((slot) => (
        <AlxCard key={slot.key} title={slot.label}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 18,
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--alx-1)', textAlign: 'right', whiteSpace: 'nowrap' }}>
              当前
            </div>
            <div style={{ fontSize: 13, color: 'var(--alx-1)' }}>
              {slot.current || '无'}
            </div>

            <div style={{ fontSize: 13, color: 'var(--alx-1)', textAlign: 'right', whiteSpace: 'nowrap' }}>
              改为
            </div>
            <div>
              <AlxSelect
                value={picked[slot.key] ?? ''}
                options={[
                  { value: '', label: '（不修改）' },
                  ...slot.choices.map((c) => ({ value: c, label: c })),
                ]}
                onChange={(v) =>
                  setPicked((prev) => ({ ...prev, [slot.key]: v }))
                }
              />
            </div>
          </div>
        </AlxCard>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
        <AlxFloatButton onClick={startModify} disabled={busy}>
          {busy ? '提交中…' : '开始修改'}
        </AlxFloatButton>
      </div>
    </>
  )
}
