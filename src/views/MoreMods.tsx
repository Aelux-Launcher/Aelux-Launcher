import { useEffect, useState } from 'react'
import { toast } from 'aelux-components'
import { localModsRepo, resourceSearch, useApp } from '../store'
import { AlxCard } from '../components/AlxCard'
import { AlxBlockIcon } from '../components/AlxBlockIcon'
import { AlxButton, AlxListItem } from '../components/AlxControls'
import { Note } from './CommonUi'
import type { LocalMod } from 'aelux-launcher-lib'

/**
 * 本地模组 + 社区资源拉取（原「模组」页的内容，现并入「百宝箱」下方）。
 *
 * 数据全部走 lib-core：
 *   - 本地模组清单由 LocalModRepository 提供（平台层扫描实例目录）；
 *   - 社区资源元数据由 ResourceSearch 提供。
 */
export function ModsPanel() {
  const { instances } = useApp()
  const [mods, setMods] = useState<LocalMod[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  // 汇总所有实例下的本地模组。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const lists = await Promise.all(instances.map((i) => localModsRepo.list(i.id)))
      if (cancelled) return
      setMods(lists.flat())
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [instances])

  async function pullFromCommunity() {
    setBusy(true)
    try {
      const res = await resourceSearch.search({
        keyword: '',
        kind: 'mod',
        source: 'all',
        size: 20,
      })
      setResult(`社区源返回 ${res.total} 条资源记录`)
      toast.success('已从社区源获取资源列表')
    } catch (e) {
      toast.error(`拉取失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AlxCard title="本地模组">
        {loading ? (
          <div className="alx-empty">
            <p>正在读取本地模组…</p>
          </div>
        ) : mods.length === 0 ? (
          <div className="alx-empty">
            <p>暂无本地模组。安装整合包或添加模组后将在此展示，并支持依赖解析与哈希校验。</p>
          </div>
        ) : (
          mods.map((m) => (
            <AlxListItem
              key={m.id}
              icon={<AlxBlockIcon size={32} />}
              title={m.name}
              info={`${m.fileName}${m.version ? ` · ${m.version}` : ''}`}
            />
          ))
        )}
      </AlxCard>

      <AlxCard title="社区资源">
        <Note>
          从社区源获取模组、整合包与版本元数据，作为主分发源。拉取结果只用于浏览，
          实际安装仍以本地模组目录为准。
        </Note>

        <div style={{ marginTop: 12 }}>
          <AlxButton disabled={busy} onClick={() => void pullFromCommunity()}>
            {busy ? '拉取中…' : '拉取资源列表'}
          </AlxButton>
        </div>

        {result && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--alx-1)', opacity: 0.75 }}>
            {result}
          </div>
        )}
      </AlxCard>
    </>
  )
}
