import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useDashboardData, type DashboardStats } from '../../hooks/useDashboardData'
import { toast } from '../../lib/toast'
import { AREAS } from '../../lib/constants'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function exportActiveCSV() {
  const { data: projects } = await supabase
    .from('projects')
    .select('title, priority, project_type, status, is_blocked, due_date, sla_target_date, created_at, requests(requester_area), project_flows(flow_type, current_phase, assigned_to)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (!projects?.length) { toast.info('No hay proyectos activos para exportar.'); return }

  const PRIORITY_ES: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }
  const TYPE_ES: Record<string, string> = { development: 'Desarrollo', administrative: 'Administrativo', dual: 'Dual' }

  const headers = ['Proyecto', 'Área', 'Prioridad', 'Tipo', 'Bloqueado', 'Fase Dev', 'Fase Admin', 'SLA Vencimiento', 'Fecha creación']
  const rows = projects.map(p => {
    const flows: any[] = (p as any).project_flows ?? []
    const devFlow  = flows.find((f: any) => f.flow_type === 'development')
    const admFlow  = flows.find((f: any) => f.flow_type === 'administrative')
    return [
      p.title,
      (p as any).requests?.requester_area ?? '',
      PRIORITY_ES[p.priority] ?? p.priority,
      TYPE_ES[p.project_type] ?? p.project_type,
      p.is_blocked ? 'Sí' : 'No',
      devFlow?.current_phase ?? '',
      admFlow?.current_phase ?? '',
      (p as any).sla_target_date ?? '',
      (p.created_at as string)?.slice(0, 10) ?? '',
    ]
  })

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `proyectos-activos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportCompletedCSV() {
  const { data: projects } = await supabase
    .from('projects')
    .select('id, title, priority, project_type, start_date, updated_at, requests(requester_area)')
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })

  if (!projects?.length) { toast.info('No hay proyectos completados para exportar.'); return }

  const ids = projects.map(p => p.id)
  const { data: slaLogs } = await supabase
    .from('activity_logs')
    .select('project_id, details')
    .eq('action', 'sla_completed')
    .in('project_id', ids)

  const slaMap: Record<string, any> = {}
  for (const l of slaLogs ?? []) slaMap[l.project_id] = l.details

  const PRIORITY_ES: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }
  const TYPE_ES: Record<string, string> = { development: 'Desarrollo', administrative: 'Administrativo', dual: 'Dual' }

  const headers = ['Proyecto', 'Área', 'Prioridad', 'Tipo', 'Fecha Inicio', 'Fecha Completado', 'Cycle Time (d)', 'Lead Time (d)', 'SLA Vencimiento', 'A Tiempo']
  const rows = projects.map(p => {
    const sla = slaMap[p.id] ?? {}
    return [
      p.title,
      (p as any).requests?.requester_area ?? '',
      PRIORITY_ES[p.priority] ?? p.priority,
      TYPE_ES[p.project_type] ?? p.project_type,
      p.start_date ?? '',
      (p.updated_at as string)?.slice(0, 10) ?? '',
      sla.cycle_time_days ?? sla.days_elapsed ?? '',
      sla.lead_time_days ?? '',
      sla.due_date ?? '',
      sla.on_time === true ? 'Sí' : sla.on_time === false ? 'No' : '',
    ]
  })

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `proyectos-completados-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Reusable components ──────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: {
  label: string; value: number | string; color: string; icon: string
}) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${color} p-5 shadow-sm flex items-center gap-4`}>
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function HBarChart({ title, items }: {
  title: string
  items: { label: string; value: number; color: string }[]
}) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <h3 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">{title}</h3>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-24 shrink-0 truncate">{item.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold text-gray-700 w-5 text-right">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SLABreakdown({ sla }: { sla: DashboardStats['sla'] }) {
  const rateColor = sla.rate >= 80 ? 'text-green-600' : sla.rate >= 60 ? 'text-yellow-500' : 'text-red-500'
  const barColor  = sla.rate >= 80 ? 'bg-green-500' : sla.rate >= 60 ? 'bg-yellow-400' : 'bg-red-500'

  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <h3 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">Cumplimiento SLA</h3>
      {sla.total === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">Sin proyectos completados aún</p>
      ) : (
        <div className="flex items-center gap-6">
          <div className="text-center shrink-0">
            <p className={`text-5xl font-bold ${rateColor}`}>{sla.rate}%</p>
            <p className="text-xs text-gray-400 mt-1">{sla.total} proyectos</p>
          </div>
          <div className="flex-1">
            <div className="h-6 rounded-full overflow-hidden bg-red-100 flex">
              <div className={`${barColor} transition-all duration-700`} style={{ width: `${sla.rate}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-green-600 font-medium">✓ {sla.onTime} a tiempo</span>
              <span className="text-red-500 font-medium">⚠ {sla.late} fuera de SLA</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuarterlyChart({ data }: { data: DashboardStats['completedByQuarter'] }) {
  const max = Math.max(...data.map(d => d.total), 1)

  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <h3 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">Entregas por Quarter (Q1 - Q4)</h3>
      {data.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6">Sin datos en el período seleccionado</p>
      ) : (
        <>
          <div className="flex items-end gap-3 h-28 pt-2">
            {data.map(d => {
              const late      = d.total - d.onTime
              const heightPct = Math.max((d.total / max) * 100, 6)
              const onTimePct = d.total > 0 ? (d.onTime / d.total) * 100 : 0
              const latePct   = 100 - onTimePct
              return (
                <div key={d.quarter} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-600 font-bold">{d.total}</span>
                  <div className="w-full max-w-[48px] flex flex-col-reverse overflow-hidden rounded-md shadow-xs" style={{ height: `${heightPct}%` }}>
                    <div className="bg-green-500 transition-all duration-500" style={{ height: `${onTimePct}%` }} />
                    {late > 0 && <div className="bg-red-400 transition-all duration-500" style={{ height: `${latePct}%` }} />}
                  </div>
                  <span className="text-xs font-semibold text-gray-700 text-center mt-1">{d.quarter}</span>
                </div>
              )
            })}
          </div>
          <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded-sm bg-green-500" /> A tiempo
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded-sm bg-red-400" /> Fuera de SLA
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 30,   label: 'Últimos 30d' },
  { value: 90,   label: 'Últimos 90d' },
  { value: null, label: 'Todo el tiempo' },
] as const

const TYPE_VIEW_OPTIONS = [
  { value: null,             label: '🌐 Global' },
  { value: 'development',    label: '💻 Development' },
  { value: 'administrative', label: '📋 Administrative' },
] as const

export default function DashboardView() {
  const [period, setPeriod] = useState<number | null>(null)
  const [areaFilter, setAreaFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'completed' | 'active' | null>(null)
  const { stats, loading, reload } = useDashboardData(period, areaFilter, typeFilter)

  const handleExportCompleted = async () => {
    setExporting('completed')
    try { await exportCompletedCSV() }
    finally { setExporting(null) }
  }

  const handleExportActive = async () => {
    setExporting('active')
    try { await exportActiveCSV() }
    finally { setExporting(null) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Cargando métricas...</p>
        </div>
      </div>
    )
  }

  if (!stats) return null

  const priorityItems = [
    { label: '🔴 Urgente', value: stats.byPriority.urgent, color: 'bg-red-500' },
    { label: '🟠 Alta',    value: stats.byPriority.high,   color: 'bg-orange-500' },
    { label: '🟡 Media',   value: stats.byPriority.medium, color: 'bg-yellow-400' },
    { label: '🟢 Baja',    value: stats.byPriority.low,    color: 'bg-green-500' },
  ]

  const typeItems = [
    { label: '💻 Development',    value: stats.byType.development,   color: 'bg-blue-500' },
    { label: '📋 Administrative', value: stats.byType.administrative, color: 'bg-purple-500' },
    { label: '🔀 Dual',           value: stats.byType.dual,          color: 'bg-indigo-400' },
  ]

  const areaItems = Object.entries(stats.byArea)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => {
      const colors = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500']
      return { label, value, color: colors[i % colors.length] }
    })

  const cycleLabel = stats.sla.avgCycleTime !== null ? `${stats.sla.avgCycleTime}d` : '—'
  const leadLabel  = stats.sla.avgLeadTime  !== null ? `${stats.sla.avgLeadTime}d`  : '—'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📈 Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">
            {typeFilter === 'development' ? 'Vista: solo proyectos de Development' : typeFilter === 'administrative' ? 'Vista: solo proyectos Administrativos' : 'Vista global — todos los proyectos'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro de período */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  period === opt.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Filtro por tipo (vista) */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
            {TYPE_VIEW_OPTIONS.map(opt => (
              <button
                key={String(opt.value)}
                onClick={() => setTypeFilter(opt.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  typeFilter === opt.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Filtro de área */}
          <select
            value={areaFilter ?? ''}
            onChange={e => setAreaFilter(e.target.value || null)}
            className={`px-3 py-2 border rounded-lg text-sm outline-none transition cursor-pointer ${
              areaFilter ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            <option value="">Todas las áreas</option>
            {AREAS.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>

          <button
            onClick={handleExportActive}
            disabled={exporting !== null}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
          >
            {exporting === 'active' ? '⏳ Exportando...' : '⬇ Activos CSV'}
          </button>
          <button
            onClick={handleExportCompleted}
            disabled={exporting !== null}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
          >
            {exporting === 'completed' ? '⏳ Exportando...' : '⬇ Completados CSV'}
          </button>
          <button
            onClick={reload}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition shadow-sm"
          >
            ↺ Actualizar
          </button>
        </div>
      </div>

      {/* Stat Cards — proyectos (siempre todo el tiempo) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total"       value={stats.total}             icon="📊" color="border-blue-500" />
        <StatCard label="Activos"     value={stats.byStatus.active}   icon="🟢" color="border-green-500" />
        <StatCard label="Completados" value={stats.byStatus.completed} icon="✅" color="border-emerald-500" />
        <StatCard label="Archivados"  value={stats.byStatus.archived}  icon="📦" color="border-gray-400" />
        <StatCard label="Bloqueados"  value={stats.blocked}            icon="🚫" color="border-red-500" />
        <StatCard label="Vencidos"    value={stats.overdue}            icon="⚠️" color="border-orange-500" />
      </div>

      {/* Stat Cards — métricas de tiempo (filtradas por período) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`bg-white rounded-xl border-l-4 p-5 shadow-sm ${
          stats.sla.total === 0 ? 'border-gray-300' :
          stats.sla.rate >= 80 ? 'border-green-500' :
          stats.sla.rate >= 60 ? 'border-yellow-400' : 'border-red-500'
        }`}>
          <div className="flex items-center gap-4">
            <span className="text-3xl">🎯</span>
            <div>
              <p className={`text-3xl font-bold ${
                stats.sla.total === 0 ? 'text-gray-400' :
                stats.sla.rate >= 80 ? 'text-green-600' :
                stats.sla.rate >= 60 ? 'text-yellow-500' : 'text-red-500'
              }`}>
                {stats.sla.total === 0 ? '—' : `${stats.sla.rate}%`}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">Cumplimiento SLA</p>
            </div>
          </div>
        </div>
        <StatCard label="Cycle Time promedio" value={cycleLabel} icon="🔄" color="border-blue-400" />
        <StatCard label="Lead Time promedio"  value={leadLabel}  icon="📦" color="border-purple-400" />
      </div>

      {/* Charts — distribución */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HBarChart title="Por Prioridad" items={priorityItems} />
        <HBarChart title="Por Tipo"      items={typeItems} />
        {areaItems.length > 0
          ? <HBarChart title="Por Área" items={areaItems} />
          : (
            <div className="bg-white rounded-xl border p-5 shadow-sm flex items-center justify-center text-gray-400 text-sm">
              Sin datos de área disponibles
            </div>
          )
        }
      </div>

      {/* SLA breakdown + Tendencia mensual */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SLABreakdown sla={stats.sla} />
        <QuarterlyChart data={stats.completedByQuarter} />
      </div>

      {/* Status breakdown */}
      <div className="bg-white rounded-xl border p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">Estado de proyectos</h3>
        <div className="flex gap-4 flex-wrap">
          {[
            { label: 'Activos',     value: stats.byStatus.active,    pct: stats.total ? Math.round(stats.byStatus.active / stats.total * 100) : 0,    bg: 'bg-green-100',   text: 'text-green-800',   bar: 'bg-green-500' },
            { label: 'Completados', value: stats.byStatus.completed,  pct: stats.total ? Math.round(stats.byStatus.completed / stats.total * 100) : 0,  bg: 'bg-emerald-100', text: 'text-emerald-800', bar: 'bg-emerald-500' },
            { label: 'Archivados',  value: stats.byStatus.archived,   pct: stats.total ? Math.round(stats.byStatus.archived / stats.total * 100) : 0,   bg: 'bg-gray-100',    text: 'text-gray-600',    bar: 'bg-gray-400' },
          ].map(s => (
            <div key={s.label} className={`flex-1 min-w-[140px] rounded-lg p-4 ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.text}`}>{s.value}</p>
              <p className={`text-sm ${s.text} font-medium`}>{s.label}</p>
              <div className="mt-2 bg-white bg-opacity-60 rounded-full h-2">
                <div className={`h-2 rounded-full ${s.bar}`} style={{ width: `${s.pct}%` }} />
              </div>
              <p className={`text-xs mt-1 ${s.text} opacity-70`}>{s.pct}% del total</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
