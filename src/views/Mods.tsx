import { Card, Empty, Button } from 'aelux-components'
import { useApp, modrinth } from '../store'

export function Mods() {
  const { session } = useApp()

  async function openModrinth() {
    // 示例：通过 lib 拉取某整合包的版本列表（需真实 projectId）
    const versions = await modrinth.versions('example-pack', { game: '1.21', loader: 'fabric' })
    console.log('modrinth versions:', versions)
  }

  return (
    <div className="view">
      <h2>模组</h2>
      <Card title="Modrinth 分发">
        <p>从 Modrinth 获取整合包 / 模组 / 版本元数据与下载文件，作为主分发源。</p>
        <Button variant="secondary" onClick={openModrinth}>
          拉取示例版本列表
        </Button>
      </Card>

      <Empty title="暂无本地模组" description="安装整合包或添加模组后将在此展示，并支持依赖解析与哈希校验。" />
      {!session && <p className="mods__hint">提示：离线登录也可管理本地模组。</p>}
    </div>
  )
}
