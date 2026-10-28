import { useState } from 'react'
import { Card, Button, Badge, Input, toast, IconUser } from 'aelux-components'
import { useApp, auth, tauriAdapter } from '../store'

export function Account() {
  const { session } = useApp()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function offline() {
    if (!name.trim()) {
      toast.warning('请输入昵称')
      return
    }
    setBusy(true)
    try {
      const s = await auth.login('offline', { name: name.trim() })
      useApp.setState({ session: s })
      toast.success(`已以 ${s.username} 身份登录（离线）`)
    } finally {
      setBusy(false)
    }
  }

  async function microsoft() {
    // 真实流程：打开系统浏览器走 OAuth，由 app 注入的 acquireCode / exchangeCode 完成令牌换发。
    // 当前 lib 未注入 microsoft 依赖，这里仅演示打开授权页。
    await tauriAdapter.openExternal('https://login.live.com/oauth20_authorize.srf')
  }

  async function thirdParty() {
    await tauriAdapter.openExternal('https://account.aelux.app/oauth/authorize')
  }

  async function logout() {
    await auth.logout()
    useApp.setState({ session: null })
    toast.info('已退出登录')
  }

  if (session) {
    return (
      <div className="view">
        <h2>当前账号</h2>
        <Card title={session.username} className="account-card">
          <div className="account-card__meta">
            <Badge status={session.type === 'offline' ? 'info' : 'success'}>{session.type}</Badge>
            {session.roleId && <Badge status="info">角色 {session.roleId.slice(0, 8)}</Badge>}
          </div>
          <p className="account-card__uuid">UUID：{session.uuid}</p>
          <Button variant="secondary" onClick={logout}>
            退出登录
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="view">
      <h2>登录</h2>
      <div className="login-grid">
        <Card title="微软登录（正版）">
          <p>使用微软 / Xbox / Minecraft 账号登录，享受正版校验与皮肤同步。</p>
          <Button variant="primary" block leftIcon={<IconUser size={16} />} onClick={microsoft}>
            微软登录
          </Button>
        </Card>

        <Card title="第三方账号">
          <p>使用 Aelux 服务器账号体系登录，与白名单角色对齐。</p>
          <Button variant="primary" block onClick={thirdParty}>
            服务器账号登录
          </Button>
        </Card>

        <Card title="离线登录">
          <p>输入昵称即可离线游玩，完全本地可用，无需网络。</p>
          <Input placeholder="昵称" value={name} onChange={(e: any) => setName(e.target.value)} />
          <Button
            variant="secondary"
            block
            loading={busy}
            disabled={!name.trim()}
            onClick={offline}
          >
            离线启动
          </Button>
        </Card>
      </div>
    </div>
  )
}
