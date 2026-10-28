import { useState } from 'react'
import { Card, Button, Badge, Empty, Input, IconButton, toast, IconExternal, IconTrash, IconPlus } from 'aelux-components'
import { useApp } from '../store'

function address(s: { host: string; port?: number }) {
  return s.port ? `${s.host}:${s.port}` : s.host
}

export function Multiplayer() {
  const { servers, addServer, removeServer } = useApp()
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')

  async function handleAdd() {
    if (!name.trim() || !host.trim()) {
      toast.warning('请填写服务器名称与地址')
      return
    }
    await addServer({
      id: `${Date.now()}`,
      name: name.trim(),
      host: host.trim(),
      port: port ? Number(port) : undefined,
    })
    setName('')
    setHost('')
    setPort('')
    toast.success('已保存服务器')
  }

  async function handleCopy(s: { host: string; port?: number; name: string }) {
    const addr = address(s)
    try {
      await navigator.clipboard.writeText(addr)
      toast.success(`已复制地址：${addr}`)
    } catch {
      toast.info(`服务器地址：${addr}`)
    }
  }

  return (
    <div className="view">
      <div className="view__header">
        <h2>联机服务器</h2>
        <Badge status="info">{servers.length} 个</Badge>
      </div>

      <Card title="添加服务器" className="server-form-card">
        <div className="server-form">
          <div className="server-form__field">
            <label>名称</label>
            <Input placeholder="我的服务器" value={name} onChange={(e: any) => setName(e.target.value)} />
          </div>
          <div className="server-form__field">
            <label>地址</label>
            <Input placeholder="mc.example.com" value={host} onChange={(e: any) => setHost(e.target.value)} />
          </div>
          <div className="server-form__field">
            <label>端口</label>
            <Input placeholder="25565" value={port} onChange={(e: any) => setPort(e.target.value)} wrapperClassName="server-port" />
          </div>
          <Button variant="primary" leftIcon={<IconPlus size={15} />} onClick={handleAdd}>
            添加
          </Button>
        </div>
      </Card>

      {servers.length === 0 ? (
        <Empty title="还没有服务器" description="添加常用服务器地址，方便随时复制并加入联机。" />
      ) : (
        <div className="server-grid">
          {servers.map((s) => (
            <div key={s.id} className="server-card">
              <div className="server-card__name">{s.name}</div>
              <div className="server-card__host">{address(s)}</div>
              <div className="server-card__actions">
                <Button variant="secondary" size="sm" leftIcon={<IconExternal size={14} />} onClick={() => handleCopy(s)}>
                  复制地址
                </Button>
                <IconButton
                  size="sm"
                  variant="ghost"
                  label="删除服务器"
                  icon={<IconTrash size={15} />}
                  onClick={() => removeServer(s.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
