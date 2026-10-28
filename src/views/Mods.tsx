import { useState } from 'react'
import { toast } from 'aelux-components'
import { useApp, modrinth } from '../store'
import { AlxCard } from '../components/AlxCard'

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
    <>
      <AlxCard title="Modrinth 分发">
        <p style={{ fontSize: 13, margin: '0 0 12px', opacity: 0.75 }}>
          从 Modrinth 获取整合包 / 模组 / 版本元数据与下载文件，作为主分发源。
        </p>
        <button type="button" className="alx-btn" disabled={busy} onClick={openModrinth}>
          {busy ? '拉取中…' : '拉取示例版本列表'}
        </button>
        {result && (
          <div className="alx-guide" style={{ marginTop: 12 }}>
            <div className="alx-guide__title">{result}</div>
            <div className="alx-guide__desc">Modrinth API · api.modrinth.com/v2</div>
          </div>
        )}
      </AlxCard>

      <AlxCard title="本地模组">
        <div className="alx-empty">
          <p>暂无本地模组。安装整合包或添加模组后将在此展示，并支持依赖解析与哈希校验。</p>
        </div>
        {!session && <p className="mods__hint">提示：离线登录也可管理本地模组。</p>}
      </AlxCard>
    </>
  )
}
