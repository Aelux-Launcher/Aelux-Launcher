import { useState } from 'react'
import { Card, Empty, Button, ListItem, toast } from 'aelux-components'
import { useApp, modrinth } from '../store'

/** 模组页内容（渲染在「更多」页的右栏）。 */
export function Mods() {
  const { session } = useApp()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function openModrinth() {
    setBusy(true)
    try {
      // 示例：通过 lib 拉取某整合包的版本列表（需真实 projectId）
      const versions = await modrinth.versions('example-pack', { game: '1.21', loader: 'fabric' })
      setResult(`Modrinth 返回 ${versions.length} 条版本记录`)
      toast.success('已从 Modrinth 获取版本列表')
    } catch (e) {
      toast.error(`拉取失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pcl-section">
      <div className="pcl-section__head">
        <h3>模组</h3>
      </div>

      <Card title="Modrinth 分发">
        <p>从 Modrinth 获取整合包 / 模组 / 版本元数据与下载文件，作为主分发源。</p>
        <Button variant="secondary" loading={busy} onClick={openModrinth}>
          拉取示例版本列表
        </Button>
        {result && (
          <div className="pcl-section__note">
            <ListItem title={result} description="Modrinth API · api.modrinth.com/v2" />
          </div>
        )}
      </Card>

      <Empty
        title="暂无本地模组"
        description="安装整合包或添加模组后将在此展示，并支持依赖解析与哈希校验。"
      />
      {!session && <p className="mods__hint">提示：离线登录也可管理本地模组。</p>}
    </div>
  )
}
