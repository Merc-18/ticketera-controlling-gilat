import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRequests } from '../../hooks/useRequests'

const AREAS   = ['AASS', 'ATC', 'DDC', 'GERE', 'QA', 'SAQ']
const ORIGINS = ['Cliente', 'Externo', 'Interno', 'Regulatorio', 'Otro']
const SYSTEMS = [
  'BD (Access, Sql)', 'Excel', 'Power Apps',
  'Power Automate', 'Power BI', 'Sharepoint', 'Otro',
]

const ADMIN_TYPES = [
  'Acceso / Permiso',
  'Automatización',
  'Capacitación',
  'Mejora de proceso',
  'Reporte',
  'Otro',
]

const CODE_TYPES: { label: string; sla: number }[] = [
  { label: 'Extracción de datos (PDF / Excel / Web)',       sla: 3 },
  { label: 'Generación de documentos (PDF / Word / Excel)', sla: 3 },
  { label: 'Consolidación y transformación de datos',       sla: 5 },
  { label: 'Comparación y validación',                      sla: 4 },
  { label: 'Reporte / Informe',                             sla: 5 },
  { label: 'Dashboard / Visualización (Streamlit)',         sla: 4 },
  { label: 'Automatización con IA',                         sla: 7 },
  { label: 'Organización y gestión de archivos',            sla: 2 },
  { label: 'Bug / Corrección',                              sla: 2 },
  { label: 'Utilidad interna / Herramienta propia',         sla: 6 },
  { label: 'Otro',                                          sla: 5 },
]

function calcSLA(selected: string[]): number {
  if (selected.length === 0) return 0
  const slas = selected.map(t => CODE_TYPES.find(c => c.label === t)?.sla ?? 5)
  return Math.max(...slas) + (selected.length - 1) * 2
}

// El conteo empieza desde el día laboral siguiente al envío
function addWorkingDays(days: number): string {
  const d = new Date()
  // Avanzar al primer día laboral posterior (el día de envío no cuenta)
  do { d.setDate(d.getDate() + 1) } while (d.getDay() === 0 || d.getDay() === 6)
  // Luego sumar los días laborales restantes (days - 1, ya usamos 1 arriba)
  let added = 1
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  return d.toISOString().slice(0, 10)
}

const EMPTY_FORM = {
  requester_name: '',
  requester_email: '',
  requester_area: '',
  request_type: '',
  origin: 'Interno' as const,
  data_system_involved: '',
  description: '',
  observations: '',
}

export default function PublicRequestForm() {
  const navigate = useNavigate()
  const { createRequest } = useRequests()
  const [loading, setLoading]           = useState(false)
  const [success, setSuccess]           = useState(false)
  const [requestNumber, setRequestNumber] = useState('')

  const [needsCode, setNeedsCode]             = useState<boolean | null>(null)
  const [selectedTypes, setSelectedTypes]     = useState<string[]>([])
  const [isUrgent, setIsUrgent]               = useState(false)
  const [formData, setFormData]               = useState(EMPTY_FORM)

  const calculatedSLA = calcSLA(selectedTypes)
  const urgentSLA     = Math.ceil(calculatedSLA / 2)
  const displaySLA    = isUrgent ? urgentSLA : calculatedSLA
  const heaviest      = selectedTypes.reduce<{ label: string; sla: number } | null>(
    (best, t) => {
      const found = CODE_TYPES.find(c => c.label === t)
      if (!found) return best
      return !best || found.sla > best.sla ? found : best
    }, null
  )

  const toggleType = (label: string) => {
    setSelectedTypes(prev =>
      prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]
    )
  }

  const reset = () => {
    setNeedsCode(null)
    setSelectedTypes([])
    setIsUrgent(false)
    setFormData(EMPTY_FORM)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (needsCode && selectedTypes.length === 0) {
      alert('Selecciona al menos un tipo de requerimiento.')
      return
    }
    setLoading(true)
    try {
      const today       = new Date().toISOString().slice(0, 10)
      const requestType = needsCode ? selectedTypes.join(', ') : formData.request_type
      const observations = [
        isUrgent ? '🔴 URGENTE — requiere coordinación directa con el equipo.' : '',
        formData.observations,
      ].filter(Boolean).join(' ')

      const requested_date = needsCode ? addWorkingDays(displaySLA) : ''

      const result = await createRequest({
        ...formData,
        request_type: requestType,
        needs_code: needsCode!,
        request_date: today,
        requested_date,
        observations,
        status: 'pending',
      })

      setRequestNumber(result.request_number)
      setSuccess(true)
      reset()
    } catch (err) {
      console.error(err)
      alert('Error al crear la solicitud. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Pantalla de éxito ── */
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary to-info flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Solicitud Creada!</h2>
          <p className="text-gray-600 mb-6">Tu solicitud ha sido registrada exitosamente</p>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-2">Número de seguimiento:</p>
            <p className="text-3xl font-bold text-primary">{requestNumber}</p>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Guarda este número para rastrear el estado de tu solicitud
          </p>
          <div className="space-y-3">
            <button
              onClick={() => setSuccess(false)}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition"
            >
              Crear otra solicitud
            </button>
            <button
              onClick={() => window.location.href = '/tracking'}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition"
            >
              Rastrear mi solicitud
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Formulario ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-info py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => navigate('/portal')}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition mb-4"
            >
              ← Inicio
            </button>
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">📝 Nueva Solicitud</h1>
              <p className="text-gray-600">
                Completa el formulario para crear una solicitud al equipo de Controlling
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">

            {/* ── Información del Solicitante ── */}
            <section className="space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Información del Solicitante</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text" required
                  value={formData.requester_name}
                  onChange={e => setFormData({ ...formData, requester_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  placeholder="Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.requester_email}
                  onChange={e => setFormData({ ...formData, requester_email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  placeholder="juan.perez@empresa.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Área <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.requester_area}
                  onChange={e => setFormData({ ...formData, requester_area: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="">Selecciona un área</option>
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </section>

            {/* ── Información de la Solicitud ── */}
            <section className="space-y-6">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Información de la Solicitud</h3>

              {/* ¿Necesita código? */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  ¿Esta solicitud requiere desarrollo o código? <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => { setNeedsCode(false); setSelectedTypes([]) }}
                    className={`py-4 rounded-xl border-2 text-sm font-semibold transition flex flex-col items-center gap-1 ${
                      needsCode === false
                        ? 'border-green-500 bg-green-50 text-green-800'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">📋</span>
                    No requiere código
                    <span className="text-xs font-normal text-gray-400">Proceso, acceso, reporte simple</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNeedsCode(true); setFormData(f => ({ ...f, request_type: '' })) }}
                    className={`py-4 rounded-xl border-2 text-sm font-semibold transition flex flex-col items-center gap-1 ${
                      needsCode === true
                        ? 'border-blue-500 bg-blue-50 text-blue-800'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">💻</span>
                    Sí requiere código
                    <span className="text-xs font-normal text-gray-400">Automatización, dashboard, herramienta</span>
                  </button>
                </div>
              </div>

              {/* Contenido condicional */}
              {needsCode !== null && (
                <div className="space-y-5 animate-fadeIn">

                  {/* Tipo de requerimiento */}
                  {needsCode === false ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tipo de Requerimiento <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={formData.request_type}
                        onChange={e => setFormData({ ...formData, request_type: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                      >
                        <option value="">Selecciona un tipo</option>
                        {ADMIN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ¿Cuál es el producto final que recibirás? <span className="text-red-500">*</span>
                      </label>
                      <p className="text-xs text-gray-400 mb-3">Selecciona uno o más según lo que necesitas entregar</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {CODE_TYPES.map(ct => {
                          const checked = selectedTypes.includes(ct.label)
                          return (
                            <button
                              key={ct.label}
                              type="button"
                              onClick={() => toggleType(ct.label)}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left text-sm transition ${
                                checked
                                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                                  : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                                checked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                              }`}>
                                {checked && <span className="text-white text-[10px] font-bold">✓</span>}
                              </span>
                              <span className="flex-1">{ct.label}</span>
                              <span className="text-xs text-gray-400 flex-shrink-0">{ct.sla}d</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Origen */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Origen <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.origin}
                      onChange={e => setFormData({ ...formData, origin: e.target.value as any })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    >
                      {ORIGINS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  {/* Datos / Sistema */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Datos / Sistema Involucrado
                    </label>
                    <select
                      value={formData.data_system_involved}
                      onChange={e => setFormData({ ...formData, data_system_involved: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                    >
                      <option value="">Selecciona un sistema</option>
                      {SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {/* Descripción */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required rows={4}
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none resize-none"
                      placeholder="Describe detalladamente tu solicitud..."
                    />
                  </div>

                  {/* Observaciones */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Observaciones</label>
                    <textarea
                      rows={2}
                      value={formData.observations}
                      onChange={e => setFormData({ ...formData, observations: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none resize-none"
                      placeholder="Información adicional (opcional)"
                    />
                  </div>

                  {/* Prioridad / Urgencia */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">Prioridad</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setIsUrgent(false)}
                        className={`py-3 rounded-xl border-2 text-sm font-semibold transition flex items-center justify-center gap-2 ${
                          !isUrgent
                            ? 'border-gray-400 bg-gray-50 text-gray-800'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        ⏱ Normal
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsUrgent(true)}
                        className={`py-3 rounded-xl border-2 text-sm font-semibold transition flex items-center justify-center gap-2 ${
                          isUrgent
                            ? 'border-red-500 bg-red-50 text-red-800'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        🔴 Urgente
                      </button>
                    </div>
                    {isUrgent && (
                      <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        ⚠️ Al marcar urgente el equipo se contactará contigo directamente para coordinar la atención. El SLA puede acortarse según disponibilidad.
                      </p>
                    )}
                  </div>

                  {/* SLA Panel — solo si necesita código y hay tipos seleccionados */}
                  {needsCode && selectedTypes.length > 0 && (
                    <div className={`border rounded-xl p-5 space-y-3 ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-semibold ${isUrgent ? 'text-red-900' : 'text-blue-900'}`}>⏱ SLA Estimado</p>
                          {heaviest && (
                            <p className={`text-xs mt-0.5 ${isUrgent ? 'text-red-600' : 'text-blue-600'}`}>
                              Tipo más complejo: <strong>{heaviest.label}</strong> ({heaviest.sla} días hábiles)
                              {selectedTypes.length > 1 && ` + ${(selectedTypes.length - 1) * 2} días por requerimientos adicionales`}
                              {isUrgent && ` → reducido a la mitad por urgencia`}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`text-4xl font-bold ${isUrgent ? 'text-red-700' : 'text-blue-700'}`}>{displaySLA}</span>
                          <span className={`text-sm font-semibold ml-1 ${isUrgent ? 'text-red-600' : 'text-blue-600'}`}>días hábiles</span>
                        </div>
                      </div>
                      <p className={`text-xs ${isUrgent ? 'text-red-500' : 'text-blue-500'}`}>
                        * El plazo comienza a correr a partir del <strong>siguiente día hábil</strong> tras el envío de la solicitud. Los días hábiles excluyen sábados y domingos.
                        <br />Fecha estimada de entrega: <strong>{new Date(addWorkingDays(displaySLA) + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
                      </p>
                    </div>
                  )}

                </div>
              )}
            </section>

            {/* Botón enviar */}
            {needsCode !== null && (
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition text-lg"
              >
                {loading ? 'Enviando...' : 'Enviar Solicitud'}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
