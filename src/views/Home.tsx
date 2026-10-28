import { useEffect, useMemo, useState } from 'react'
import { toast, IconUser, IconSettings } from 'aelux-components'
import { useApp, auth, platform } from '../store'
import { AlxPage } from '../components/AlxPage'
import { AlxCard } from '../components/AlxCard'
import { AlxBlockIcon } from '../components/AlxBlockIcon'
import {
  AlxButton,
  AlxHint,
  AlxIconButton,
  AlxInput,
  AlxListItem,
  AlxPill,
} from '../components/AlxControls'

/**
 * 启动页（对齐上游启动器的启动页形态）：
 *   左栏（白底 · 300px）：账号区 → 登录方式 → 巨大启动按钮 → 版本选择 / 版本设置 → 实例列表
 *   右栏（浅蓝渐变）：登录提示条 + 启动日志
 *
 * 业务动作一律走 store 暴露的 action 或 lib-core 的类，视图只负责渲染。
 */

/** 登录方式 */
type LoginMode = 'official' | 'offline'

/** 会话类型 → 中文说明（提示条用） */
const SESSION_LABEL: Record<string, string> = {
  microsoft: '正版（微软账号）',
  third: '正版（服务器账号）',
  offline: '离线',
}

/** 加载器 → 中文名（实例副文本用） */
const LOADER_LABEL: Record<string, string> = {
  vanilla: '原版',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
}

export function Home() {
  const { instances, session, launchInstance, setView, openSubPage } = useApp()

  const [mode, setMode] = useState<LoginMode>('official')
  const [nickname, setNickname] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [launching, setLaunching] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  // 首次拿到实例列表时默认选中第一个。
  useEffect(() => {
    if (!selectedId && instances.length > 0) setSelectedId(instances[0].id)
  }, [instances, selectedId])

  // 会话变化时同步昵称与登录方式。
  useEffect(() => {
    if (!session) return
    setNickname(session.username)
    setMode(session.type === 'offline' ? 'offline' : 'official')
  }, [session])

  const selected = useMemo(
    () => instances.find((i) => i.id === selectedId) ?? instances[0] ?? null,
    [instances, selectedId],
  )

  const selectedLoader = selected ? (LOADER_LABEL[selected.loader ?? 'vanilla'] ?? '原版') : null

  function log(line: string) {
    setLogs((prev) => [...prev.slice(-200), line])
  }

  async function handleLaunch() {
    if (!selected) {
      log('没有可启动的实例，请先安装一个游戏版本。')
      setView('download')
      return
    }
    setLaunching(true)
    log(`准备启动 ${selected.name}（${selected.version}）…`)
    try {
      const r = await launchInstance(selected.id)
      if (r?.ok) {
        log(`游戏进程已启动${r.pid ? `（pid ${r.pid}）` : ''}。`)
        toast.success(`${selected.name} 已启动`)
      } else {
        log(`启动失败：${r?.error ?? '未知错误'}`)
        toast.error(`启动失败：${r?.error ?? '未知错误'}`)
      }
    } catch (e) {
      log(`启动异常：${(e as Error).message}`)
      toast.error(`启动异常：${(e as Error).message}`)
    } finally {
      setLaunching(false)
    }
  }

  /** 正版登录：打开系统浏览器走授权页，令牌换发由服务端中转完成。 */
  async function handleOfficialLogin() {
    log('正在打开微软账号授权页…')
    try {
      await platform.openExternal('https://login.live.com/oauth20_authorize.srf')
    } catch (e) {
      log(`无法打开授权页：${(e as Error).message}`)
      toast.error(`无法打开授权页：${(e as Error).message}`)
    }
  }

  /** 离线登录：以昵称派生离线身份，然后直接开始游戏。 */
  async function handleOfflineStart() {
    const name = nickname.trim()
    if (!name) {
      toast.warning('请输入游戏用户名')
      return
    }
    try {
      const s = await auth.login('offline', { name })
      useApp.setState({ session: s })
      log(`已使用离线身份「${s.username}」登录。`)
      if (selected) {
        await handleLaunch()
      } else {
        toast.info('离线登录成功，请先安装一个游戏版本')
      }
    } catch (e) {
      log(`离线登录失败：${(e as Error).message}`)
      toast.error(`离线登录失败：${(e as Error).message}`)
    }
  }

  /** 版本设置：进入当前实例的「设置」子页。 */
  function openInstanceSetup() {
    if (!selected) {
      toast.warning('请先安装一个游戏版本')
      return
    }
    openSubPage({ kind: 'instance', instanceId: selected.id, tab: 'setup' })
  }

  const left = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        padding: '14px 12px 18px',
        textAlign: 'center',
      }}
    >
      {/* ---------------- 顶部：登录入口 ---------------- */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => setView('more')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            border: 'none',
            background: 'transparent',
            color: 'var(--alx-3)',
            fontSize: 13,
            fontFamily: 'inherit',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <IconUser size={15} />
          {session ? `${session.username} 切换账号` : '离线登录'}
        </button>
      </div>

      {/* ---------------- 中部：头像 + 昵称 ---------------- */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 9,
          marginTop: 42,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 6,
            overflow: 'hidden',
            background: 'var(--alx-8)',
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
          }}
        >
          <AlxBlockIcon size={64} />
        </div>

        {session ? (
          <>
            <div style={{ fontSize: 15, lineHeight: '20px' }}>{session.username}</div>
            <div style={{ fontSize: 12, color: 'var(--alx-1)', opacity: 0.6 }}>
              {SESSION_LABEL[session.type] ?? session.type}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, lineHeight: '20px' }}>未登录</div>
            <div style={{ fontSize: 12, color: 'var(--alx-1)', opacity: 0.6 }}>
              点击上方按钮登录
            </div>
          </>
        )}
      </div>

      {/* ---------------- 中部偏下：登录方式 ---------------- */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          width: '100%',
          marginTop: 26,
        }}
      >
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <AlxPill active={mode === 'official'} onClick={() => setMode('official')}>
            正版
          </AlxPill>
          <AlxPill active={mode === 'offline'} onClick={() => setMode('offline')}>
            离线
          </AlxPill>
        </div>

        {mode === 'official' ? (
          <>
            <AlxInput
              value={nickname}
              onChange={setNickname}
              placeholder="游戏用户名"
              style={{ width: '100%' }}
            />
            <AlxButton block leftIcon={<IconUser size={14} />} onClick={handleOfficialLogin}>
              微软账号登录
            </AlxButton>
          </>
        ) : (
          <>
            <AlxInput
              value={nickname}
              onChange={setNickname}
              placeholder="游戏用户名"
              style={{ width: '100%' }}
            />
            <AlxButton block highlight onClick={handleOfflineStart}>
              开始游戏
            </AlxButton>
          </>
        )}
      </div>

      {/* ---------------- 当前实例列表 ----------------
          放在弹性空隙**之前**：实例多时列表先占位，把启动按钮推到可视区底部，
          列表本身超出则由左栏滚动，不会把底部按钮挤出窗口。 */}
      {instances.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            marginTop: 16,
            flex: 'none',
          }}
        >
          <div className="alx-nav-group" style={{ margin: '0 0 4px' }}>
            当前实例
          </div>
          {instances.map((inst) => (
            <div
              key={inst.id}
              style={{
                borderRadius: 3,
                textAlign: 'left',
                boxShadow:
                  selected?.id === inst.id ? 'inset 0 0 0 1px var(--alx-3)' : undefined,
              }}
            >
              <AlxListItem
                icon={<AlxBlockIcon size={32} />}
                title={inst.name}
                info={`${inst.version} · ${LOADER_LABEL[inst.loader ?? 'vanilla'] ?? '原版'}`}
                onClick={() => {
                  setSelectedId(inst.id)
                  log(`已选择实例 ${inst.name}。`)
                }}
                actions={
                  <AlxIconButton
                    label="实例设置"
                    onClick={() =>
                      openSubPage({ kind: 'instance', instanceId: inst.id, tab: 'setup' })
                    }
                  >
                    <IconSettings size={14} />
                  </AlxIconButton>
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* 弹性空隙：把启动按钮推到底部 */}
      <div style={{ flex: 1, minHeight: 18 }} />

      {/* ---------------- 底部：巨大启动按钮 ---------------- */}
      <button
        type="button"
        className="alx-btn"
        style={{
          width: '100%',
          height: 54,
          flex: 'none',
          borderRadius: 3,
          borderColor: 'var(--alx-3)',
          background: 'transparent',
          color: 'var(--alx-3)',
          flexDirection: 'column',
          gap: 2,
          padding: '0 8px',
        }}
        disabled={launching}
        onClick={handleLaunch}
      >
        <span style={{ fontSize: 15, lineHeight: '18px' }}>
          {selected ? '启动游戏' : '下载游戏'}
        </span>
        <span style={{ fontSize: 11, lineHeight: '14px', color: '#8c8c8c' }}>
          {selected ? `[${selectedLoader}]${selected.version}` : '未找到可用的游戏版本'}
        </span>
      </button>

      {/* ---------------- 底部：版本选择 / 版本设置 ---------------- */}
      <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 10, flex: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AlxButton block onClick={() => openSubPage({ kind: 'select' })}>
            版本选择
          </AlxButton>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AlxButton block onClick={openInstanceSetup}>
            版本设置
          </AlxButton>
        </div>
      </div>
    </div>
  )

  return (
    <AlxPage leftWidth={300} left={left} fill>
      <AlxHint theme="blue">
        {session
          ? `当前以「${session.username}」登录（${
              SESSION_LABEL[session.type] ?? session.type
            }），所在版本 ${
              selected ? `[${selectedLoader}]${selected.version}` : '无'
            }。修改版本请到「下载」页。`
          : '尚未登录。离线登录即可完全本地游玩；正版登录需要联网校验。'}
      </AlxHint>

      <AlxCard
        title="启动日志"
        extra={
          logs.length > 0 ? (
            <button
              type="button"
              style={{
                height: 24,
                padding: '0 10px',
                border: '1px solid var(--alx-5)',
                borderRadius: 3,
                background: 'transparent',
                color: 'var(--alx-1)',
                fontSize: 12,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
              onClick={() => setLogs([])}
            >
              清空
            </button>
          ) : undefined
        }
      >
        <div
          style={{
            fontFamily: 'var(--aelux-font-mono)',
            fontSize: 12,
            lineHeight: 1.9,
            color: 'var(--alx-1)',
            minHeight: 120,
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--alx-white-33)',
            borderRadius: 3,
            padding: '10px 12px',
          }}
        >
          {logs.length === 0 ? (
            <span
              style={{
                fontFamily: 'var(--aelux-font-sans)',
                color: 'var(--alx-gray-2)',
              }}
            >
              暂无日志，启动游戏后这里会显示启动过程。
            </span>
          ) : (
            logs.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {line}
              </div>
            ))
          )}
        </div>
      </AlxCard>
    </AlxPage>
  )
}
