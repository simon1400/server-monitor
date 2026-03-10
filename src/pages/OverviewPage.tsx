import SystemOverview from '../components/SystemOverview'
import SystemChart from '../components/SystemChart'
import type { MonitorData } from '../types'

export default function OverviewPage({ data }: { data: MonitorData }) {
  return (
    <>
      <SystemOverview system={data.system} />
      <SystemChart />
    </>
  )
}
