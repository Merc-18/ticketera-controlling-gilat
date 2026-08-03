import { useState } from 'react'
import { useRequests } from '../../hooks/useRequests'
import { useUsers } from '../../hooks/useUsers'
import { useAuth } from '../../hooks/useAuth'
import type { Request } from '../../types/database.types'
import { calcSlaFormalDays, calcTargetDate } from '../../lib/sla-config'
import { toast } from '../../lib/toast'
import PlannerImportModal from './PlannerImportModal'

const isUrgent = (r: Request) => !!r.observations?.startsWith('🔴 URGENTE')

const cleanObservations = (obs: string) =>
  obs.replace(/^🔴 URGENTE\.?\s*/i, '').trim()

function TypeChips({ request }: { request: Request }) {
  const types = request.needs_code
    ? request.request_type.split(',').map(t => t.trim()).filter(Boolean)
    : [request.request_type]
  return (
    <div className="flex flex-wrap gap-1">
      {types.map(t => (
        <span
          key={t}
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            request.needs_code ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {t}
        </span>
      ))}
    </div>
  )
}

type InboxTab = 'pending' | 'approved' | 'rejected'

export default function RequestInbox() {
  const { requests, loading, approveRequest, rejectRequest } = useRequests()
  const { activeUsers } = useUsers()
  const { user: currentUser } = useAuth()
  const canManage = currentUser?.role === 'superadmin' || currentUser?.role === 'admin'
  const [activeTab, setActiveTab] = useState<InboxTab>('pending')
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [sameUser, setSameUser] = useState(false)
  const [approveData, setApproveData] = useState({
    project_type: 'development' as 'development' | 'administrative' | 'dual',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    title: '',
    start_date: '',
    due_date: '',
    assigned_dev: '',
    assigned_admin: '',
  })

  const pendingRequests  = requests.filter(r => r.status === 'pending')
  const approvedRequests = requests.filter(r => r.status === 'approved')
  const rejectedRequests = requests.filter(r => r.status === 'rejected')

  const openApproveModal = (request: Request) => {
    const urgent = isUrgent(request)
    const firstType = request.request_type.split(',')[0].trim()
    setSelectedRequest(request)
    setApproveData(d => ({
      ...d,
      title: `${firstType} - ${request.requester_area}`,
      project_type: request.needs_code ? 'development' : 'administrative',
      priority: urgent ? 'urgent' : 'medium',
      due_date: request.requested_date ? request.requested_date.slice(0, 10) : '',
    }))
    setShowApproveModal(true)
  }

  const handleApprove = async () => {
    if (!selectedRequest) return
    setActionLoading(true)
    try {
      await approveRequest(selectedRequest.id, {
        ...approveData,
        start_date: approveData.start_date || undefined,
        due_date: approveData.due_date || undefined,
        assigned_dev:   approveData.assigned_dev   || undefined,
        assigned_admin: sameUser
          ? (approveData.assigned_dev || undefined)
          : (approveData.assigned_admin || undefined),
      })
      setShowApproveModal(false)
      setSelectedRequest(null)
      setSameUser(false)
      toast.success('Solicitud aprobada y proyecto creado')
    } catch (err) {
      toast.error('Error al aprobar la solicitud')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!selectedRequest || !rejectionReason.trim()) return
    setActionLoading(true)
    try {
      await rejectRequest(selectedRequest.id, rejectionReason)
      setShowRejectModal(false)
      setRejectionReason('')
      setSelectedRequest(null)
      toast.success('Solicitud rechazada')
    } catch (err) {
      toast.error('Error al rechazar la solicitud')
    } finally {
      setActionLoading(false)
    }
  }

  const statusColors = {
    pending:  'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando solicitudes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Import button */}
      {canManage && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2 shadow-sm"
          >
            📥 Importar Planner
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {([
          { key: 'pending',  label: 'Pendientes',  count: pendingRequests.length,  dot: 'bg-yellow-400' },
          { key: 'approved', label: 'Aprobadas',   count: approvedRequests.length, dot: 'bg-green-500' },
          { key: 'rejected', label: 'Rechazadas',  count: rejectedRequests.length, dot: 'bg-red-500' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${tab.dot}`} />
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
              activeTab === tab.key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Request List */}
      <div className="grid gap-4">
        {/* ── Pendientes ── */}
        {activeTab === 'pending' && (
          pendingRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-gray-500 font-medium">No hay solicitudes pendientes</p>
            </div>
          ) : (
            pendingRequests.map(request => {
              const urgent = isUrgent(request)
              return (
                <div
                  key={request.id}
                  className={`bg-white border rounded-lg p-4 hover:shadow-md transition cursor-pointer ${urgent ? 'border-red-300' : ''}`}
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-mono font-bold text-primary">{request.request_number}</p>
                        {urgent && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded-full text-xs font-bold">
                            🔴 URGENTE
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900">{request.requester_name}</p>
                      <p className="text-sm text-gray-600">{request.requester_area}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors.pending}`}>
                      Pendiente
                    </span>
                  </div>
                  <div className="mb-2"><TypeChips request={request} /></div>
                  <p className="text-sm text-gray-600 line-clamp-2">{request.description}</p>
                  {canManage && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openApproveModal(request) }}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition disabled:opacity-50"
                      >
                        ✓ Aprobar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedRequest(request); setShowRejectModal(true) }}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition disabled:opacity-50"
                      >
                        ✕ Rechazar
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )
        )}

        {/* ── Aprobadas ── */}
        {activeTab === 'approved' && (
          approvedRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No hay solicitudes aprobadas</p>
            </div>
          ) : (
            approvedRequests.map(request => {
              const urgent = isUrgent(request)
              const projectDeleted = (request as any).projects?.status === 'deleted'
              return (
                <div
                  key={request.id}
                  className={`bg-white border rounded-lg p-4 hover:shadow-md transition cursor-pointer ${projectDeleted ? 'border-gray-200 opacity-75' : 'border-green-100'}`}
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-mono font-bold text-primary">{request.request_number}</p>
                        {urgent && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded-full text-xs font-bold">
                            🔴 URGENTE
                          </span>
                        )}
                        {projectDeleted && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded-full text-xs font-medium">
                            🗑 Proyecto eliminado
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900">{request.requester_name}</p>
                      <p className="text-sm text-gray-600">{request.requester_area}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors.approved}`}>
                      ✅ Aprobado
                    </span>
                  </div>
                  <div className="mb-2"><TypeChips request={request} /></div>
                  <p className="text-sm text-gray-600 line-clamp-2">{request.description}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    Recibido: {new Date(request.created_at).toLocaleDateString('es-PE')}
                    {request.requested_date && (
                      <span> · SLA: {new Date(request.requested_date + 'T12:00:00').toLocaleDateString('es-PE')}</span>
                    )}
                  </p>
                </div>
              )
            })
          )
        )}

        {/* ── Rechazadas ── */}
        {activeTab === 'rejected' && (
          rejectedRequests.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No hay solicitudes rechazadas</p>
            </div>
          ) : (
            rejectedRequests.map(request => (
              <div
                key={request.id}
                className="bg-white border border-red-100 rounded-lg p-4 hover:shadow-md transition cursor-pointer"
                onClick={() => setSelectedRequest(request)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono font-bold text-primary">{request.request_number}</p>
                    <p className="font-semibold text-gray-900">{request.requester_name}</p>
                    <p className="text-sm text-gray-600">{request.requester_area}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors.rejected}`}>
                    ❌ Rechazado
                  </span>
                </div>
                <div className="mb-2"><TypeChips request={request} /></div>
                <p className="text-sm text-gray-600 line-clamp-2">{request.description}</p>
                {request.rejection_reason && (
                  <div className="mt-2 bg-red-50 border border-red-100 rounded px-3 py-2">
                    <p className="text-xs text-red-600 font-medium mb-0.5">Razón del rechazo:</p>
                    <p className="text-xs text-red-800 line-clamp-2">{request.rejection_reason}</p>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Recibido: {new Date(request.created_at).toLocaleDateString('es-PE')}
                </p>
              </div>
            ))
          )
        )}
      </div>

      {/* Request Detail Modal */}
      {selectedRequest && !showRejectModal && !showApproveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Detalle de Solicitud</h2>
              <button onClick={() => setSelectedRequest(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            {isUrgent(selectedRequest) && (
              <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
                <span className="text-red-600 font-bold text-sm">🔴 Solicitud marcada como URGENTE</span>
                <span className="text-red-500 text-xs">— El equipo se contactará directamente para coordinar</span>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Número</p>
                  <p className="font-mono font-bold text-primary">{selectedRequest.request_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Estado</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[selectedRequest.status]}`}>
                    {selectedRequest.status === 'pending' && 'Pendiente'}
                    {selectedRequest.status === 'approved' && 'Aprobado'}
                    {selectedRequest.status === 'rejected' && 'Rechazado'}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600">Solicitante</p>
                <p className="font-medium">{selectedRequest.requester_name}</p>
                {selectedRequest.requester_email && (
                  <p className="text-sm text-gray-600">{selectedRequest.requester_email}</p>
                )}
              </div>

              <div>
                <p className="text-sm text-gray-600">Área</p>
                <p className="font-medium">{selectedRequest.requester_area}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">
                  {selectedRequest.needs_code ? 'Producto(s) Requerido(s)' : 'Tipo de Requerimiento'}
                </p>
                <TypeChips request={selectedRequest} />
              </div>

              <div>
                <p className="text-sm text-gray-600">Origen</p>
                <p className="font-medium">{selectedRequest.origin}</p>
              </div>

              {selectedRequest.data_system_involved && (
                <div>
                  <p className="text-sm text-gray-600">Sistema Involucrado</p>
                  <p className="font-medium">{selectedRequest.data_system_involved}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-600">Descripción</p>
                <p className="text-gray-900">{selectedRequest.description}</p>
              </div>

              {selectedRequest.observations && cleanObservations(selectedRequest.observations) && (
                <div>
                  <p className="text-sm text-gray-600">Observaciones</p>
                  <p className="text-gray-900">{cleanObservations(selectedRequest.observations)}</p>
                </div>
              )}

              <div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${selectedRequest.needs_code ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {selectedRequest.needs_code ? '💻 Requiere código' : '📋 No requiere código'}
                </span>
              </div>

              {selectedRequest.requested_date && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <p className="text-xs text-blue-600 font-medium mb-0.5">⏱ Fecha Estimada de Entrega (SLA)</p>
                  <p className="font-semibold text-blue-900">
                    {new Date(selectedRequest.requested_date + 'T12:00:00').toLocaleDateString('es-PE', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                </div>
              )}
            </div>

            {selectedRequest.status === 'pending' && canManage && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => openApproveModal(selectedRequest)}
                  disabled={actionLoading}
                  className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition disabled:opacity-50"
                >
                  ✓ Aprobar
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={actionLoading}
                  className="flex-1 bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition disabled:opacity-50"
                >
                  ✕ Rechazar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Rechazar Solicitud</h2>
            <p className="text-gray-600 mb-4">
              Solicitud: <span className="font-mono font-bold text-primary">{selectedRequest.request_number}</span>
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Razón del Rechazo <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none"
                placeholder="Explica por qué se rechaza esta solicitud..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowRejectModal(false); setRejectionReason('') }}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || actionLoading}
                className="flex-1 bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition disabled:opacity-50"
              >
                {actionLoading ? 'Rechazando...' : 'Confirmar Rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Planner Import Modal */}
      {showImportModal && (
        <PlannerImportModal onClose={() => { setShowImportModal(false) }} />
      )}

      {/* Approve Modal */}
      {showApproveModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">✅ Aprobar y Crear Proyecto</h2>
              <button onClick={() => setShowApproveModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Info solicitud */}
            <div className={`border rounded-lg px-4 py-3 mb-5 text-sm ${isUrgent(selectedRequest) ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
              <p className={`font-medium mb-1.5 ${isUrgent(selectedRequest) ? 'text-red-900' : 'text-blue-900'}`}>
                {selectedRequest.request_number} · {selectedRequest.requester_name}
                {isUrgent(selectedRequest) && <span className="ml-2 text-xs font-bold text-red-600">🔴 URGENTE</span>}
              </p>
              <TypeChips request={selectedRequest} />
              <span className={`text-xs mt-1.5 inline-block ${isUrgent(selectedRequest) ? 'text-red-600' : 'text-blue-600'}`}>
                {selectedRequest.requester_area}
              </span>
            </div>

            <div className="space-y-4 mb-6">
              {/* Título */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Título del Proyecto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={approveData.title}
                  onChange={e => setApproveData(d => ({ ...d, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Nombre del proyecto"
                />
              </div>

              {/* Tipo + Prioridad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo <span className="text-red-500">*</span></label>
                  <select
                    value={approveData.project_type}
                    onChange={e => setApproveData(d => ({ ...d, project_type: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="development">💻 Development</option>
                    <option value="administrative">📋 Administrative</option>
                    <option value="dual">🔄 Dual Flow</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad <span className="text-red-500">*</span></label>
                  <select
                    value={approveData.priority}
                    onChange={e => setApproveData(d => ({ ...d, priority: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="low">🟢 Baja</option>
                    <option value="medium">🟡 Media</option>
                    <option value="high">🟠 Alta</option>
                    <option value="urgent">🔴 Urgente</option>
                  </select>
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Inicio</label>
                  <input
                    type="date"
                    value={approveData.start_date}
                    onChange={e => setApproveData(d => ({ ...d, start_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de Vencimiento
                    {selectedRequest.requested_date && (
                      <span className="text-xs text-blue-500 ml-1">(del SLA)</span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={approveData.due_date}
                    onChange={e => setApproveData(d => ({ ...d, due_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Asignación */}
              {activeUsers.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">👤 Asignación de responsables</p>

                  {(approveData.project_type === 'development' || approveData.project_type === 'dual') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        {approveData.project_type === 'dual' ? '💻 Responsable Development' : '👤 Responsable'}
                      </label>
                      <select
                        value={approveData.assigned_dev}
                        onChange={e => setApproveData(d => ({ ...d, assigned_dev: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">— Sin asignar —</option>
                        {activeUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {approveData.project_type === 'dual' && (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={sameUser}
                          onChange={e => setSameUser(e.target.checked)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-xs text-gray-600">Usar el mismo responsable para ambos flujos</span>
                      </label>

                      {!sameUser && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">📋 Responsable Administrative</label>
                          <select
                            value={approveData.assigned_admin}
                            onChange={e => setApproveData(d => ({ ...d, assigned_admin: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary bg-white"
                          >
                            <option value="">— Sin asignar —</option>
                            {activeUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {sameUser && approveData.assigned_dev && (
                        <p className="text-xs text-blue-600 bg-blue-50 rounded px-3 py-2">
                          Ambos flujos asignados a: <strong>{activeUsers.find(u => u.id === approveData.assigned_dev)?.full_name}</strong>
                        </p>
                      )}
                    </>
                  )}

                  {approveData.project_type === 'administrative' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">👤 Responsable</label>
                      <select
                        value={approveData.assigned_admin}
                        onChange={e => setApproveData(d => ({ ...d, assigned_admin: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary bg-white"
                      >
                        <option value="">— Sin asignar —</option>
                        {activeUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SLA Preview */}
            {(() => {
              const slaFormalDays = calcSlaFormalDays(selectedRequest.request_type, selectedRequest.needs_code)
              const slaFormalDate = calcTargetDate(slaFormalDays, 'medium') // medium = × 1.00 = SLA formal
              const targetDate    = calcTargetDate(slaFormalDays, approveData.priority)
              const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
              return approveData.priority === 'low' ? (
                <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm">
                  <p className="font-medium text-gray-600 mb-0.5">SLA</p>
                  <p className="text-gray-500 text-xs">Prioridad baja — sin SLA asignado (backlog)</p>
                </div>
              ) : (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm space-y-1">
                  <p className="font-medium text-blue-800 mb-1">SLA calculado</p>
                  <div className="flex justify-between text-xs text-blue-700">
                    <span>SLA formal ({slaFormalDays}d hábiles)</span>
                    <span className="font-medium">{slaFormalDate ? fmt(slaFormalDate) : '—'}</span>
                  </div>
                  <div className="flex justify-between text-xs text-blue-600 border-t border-blue-100 pt-1 mt-1">
                    <span>Target interno ({approveData.priority})</span>
                    <span className="font-bold text-blue-900">{targetDate ? fmt(targetDate) : '—'}</span>
                  </div>
                </div>
              )
            })()}

            <div className="flex gap-3">
              <button
                onClick={() => setShowApproveModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-semibold hover:bg-gray-200 transition text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading || !approveData.title.trim()}
                className="flex-1 bg-green-500 text-white py-2.5 rounded-lg font-semibold hover:bg-green-600 transition disabled:opacity-50 text-sm"
              >
                {actionLoading ? 'Creando proyecto...' : '✅ Aprobar y crear proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
