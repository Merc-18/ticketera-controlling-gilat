import { useState, useRef, useEffect } from 'react'
import type { Project, ProjectFlow, User } from '../../types/database.types'
import { getAvatarColor, getInitials, PRIORITY_COLORS, AREA_COLORS } from '../../lib/constants'

interface ProjectWithArea extends Project {
  requests?: { requester_area: string; requester_name?: string; request_number?: string } | null
}

interface Props {
  project: ProjectWithArea
  flow: ProjectFlow
  onClick: () => void
  users?: User[]
  onAssign?: (flowId: string, userId: string) => void
  selected?: boolean
  onSelect?: (projectId: string) => void
}

function getDueDateBadge(dueDate?: string | null) {
  if (!dueDate) return null
  const today = new Date().toISOString().slice(0, 10)
  const diff = Math.ceil((new Date(dueDate).getTime() - new Date(today).getTime()) / 86400000)
  if (diff < 0)  return { label: `⚠️ Vencido (${Math.abs(diff)}d)`, cls: 'bg-red-100 text-red-700 border border-red-200' }
  if (diff === 0) return { label: '🔴 Vence hoy',                   cls: 'bg-red-50 text-red-600 border border-red-200' }
  if (diff <= 3)  return { label: `⏰ ${diff}d`,                    cls: 'bg-orange-100 text-orange-700 border border-orange-200' }
  return { label: new Date(dueDate + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }), cls: 'bg-gray-100 text-gray-500 border border-gray-200' }
}

function getSlaTargetBadge(slaTargetDate?: string | null) {
  if (!slaTargetDate) return null
  const today = new Date().toISOString().slice(0, 10)
  const diff = Math.ceil((new Date(slaTargetDate).getTime() - new Date(today).getTime()) / 86400000)
  if (diff < 0)  return { label: `🎯 Target vencido (${Math.abs(diff)}d)`, cls: 'bg-red-100 text-red-700 border border-red-300' }
  if (diff === 0) return { label: '🎯 Target hoy',                          cls: 'bg-red-50 text-red-600 border border-red-200' }
  if (diff <= 2)  return { label: `🎯 ${diff}d`,                            cls: 'bg-orange-100 text-orange-700 border border-orange-300' }
  if (diff <= 5)  return { label: `🎯 ${diff}d`,                            cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' }
  return { label: `🎯 ${new Date(slaTargetDate + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`, cls: 'bg-green-50 text-green-700 border border-green-200' }
}

export default function ProjectCard({ project, flow, onClick, users = [], onAssign, selected, onSelect }: Props) {
  const area = project.requests?.requester_area
  const requesterName = project.requests?.requester_name
  const showRequester = requesterName && requesterName !== '—'
  const requestNumber = project.requests?.request_number ?? project.project_number
  const areaColorClass = area ? (AREA_COLORS[area] ?? 'bg-gray-100 text-gray-600') : ''
  const dueBadge = getDueDateBadge(project.due_date)
  const slaTargetBadge = getSlaTargetBadge(project.sla_target_date)

  const checklistItems: Array<{ id: string; completed: boolean }> = (flow as any).checklist_items ?? []
  const checkTotal = checklistItems.length
  const checkDone  = checklistItems.filter(i => i.completed).length
  const [showAssign, setShowAssign] = useState(false)
  const assignRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showAssign) return
    const handler = (e: MouseEvent) => {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setShowAssign(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAssign])

  // Collect all assigned users across all flows (for dual projects, show both)
  const allFlows: Array<{ assigned_to: string | null; flow_type: string }> =
    (project as any).project_flows ?? [flow]
  const assignedUsers = allFlows
    .filter(f => f.assigned_to)
    .map(f => ({ user: users.find(u => u.id === f.assigned_to), flowType: f.flow_type }))
    .filter((x): x is { user: NonNullable<typeof x.user>; flowType: string } => Boolean(x.user))
    .filter((x, i, arr) => arr.findIndex(y => y.user.id === x.user.id) === i)

  return (
    <div
      onClick={onClick}
      className={`relative bg-white rounded-lg shadow-sm border p-3.5 mb-3 hover:shadow-md transition-shadow cursor-pointer group/card ${
        selected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'
      }`}
    >
      {onSelect && (
        <div
          className={`absolute top-2 right-2 z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-100'}`}
          onClick={e => { e.stopPropagation(); onSelect(project.id) }}
        >
          <input type="checkbox" checked={selected ?? false} readOnly className="w-4 h-4 cursor-pointer accent-blue-600" />
        </div>
      )}
      {/* Título + blocked */}
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm flex-1 leading-snug line-clamp-2">
          {project.title}
        </h3>
        {project.is_blocked && (
          <span className="text-red-500 text-base ml-2 flex-shrink-0" title={project.blocked_reason || 'Bloqueado'}>
            🚫
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mb-2.5">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[project.priority]}`}>
          {project.priority.toUpperCase()}
        </span>
        {area && (
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${areaColorClass}`}>
            {area}
          </span>
        )}
        {showRequester && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
            👤 {requesterName}
          </span>
        )}
        {project.project_type === 'dual' && (
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
            DUAL
          </span>
        )}
        {slaTargetBadge && (
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${slaTargetBadge.cls}`}>
            {slaTargetBadge.label}
          </span>
        )}
        {!slaTargetBadge && dueBadge && (
          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${dueBadge.cls}`}>
            {dueBadge.label}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-2">
          {requestNumber
            ? <span className="font-mono text-gray-500">{requestNumber}</span>
            : <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 text-[10px] font-medium">Interno</span>
          }
          {checkTotal > 0 && (
            <span className={`flex items-center gap-0.5 text-[10px] font-medium ${checkDone === checkTotal ? 'text-green-600' : 'text-gray-400'}`}>
              ✓ {checkDone}/{checkTotal}
            </span>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          {/* Assigned users display */}
          {assignedUsers.length > 0 ? (
            <div className="flex items-center gap-1">
              {assignedUsers.map(({ user, flowType }) => (
                <div key={user.id} className="flex items-center gap-1" title={`${user.full_name} (${flowType === 'development' ? '💻' : '📋'})`}>
                  <div className={`w-5 h-5 rounded-full ${getAvatarColor(user.full_name)} flex items-center justify-center text-white text-[9px] font-bold`}>
                    {getInitials(user.full_name)}
                  </div>
                </div>
              ))}
              {assignedUsers.length === 1 && (
                <span className="text-gray-500 truncate max-w-[70px]">{assignedUsers[0].user.full_name.split(' ')[0]}</span>
              )}
            </div>
          ) : null}

          {/* Quick assign button */}
          {onAssign && users.length > 0 && (
            <div className="relative" ref={assignRef}>
              <button
                onClick={e => { e.stopPropagation(); setShowAssign(v => !v) }}
                title="Asignar responsable"
                className="w-5 h-5 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-600 flex items-center justify-center text-[10px] font-bold transition"
              >
                {assignedUsers.length > 0 ? '✎' : '+'}
              </button>

              {showAssign && (
                <div
                  className="absolute bottom-7 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[160px]"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="px-3 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wide border-b border-gray-100 mb-1">
                    Asignar responsable
                  </p>
                  {users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { onAssign(flow.id, u.id); setShowAssign(false) }}
                      className={`w-full text-left px-3 py-1.5 text-xs text-gray-800 hover:bg-blue-50 flex items-center gap-2 transition ${
                        flow.assigned_to === u.id ? 'bg-blue-50 text-blue-700 font-medium' : ''
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full ${getAvatarColor(u.full_name)} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>
                        {getInitials(u.full_name)}
                      </div>
                      {u.full_name.split(' ').slice(0, 2).join(' ')}
                      {flow.assigned_to === u.id && <span className="ml-auto">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
