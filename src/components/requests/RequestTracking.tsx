import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequests } from '../../hooks/useRequests'
import { supabase } from '../../lib/supabase'
import type { Request } from '../../types/database.types'

interface ProjectFlow {
  id: string
  flow_type: string
  current_phase: string
  progress: number
}

const PHASE_MESSAGE: Record<string, string> = {
  backlog:          'Tu solicitud está en cola, próximamente se iniciará',
  design:           'Tu requerimiento ha iniciado — el equipo está en la etapa de análisis',
  discovery:        'Tu requerimiento ha iniciado — el equipo está en la etapa de análisis',
  dev:              'El equipo está trabajando en tu requerimiento',
  build:            'El equipo está trabajando en tu requerimiento',
  testing:          'Tu entregable está en etapa de pruebas finales',
  uat_validation:   'Tu entregable está en etapa de pruebas finales',
  deploy:           'Tu requerimiento fue completado ✅',
  deployed:         'Tu requerimiento fue completado ✅',
  done:             'Tu requerimiento fue completado ✅',
}

function getOverallMessage(flows: ProjectFlow[]): string | null {
  if (flows.length === 0) return null
  // Use the most advanced phase across all flows
  const order = ['backlog', 'ready_to_start', 'discovery', 'design', 'dev', 'build', 'testing', 'uat_validation', 'deploy', 'deployed', 'done']
  const sorted = [...flows].sort((a, b) => order.indexOf(b.current_phase) - order.indexOf(a.current_phase))
  return PHASE_MESSAGE[sorted[0].current_phase] ?? null
}

const DEV_PHASES = ['backlog', 'design', 'dev', 'testing', 'deploy', 'done']
const ADM_PHASES = ['backlog', 'ready_to_start', 'discovery', 'build', 'uat_validation', 'deployed']

const PHASE_LABELS: Record<string, string> = {
  backlog: 'Backlog', design: 'Design', dev: 'Development', testing: 'Testing',
  deploy: 'Deploy', done: 'Done', ready_to_start: 'Ready to Start',
  discovery: 'Discovery', build: 'Build', uat_validation: 'UAT/Validation', deployed: 'Deployed',
}

const isUrgent = (r: Request) => !!r.observations?.startsWith('🔴 URGENTE')

const cleanObservations = (obs: string) =>
  obs.replace(/^🔴 URGENTE\.?\s*/i, '').trim()

function TypeChips({ request }: { request: Request }) {
  const types = request.needs_code
    ? request.request_type.split(',').map(t => t.trim()).filter(Boolean)
    : [request.request_type]
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map(t => (
        <span
          key={t}
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            request.needs_code ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  )
}

const CURRENT_PREFIX = `REQ${new Date().getFullYear().toString().slice(2)}-`

export default function RequestTracking() {
  const navigate = useNavigate()
  const { getRequestByNumber } = useRequests()
  const [requestNumber, setRequestNumber] = useState('')
  const [request, setRequest] = useState<Request | null>(null)
  const [flows, setFlows] = useState<ProjectFlow[]>([])
  const [slaTargetDate, setSlaTargetDate] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setNotFound(false)
    setRequest(null)
    setFlows([])
    setSlaTargetDate(null)
    setProjectStatus(null)
    setProjectCreatedAt(null)
    setRequestNumber('')

    try {
      // Si el usuario ingresó solo dígitos, armar el número completo con el prefijo del año actual
      const fullNumber = /^\d+$/.test(requestNumber.trim())
        ? `${CURRENT_PREFIX}${requestNumber.trim().padStart(3, '0')}`
        : requestNumber.trim().toUpperCase()
      const result = await getRequestByNumber(fullNumber)
      if (result) {
        setRequest(result)
        if (result.project_id) {
          const [{ data: flowData }, { data: projectData }] = await Promise.all([
            supabase.from('project_flows').select('id, flow_type, current_phase, progress').eq('project_id', result.project_id),
            supabase.from('projects').select('sla_target_date, status, created_at').eq('id', result.project_id).single(),
          ])
          setFlows((flowData as ProjectFlow[]) || [])
          setSlaTargetDate(projectData?.sla_target_date ?? null)
          setProjectStatus(projectData?.status ?? null)
          setProjectCreatedAt(projectData?.created_at ?? null)
        }
      } else {
        setNotFound(true)
      }
    } catch (err) {
      console.error('Error searching request:', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  // Build timeline steps
  const isCompleted = projectStatus === 'completed' ||
    flows.some(f => ['deploy', 'deployed', 'done'].includes(f.current_phase))

  const timelineSteps = request ? [
    {
      id: 'sent',
      label: 'Solicitud enviada',
      date: new Date(request.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }),
      done: true,
      icon: '📨',
    },
    {
      id: 'review',
      label: 'En revisión por el equipo',
      date: null,
      done: request.status !== 'pending',
      icon: '🔍',
    },
    request.status === 'rejected'
      ? {
          id: 'result',
          label: 'Solicitud rechazada',
          date: null,
          done: true,
          icon: '❌',
          error: true,
        }
      : {
          id: 'result',
          label: 'Aprobada y en curso',
          date: projectCreatedAt
            ? new Date(projectCreatedAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
            : null,
          done: request.status === 'approved',
          icon: '✅',
        },
    ...(request.status === 'approved' ? [{
      id: 'progress',
      label: getOverallMessage(flows) ?? 'En desarrollo',
      date: null,
      done: isCompleted,
      active: !isCompleted && flows.length > 0,
      icon: '🔄',
    }] : []),
    ...(request.status === 'approved' ? [{
      id: 'done',
      label: 'Entregado',
      date: null,
      done: isCompleted,
      icon: '🎉',
    }] : []),
  ] : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-info py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => navigate('/portal')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition mb-4"
            >
              ← Inicio
            </button>
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">🔍 Rastrear Solicitud</h1>
              <p className="text-gray-600">
                Ingresa tu número de seguimiento para ver el estado de tu solicitud
              </p>
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="mb-8">
            <div className="flex gap-3">
              <div className="flex flex-1 border-2 border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent overflow-hidden">
                <span className="flex items-center px-4 bg-gray-100 text-gray-500 font-mono text-lg border-r border-gray-300 select-none whitespace-nowrap">
                  {CURRENT_PREFIX}
                </span>
                <input
                  type="text"
                  value={requestNumber}
                  onChange={(e) => setRequestNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                  placeholder="001"
                  maxLength={3}
                  className="flex-1 px-4 py-3 outline-none text-lg font-mono bg-white"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || !requestNumber}
                className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </form>

          {/* Not Found */}
          {notFound && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
              <p className="text-red-800 font-medium mb-2">❌ Solicitud no encontrada</p>
              <p className="text-sm text-red-600">Verifica que el número sea correcto</p>
            </div>
          )}

          {/* Request Found */}
          {request && (
            <div className="space-y-6">
              {/* Visual Timeline */}
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Estado de tu solicitud</p>
                <div className="space-y-0">
                  {timelineSteps.map((step, idx) => {
                    const isLast = idx === timelineSteps.length - 1
                    const dotColor = (step as any).error
                      ? 'bg-red-500 border-red-500'
                      : step.done
                        ? 'bg-primary border-primary'
                        : (step as any).active
                          ? 'bg-blue-300 border-blue-400 animate-pulse'
                          : 'bg-white border-gray-300'
                    const lineColor = step.done ? 'bg-primary' : 'bg-gray-200'
                    return (
                      <div key={step.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 ${dotColor}`} />
                          {!isLast && <div className={`w-0.5 flex-1 my-1 ${lineColor}`} style={{ minHeight: 24 }} />}
                        </div>
                        <div className="pb-4">
                          <p className={`text-sm font-medium leading-snug ${
                            (step as any).error ? 'text-red-700' :
                            step.done ? 'text-gray-900' :
                            (step as any).active ? 'text-blue-700' :
                            'text-gray-400'
                          }`}>
                            <span className="mr-1.5">{step.icon}</span>
                            {step.label}
                          </p>
                          {step.date && (
                            <p className="text-xs text-gray-400 mt-0.5 ml-6">{step.date}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Urgency Banner */}
              {isUrgent(request) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <span className="text-xl">🔴</span>
                  <div>
                    <p className="font-semibold text-red-800 text-sm">Solicitud marcada como Urgente</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      El equipo se contactará contigo directamente para coordinar la atención.
                    </p>
                  </div>
                </div>
              )}

              {/* Request Details */}
              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Número de Solicitud</p>
                  <p className="font-mono font-bold text-xl text-primary">{request.request_number}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Solicitante</p>
                    <p className="font-medium text-gray-900">{request.requester_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Área</p>
                    <p className="font-medium text-gray-900">{request.requester_area}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-1.5">
                    {request.needs_code ? 'Producto Final Requerido' : 'Tipo de Requerimiento'}
                  </p>
                  <TypeChips request={request} />
                </div>

                <div>
                  <p className="text-sm text-gray-600 mb-1">Descripción</p>
                  <p className="text-gray-900">{request.description}</p>
                </div>

                {request.observations && cleanObservations(request.observations) && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Observaciones</p>
                    <p className="text-gray-900">{cleanObservations(request.observations)}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-600 mb-1">Fecha de Creación</p>
                  <p className="text-gray-900">{new Date(request.created_at).toLocaleDateString('es-PE')}</p>
                </div>

                {/* SLA / Fecha Estimada de Entrega */}
                {request.requested_date && (
                  <div className={`rounded-lg p-4 border ${isUrgent(request) ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                    <p className={`text-xs font-semibold mb-1 ${isUrgent(request) ? 'text-red-600' : 'text-blue-600'}`}>
                      ⏱ Fecha Estimada de Entrega (SLA)
                    </p>
                    <p className={`font-bold text-lg ${isUrgent(request) ? 'text-red-900' : 'text-blue-900'}`}>
                      {new Date(request.requested_date + 'T12:00:00').toLocaleDateString('es-PE', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                    <p className={`text-xs mt-1.5 ${isUrgent(request) ? 'text-red-500' : 'text-blue-500'}`}>
                      * El plazo corre a partir del siguiente día laboral tras el envío de la solicitud. Los días laborales excluyen sábados y domingos.
                    </p>
                  </div>
                )}


                {/* Fecha compromiso (sla_target_date) */}
                {slaTargetDate && (() => {
                  const today = new Date().toISOString().slice(0, 10)
                  const diff = Math.ceil((new Date(slaTargetDate).getTime() - new Date(today).getTime()) / 86400000)
                  const isCompleted = flows.some(f => ['deploy', 'deployed', 'done'].includes(f.current_phase))
                  const isOverdue = diff < 0 && !isCompleted
                  return (
                    <div className={`rounded-lg px-4 py-3 border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <p className={`text-xs font-semibold mb-1 ${isOverdue ? 'text-red-600' : 'text-green-600'}`}>
                        {isOverdue ? '⚠️ Fecha compromiso' : '🎯 Fecha compromiso de entrega'}
                      </p>
                      <p className={`font-bold text-lg ${isOverdue ? 'text-red-900' : 'text-green-900'}`}>
                        {new Date(slaTargetDate + 'T12:00:00').toLocaleDateString('es-PE', {
                          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        })}
                      </p>
                      {isOverdue && (
                        <p className="text-xs text-red-500 mt-1">
                          El plazo estimado ha vencido. El equipo está gestionando la entrega.
                        </p>
                      )}
                      {!isOverdue && diff <= 2 && (
                        <p className="text-xs text-green-600 mt-1">Entrega muy próxima.</p>
                      )}
                    </div>
                  )
                })()}

                {/* Progreso de fases */}
                {flows.length > 0 && (
                  <div className="space-y-4">
                    {flows.map(flow => {
                      const phases = flow.flow_type === 'development' ? DEV_PHASES : ADM_PHASES
                      const currentIdx = phases.indexOf(flow.current_phase)
                      return (
                        <div key={flow.id}>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-gray-700">
                              {flow.flow_type === 'development' ? '💻 Desarrollo' : '📋 Administrativo'}
                            </p>
                            <span className="text-sm font-bold text-primary">{flow.progress}%</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {phases.map((phase, idx) => {
                              const done = idx < currentIdx
                              const active = idx === currentIdx
                              return (
                                <div key={phase} className="flex-1 flex flex-col items-center gap-1">
                                  <div className={`h-2 w-full rounded-full ${done ? 'bg-primary' : active ? 'bg-blue-300' : 'bg-gray-200'}`} />
                                  {active && (
                                    <span className="text-[9px] text-primary font-semibold leading-none text-center">
                                      {PHASE_LABELS[phase]}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {request.status === 'rejected' && request.rejection_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-600 mb-1 font-medium">Razón del Rechazo</p>
                    <p className="text-red-800">{request.rejection_reason}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => { setRequest(null); setRequestNumber('') }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
                >
                  Buscar otra solicitud
                </button>
                <button
                  onClick={() => window.location.href = '/request'}
                  className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition"
                >
                  Nueva solicitud
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
