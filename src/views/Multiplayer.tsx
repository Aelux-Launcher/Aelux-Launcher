import { useEffect, useState } from 'react'
import { toast, IconExternal, IconTrash, IconPlus, IconSearch } from 'aelux-components'
import { useApp } from '../store'
import { AlxPage } from '../components/AlxPage'
import { AlxCard } from '../components/AlxCard'

function address(s: { host: string; port?: number }) {
  return s.port ? `${s.host}:${s.port}` : s.host
}

/**
 * 联机页：
 *   左栏：已保存的服务器列表；右栏：服务器详情 + 添加表单
 */
export function Multiplayer() {
  const { servers, addServer, removeServer } = useApp()
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!selectedId && servers.length > 0) setSelectedId(servers[0].id)
  }, [servers, selectedId])

  const filtered = servers.filter(
    (s) =>
      !query.trim() ||
      s.name.includes(query.trim()) ||
      s.host.includes(query.trim()),
  )
  const selected = servers.find((s) => s.id === selectedId) ?? null

  async function handleAdd() {
    if (!name.trim() || !host.trim()) {
      toast.warning('请填写服务器名称与地址')
      return
    }
    const id = `${Date.now()}`
    await addServer({ id, name: name.trim(), host: host.trim(), port: port ? Number(port) : undefined })
    setSelectedId(id)
    setName('')
    setHost('')
    setPort('')
    toast.success('已保存服务器')
  }

  async function handleCopy(s: { host: string; port?: number }) {
    const addr = address(s)
    try {
      await navigator.clipboard.writeText(addr)
      toast.success(`已复制地址：${addr}`)
    } catch {
      toast.info(`服务器地址：${addr}`)
    }
  }

  return (
    <AlxPage leftWidth={205} left={
      <div style={{ padding: '12px 10px' }}>
        <div className="alx-search" style={{ marginBottom: 12, height: 32, boxShadow: 'none', background: 'var(--alx-8)' }}>
          <IconSearch size={15} />
          <input placeholder="搜索服务器" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <div className="alx-nav-group" style={{ margin: '18px 4px' }}>
            还没有保存任何服务器
          </div>
        ) : (
          <div className="alx-nav">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`alx-nav-item${selectedId === s.id ? ' is-active' : ''}`}
                onClick={() => setSelectedId(s.id)}
              >
                <span className="alx-nav-item__check" aria-hidden="true" />
                <span className="alx-nav-item__title">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    }>
      {selected ? (
        <AlxCard title={selected.name}>
          <div className="alx-form-row">
            <div className="alx-form-row__label">服务器地址</div>
            <div className="alx-form-row__control" style={{ fontFamily: 'var(--aelux-font-mono)', fontSize: 13 }}>
              {address(selected)}
            </div>
          </div>
          <div className="alx-form-row">
            <div className="alx-form-row__label">端口</div>
            <div className="alx-form-row__control" style={{ fontSize: 13 }}>
              {selected.port ?? 25565}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button type="button" className="alx-btn alx-btn--primary" onClick={() => handleCopy(selected)}>
              <IconExternal size={13} />
              复制地址
            </button>
            <button
              type="button"
              className="alx-btn"
              onClick={() => {
                removeServer(selected.id)
                setSelectedId('')
              }}
            >
              <IconTrash size={13} />
              删除
            </button>
          </div>
        </AlxCard>
      ) : (
        <AlxCard title="添加服务器">
          <div className="alx-empty">
            <p>从左栏选择一个服务器查看详情，或在下方添加新的服务器。</p>
          </div>
        </AlxCard>
      )}

      <AlxCard title="添加服务器">
        <div className="alx-form-row">
          <div className="alx-form-row__label">名称</div>
          <div className="alx-form-row__control">
            <input className="alx-input" placeholder="我的服务器" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="alx-form-row">
          <div className="alx-form-row__label">地址</div>
          <div className="alx-form-row__control">
            <input className="alx-input" placeholder="mc.example.com" value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
        </div>
        <div className="alx-form-row">
          <div className="alx-form-row__label">端口</div>
          <div className="alx-form-row__control">
            <input className="alx-input" placeholder="25565" value={port} onChange={(e) => setPort(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="alx-btn alx-btn--primary" onClick={handleAdd}>
            <IconPlus size={13} />
            添加
          </button>
        </div>
      </AlxCard>
    </AlxPage>
  )
}
