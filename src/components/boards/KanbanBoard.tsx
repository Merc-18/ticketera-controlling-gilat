import { DragDropContext, DropResult } from '@hello-pangea/dnd'
import { useState, useEffect } from 'react'
import BoardColumn from './BoardColumn'
import ProjectListView from './ProjectListView'
import TableView from './TableView'
import GanttView from './GanttView'
import RoadmapView from './RoadmapView'
import ProjectModal from '../projects/ProjectModal'
import NewProjectModal from '../projects/NewProjectModal'
import { useProjects } from '../../hooks/useProjects'
import { useUsers } from '../../hooks/useUsers'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../../lib/toast'
import type { ProjectFlow } from '../../types/database.types'
import { AREAS } from '../../lib/constants'


type BoardType = 'development' | 'administrative'
type ViewMode  = 'kanban' | 'table' | 'gantt' | 'roadmap'

interface Props {
  boardType: BoardType
  openProjectId?: string | null
  onOpenHandled?: () => void
}

const PHASES = {
  development: [
    { id: 'backlog', title: '📋 Backlog', color: 'bg-gray-600' },
    { id: 'design', title: '📝 Design', color: 'bg-blue-600' },
    { id: 'dev', title: '💻 Development', color: 'bg-purple-600' },
    { id: 'testing', title: '🧪 Testing', color: 'bg-yellow-600' },
    { id: 'deploy', title: '🚀 Deploy', color: 'bg-green-600' },
    { id: 'done', title: '✅ Done', color: 'bg-emerald-700' },
  ],
  administrative: [
    { id: 'backlog', title: '📋 Backlog', color: 'bg-gray-600' },
    { id: 'ready_to_start', title: '🎯 Ready to Start', color: 'bg-blue-600' },
    { id: 'discovery', title: '🔍 Discovery', color: 'bg-indigo-600' },
    { id: 'design', title: '📝 Design', color: 'bg-purple-600' },
    { id: 'build', title: '🔨 Build', color: 'bg-orange-600' },
    { id: 'uat_validation', title: '✔️ UAT/Validation', color: 'bg-yellow-600' },
    { id: 'deployed', title: '🚀 Deployed', color: 'bg-green-600' },
  ],
}

const STATUS_OPTIONS = [
  { value: 'active',    label: '🟢 Activos',     activeClass: 'bg-blue-600 text-white' },
  { value: 'completed', label: '✅ Completados',  activeClass: 'bg-green-600 text-white' },
  { value: 'archived',  label: '📦 Archivados',   activeClass: 'bg-gray-600 text-white' },
] as const

const PRIORITY_OPTS = [
  { value: 'all',    label: 'Prioridad' },
  { value: 'urgent', label: '🔴 Urgente' },
  { value: 'high',   label: '🟠 Alta' },
  { value: 'medium', label: '🟡 Media' },
  { value: 'low',    label: '🟢 Baja' },
]

const VIEW_MODES: { value: ViewMode; label: string; icon: string }[] = [
  { value: 'kanban',  label: 'Kanban',  icon: '⬛' },
  { value: 'table',   label: 'Tabla',   icon: '☰' },
  { value: 'gantt',   label: 'Gantt',   icon: '📅' },
  { value: 'roadmap', label: 'Roadmap', icon: '🗓' },
]

export default function KanbanBoard({ boardType, openProjectId, onOpenHandled }: Props) {
  const { projects, loading, hasMore, loadMore, statusFilter, setStatusFilter, updateProjectFlow, updateProject, updateFlowDetails, createProject, deleteProject, reload, bulkUpdateProjects } = useProjects()
  const { activeUsers } = useUsers()
  const { user: currentUser } = useAuth()
  const role = currentUser?.role ?? 'viewer'
  const canEdit    = role === 'superadmin' || role === 'admin' || role === 'developer'
  const canManage  = role === 'superadmin' || role === 'admin'
  const [selectedProject, setSelectedProject] = useState<{ project: any; flow: ProjectFlow } | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [priorityFilter, setPriorityFilter] = useState(() => localStorage.getItem('kanban_priorityFilter') || 'all')
  const [areaFilter, setAreaFilter]         = useState(() => localStorage.getItem('kanban_areaFilter') || 'all')
  const [userFilter, setUserFilter]         = useState(() => localStorage.getItem('kanban_userFilter') || 'all')
  const [myProjectsOnly, setMyProjectsOnly] = useState(() => localStorage.getItem('kanban_myProjectsOnly') === 'true')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = localStorage.getItem('kanban_viewMode') as ViewMode
    return (['kanban', 'table', 'gantt', 'roadmap'] as ViewMode[]).includes(v) ? v : 'kanban'
  })

  useEffect(() => { localStorage.setItem('kanban_priorityFilter', priorityFilter) }, [priorityFilter])
  useEffect(() => { localStorage.setItem('kanban_areaFilter', areaFilter) },         [areaFilter])
  useEffect(() => { localStorage.setItem('kanban_userFilter', userFilter) },         [userFilter])
  useEffect(() => { localStorage.setItem('kanban_myProjectsOnly', String(myProjectsOnly)) }, [myProjectsOnly])
  useEffect(() => { localStorage.setItem('kanban_viewMode', viewMode) },              [viewMode])
  useEffect(() => { setSelectedIds([]) }, [statusFilter])

  // Sincronizar selectedProject con datos frescos después de cada reload
  useEffect(() => {
    if (selectedProject) {
      const fresh = projects.find(p => p.id === selectedProject.project.id)
      if (fresh) {
        setSelectedProject(prev => prev ? { ...prev, project: fresh } : null)
      }
    }
  }, [projects])

  // Abrir proyecto al hacer clic en una notificación
  useEffect(() => {
    if (!openProjectId || !projects.length) return
    const project = projects.find(p => p.id === openProjectId)
    if (project) {
      const flow = (project as any).project_flows?.[0] ?? null
      setSelectedProject({ project, flow })
      onOpenHandled?.()
    }
  }, [openProjectId, projects])

  const phases = PHASES[boardType]


  const filteredProjects = projects.filter(project => {
    if (priorityFilter !== 'all' && project.priority !== priorityFilter) return false
    const area = (project as any).requests?.requester_area
    if (areaFilter !== 'all' && area !== areaFilter) return false

    // Filtro por responsable / usuario
    if (canManage) {
      if (userFilter === 'me' && currentUser) {
        const flows: any[] = (project as any).project_flows ?? []
        if (!flows.some(f => f.assigned_to === currentUser.id)) return false
      } else if (userFilter !== 'all') {
        const flows: any[] = (project as any).project_flows ?? []
        if (!flows.some(f => f.assigned_to === userFilter)) return false
      }
    } else {
      if (myProjectsOnly && currentUser) {
        const flows: any[] = (project as any).project_flows ?? []
        if (!flows.some(f => f.assigned_to === currentUser.id)) return false
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const titleMatch = project.title?.toLowerCase().includes(q)
      const numMatch   = (project as any).project_number?.toLowerCase().includes(q)
      const areaMatch  = area?.toLowerCase().includes(q)
      if (!titleMatch && !numMatch && !areaMatch) return false
    }
    return true
  })

  const getProjectsByPhase = (phaseId: string) => {
    return filteredProjects
      .map((project) => {
        const flow = ((project as any).project_flows as ProjectFlow[] || []).find(
          (f) => f.flow_type === boardType && f.current_phase === phaseId
        )
        return flow ? { project, flow } : null
      })
      .filter(Boolean) as Array<{ project: any; flow: ProjectFlow }>
  }

  const handleDragEnd = async (result: DropResult) => {
    if (!canEdit) return
    const { destination, draggableId } = result
    if (!destination) return
    try {
      await updateProjectFlow(draggableId, destination.droppableId)
    } catch (error) {
      console.error('Error moving project:', error)
    }
  }

  const hasFilters = priorityFilter !== 'all' || areaFilter !== 'all' || (canManage ? userFilter !== 'all' : myProjectsOnly) || searchQuery.trim() !== ''
  const filteredCount = filteredProjects.length
  const totalCount = projects.length

  // Skeleton en la carga inicial (sin proyectos aún)
  if (loading && projects.length === 0) {
    return (
      <>
        <div className="flex items-center gap-4 mb-4">
          <div>
            <div className="h-7 w-56 bg-gray-200 rounded animate-pulse mb-1" />
            <div className="h-3 w-64 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-10 w-72 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="flex items-center gap-2 mb-4">
          {[1, 2, 3].map(i => <div key={i} className="h-8 w-24 bg-gray-100 rounded-full animate-pulse" />)}
          <div className="ml-auto h-8 w-36 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {phases.map((phase, ci) => (
            <div key={phase.id} className="flex-shrink-0 w-80">
              <div className={`rounded-t-lg p-3 ${phase.color} opacity-50`}>
                <div className="h-4 w-28 bg-white/40 rounded" />
              </div>
              <div className="bg-gray-50 rounded-b-lg p-3 space-y-3 min-h-[200px]">
                {Array.from({ length: ci < 2 ? 3 : ci < 4 ? 2 : 1 }).map((_, j) => (
                  <div key={j} className="bg-white rounded-lg border border-gray-100 p-3.5 animate-pulse">
                    <div className="h-3 bg-gray-200 rounded mb-2 w-4/5" />
                    <div className="h-3 bg-gray-100 rounded mb-3 w-3/5" />
                    <div className="flex gap-1 mb-2.5">
                      <div className="h-4 bg-gray-200 rounded w-12" />
                      <div className="h-4 bg-gray-100 rounded w-8" />
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="h-3 bg-gray-100 rounded w-16" />
                      <div className="h-5 w-5 bg-gray-200 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  const boardTitle = boardType === 'development' ? '💻 Board Development' : '📋 Board Administrative'

  return (
    <>
      {/* Header: título + buscador */}
      <div className="flex items-center gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{boardTitle}</h2>
          <p className="text-gray-500 text-xs mt-0.5">Arrastra y suelta los proyectos entre las columnas</p>
        </div>
        <input
          type="text"
          placeholder="Buscar por título, número o área..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary bg-white placeholder-gray-400 w-72"
        />
      </div>

      {/* Fila única: Vista + Filtros + Toggle de modo */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-sm text-gray-500 font-medium">Vista:</span>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              statusFilter === opt.value
                ? opt.activeClass
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}

        {/* Separador */}
        {statusFilter === 'active' && (
          <span className="text-gray-300 select-none">|</span>
        )}

        {/* Filtros de prioridad y área (solo en vista activa) */}
        {statusFilter === 'active' && (
          <>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition cursor-pointer outline-none ${
                priorityFilter !== 'all'
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {PRIORITY_OPTS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition cursor-pointer outline-none ${
                areaFilter !== 'all'
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <option value="all">Área</option>
              {AREAS.map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>

            {/* Filtro por Responsable / Usuario */}
            {canManage ? (
              <select
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition cursor-pointer outline-none ${
                  userFilter !== 'all'
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-semibold'
                    : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <option value="all">👤 Todos los responsables</option>
                <option value="me">👤 Mis proyectos</option>
                <optgroup label="Filtrar por Usuario">
                  {activeUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role})
                    </option>
                  ))}
                </optgroup>
              </select>
            ) : (
              <button
                onClick={() => setMyProjectsOnly(v => !v)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  myProjectsOnly
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                👤 Mis proyectos
              </button>
            )}

            {hasFilters && (
              <>
                <button
                  onClick={() => { setPriorityFilter('all'); setAreaFilter('all'); setUserFilter('all'); setMyProjectsOnly(false); setSearchQuery('') }}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition"
                >
                  ✕ Limpiar
                </button>
                <span className="text-sm text-gray-500">
                  {filteredCount} de {totalCount}
                </span>
              </>
            )}
          </>
        )}

        {/* Nuevo proyecto + View mode toggle (derecha) */}
        {canManage && (
          <button
            onClick={() => setShowNewModal(true)}
            className="ml-auto px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition flex items-center gap-1.5"
          >
            <span className="text-base leading-none">+</span> Nuevo Proyecto
          </button>
        )}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {VIEW_MODES.map(vm => (
            <button
              key={vm.value}
              onClick={() => setViewMode(vm.value)}
              title={vm.label}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                viewMode === vm.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {vm.icon} {vm.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── VISTA TABLA ── */}
      {viewMode === 'table' && (
        <TableView
          projects={filteredProjects as any}
          boardType={boardType}
          onProjectClick={setSelectedProject}
          loading={loading}
        />
      )}

      {/* ── VISTA GANTT ── */}
      {viewMode === 'gantt' && (
        <GanttView
          projects={filteredProjects as any}
          boardType={boardType}
          onProjectClick={setSelectedProject}
          loading={loading}
        />
      )}

      {/* ── VISTA ROADMAP ── */}
      {viewMode === 'roadmap' && (
        <RoadmapView
          projects={filteredProjects as any}
          onProjectClick={setSelectedProject}
          loading={loading}
        />
      )}

      {/* ── KANBAN: sin resultados con filtros activos ── */}
      {viewMode === 'kanban' && statusFilter === 'active' && filteredProjects.length === 0 && hasFilters && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <span className="text-5xl mb-3">🔍</span>
          <p className="text-base font-medium text-gray-500">Sin proyectos con los filtros aplicados</p>
          <button
            onClick={() => { setPriorityFilter('all'); setAreaFilter('all'); setMyProjectsOnly(false); setSearchQuery('') }}
            className="mt-3 text-sm text-primary hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* ── VISTA KANBAN ── */}
      {viewMode === 'kanban' && statusFilter === 'active' && !(filteredProjects.length === 0 && hasFilters) && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {phases.map((phase) => (
              <BoardColumn
                key={phase.id}
                phase={phase}
                projects={getProjectsByPhase(phase.id)}
                onProjectClick={setSelectedProject}
                users={activeUsers}
                onAssign={(flowId, userId) => updateFlowDetails(flowId, { assigned_to: userId }).then(reload)}
                selectedIds={canEdit ? selectedIds : []}
                onSelect={canEdit ? (id => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])) : undefined}
              />
            ))}
          </div>
        </DragDropContext>
      )}

      {/* Completados / Archivados en modo kanban */}
      {viewMode === 'kanban' && (statusFilter === 'completed' || statusFilter === 'archived') && (
        <ProjectListView
          projects={projects as any}
          boardType={boardType}
          onProjectClick={setSelectedProject}
          status={statusFilter}
        />
      )}

      {/* Cargar más */}
      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={loadMore}
            className="px-6 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition shadow-sm"
          >
            Cargar más proyectos...
          </button>
        </div>
      )}

      {/* ── BULK ACTION BAR ── */}
      {canEdit && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 shadow-2xl rounded-2xl px-5 py-3 flex items-center gap-4 min-w-max">
          <span className="text-sm font-semibold text-gray-700">
            {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
          </span>
          <div className="h-5 w-px bg-gray-200" />
          <select
            defaultValue=""
            onChange={async e => {
              const val = e.target.value
              if (!val) return
              await bulkUpdateProjects(selectedIds, { priority: val as any })
              setSelectedIds([])
              toast.success(`Prioridad actualizada en ${selectedIds.length} proyecto${selectedIds.length !== 1 ? 's' : ''}`)
            }}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 cursor-pointer outline-none hover:border-gray-300"
          >
            <option value="" disabled>Cambiar prioridad...</option>
            <option value="urgent">🔴 Urgente</option>
            <option value="high">🟠 Alta</option>
            <option value="medium">🟡 Media</option>
            <option value="low">🟢 Baja</option>
          </select>
          <button
            onClick={async () => {
              const count = selectedIds.length
              await bulkUpdateProjects(selectedIds, { status: 'archived' as any })
              setSelectedIds([])
              toast.success(`${count} proyecto${count !== 1 ? 's' : ''} archivado${count !== 1 ? 's' : ''}`)
            }}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium transition"
          >
            📦 Archivar
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="text-sm text-gray-400 hover:text-gray-600 transition"
          >
            ✕ Cancelar
          </button>
        </div>
      )}

      {/* Project Modal */}
      {selectedProject && (
        <ProjectModal
          project={selectedProject.project}
          flows={(selectedProject.project as any).project_flows || []}
          onClose={() => setSelectedProject(null)}
          onUpdate={reload}
          onDelete={async (id) => { await deleteProject(id); setSelectedProject(null) }}
          updateProject={updateProject}
          updateFlowDetails={updateFlowDetails}
        />
      )}

      {/* New Project Modal */}
      {showNewModal && (
        <NewProjectModal
          boardType={boardType}
          onClose={() => setShowNewModal(false)}
          onCreate={createProject}
        />
      )}
    </>
  )
}
