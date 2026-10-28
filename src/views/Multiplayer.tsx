import { useEffect, useState } from 'react'
import {
  Button,
  Badge,
  Empty,
  Input,
  ListItem,
  toast,
  IconExternal,
  IconTrash,
  IconPlus,
} from 'aelux-components'
import { useApp } from '../store'
import { PclPage } from '../components/PclPage'

function address(s: { host: string; port?: number }) {
  return s.port ? `${s.host}:${s.port}` : s.host
}

/**
 * 联机页 —— 对应 PCL 的 `PageLink`：
 *   左栏：服务器列表；右栏：选中服务器详情 + 添加服务器表单
 */
export function Multiplayer() {
  const { servers, addServer, removeServer } = useApp()
  const [selectedId, setSelectedId] = useState<string>('')
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')

  useEffect(() => {
    if (!selectedId && servers.length > 0) setSelectedId(servers[0].id)
  }, [servers, selectedId])

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
    <PclPage
      leftWidth={260}
      left={
        <div className="pcl-link">
          <div className="pcl-link__search">
            <Input placeholder="搜索服务器…" size="sm" block />
          </div>
          {servers.length === 0 ? (
            <div className="pcl-link__empty">还没有保存任何服务器</div>
          ) : (
            <div className="pcl-link__list">
              {servers.map((s) => (
                <ListItem
                  key={s.id}
                  title={s.name}
                  description={address(s)}
                  selected={selectedId === s.id}
                  onClick={() => setSelectedId(s.id)}
                  className="pcl-page__nav-item"
                />
              ))}
            </div>
          )}
        </div>
      }
    >
      {selected ? (
        <div className="pcl-section">
          <div className="pcl-section__head">
            <h3>{selected.name}</h3>
            <Badge status="success">已保存</Badge>
          </div>
          <div className="pcl-server-detail">
            <div className="pcl-server-detail__row">
              <span>服务器地址</span>
              <code>{address(selected)}</code>
            </div>
            <div className="pcl-server-detail__row">
              <span>端口</span>
              <code>{selected.port ?? 25565}</code>
            </div>
            <div className="pcl-server-detail__actions">
              <Button variant="primary" leftIcon={<IconExternal size={15} />} onClick={() => handleCopy(selected)}>
                复制地址
              </Button>
              <Button
                variant="danger"
                leftIcon={<IconTrash size={15} />}
                onClick={() => {
                  removeServer(selected.id)
                  setSelectedId('')
                }}
              >
                删除
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Empty title="未选择服务器" description="从左栏选择一个服务器查看详情，或在下方添加新的服务器。" />
      )}

      <div className="pcl-section">
        <div className="pcl-section__head">
          <h3>添加服务器</h3>
        </div>
        <div className="pcl-form">
          <label className="pcl-form__field">
            <span>名称</span>
            <Input placeholder="我的服务器" value={name} onChange={(e: any) => setName(e.target.value)} />
          </label>
          <label className="pcl-form__field">
            <span>地址</span>
            <Input placeholder="mc.example.com" value={host} onChange={(e: any) => setHost(e.target.value)} />
          </label>
          <label className="pcl-form__field pcl-form__field--narrow">
            <span>端口</span>
            <Input placeholder="25565" value={port} onChange={(e: any) => setPort(e.target.value)} />
          </label>
          <Button variant="primary" leftIcon={<IconPlus size={15} />} onClick={handleAdd}>
            添加
          </Button>
        </div>
      </div>
    </PclPage>
  )
}
