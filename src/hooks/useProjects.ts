import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Project, ProjectFlow } from '../types/database.types'
import { logActivity } from './useActivityLog'
import { sendNotification } from '../lib/notifications'

type StatusFilter = 'active' | 'completed' | 'archived'

const PHASE_PROGRESS: Record<string, number> = {
  // development
  backlog: 0, design: 20, dev: 40, testing: 60, deploy: 80, done: 100,
  // administrative
  ready_to_start: 20, discovery: 40, build: 60, uat_validation: 80, deployed: 100,
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, _setStatusFilter] = useState<StatusFilter>(() => {
    const s = localStorage.getItem('kanban_statusFilter') as StatusFilter
    return (['active', 'completed', 'archived'] as StatusFilter[]).includes(s) ? s : 'active'
  })
  const setStatusFilter = (v: StatusFilter) => {
    localStorage.setItem('kanban_statusFilter', v)
    _setStatusFilter(v)
  }
  const [limit, setLimit] = useState(100)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    loadProjects(statusFilter)
  }, [statusFilter])

  // Keep refs so realtime callbacks always use current filter & limit
  const statusFilterRef = useRef(statusFilter)
  const limitRef        = useRef(limit)
  useEffect(() => { statusFilterRef.current = statusFilter }, [statusFilter])
  useEffect(() => { limitRef.current = limit },               [limit])

  // Realtime: refresh when any project or flow changes externally
  useEffect(() => {
    const channel = supabase
      .channel('projects-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        loadProjects(statusFilterRef.current, limitRef.current)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_flows' }, () => {
        loadProjects(statusFilterRef.current, limitRef.current)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const loadProjects = async (status: StatusFilter = statusFilter, currentLimit = limit) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          project_flows (*, checklist_items(id, completed)),
          requests (requester_area, requester_name, request_type, request_number)
        `)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(currentLimit + 1)

      if (error) throw error
      const rows = data || []
      setHasMore(rows.length > currentLimit)
      setProjects(rows.slice(0, currentLimit))
    } catch (err: any) {
      setError(err.message)
      console.error('Error loading projects:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateProject = async (projectId: string, updates: Partial<Project>) => {
    try {
      // Leer estado actual para detectar cambios
      const current = projects.find(p => p.id === projectId)

      const { error } = await supabase
        .from('projects')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', projectId)

      if (error) throw error

      // Registrar actividad según qué cambió
      if (updates.status && current?.status !== updates.status) {
        await logActivity(projectId, 'status_changed', { from: current?.status, to: updates.status })

        // SLA + Lead Time al completar
        if (updates.status === 'completed') {
          const { data: slaLog } = await supabase
            .from('activity_logs')
            .select('created_at, details')
            .eq('project_id', projectId)
            .eq('action', 'sla_started')
            .order('created_at', { ascending: true })
            .limit(1)
            .single()

          if (slaLog) {
            const now = Date.now()
            const approvalDate = new Date(slaLog.created_at).getTime()

            // Restar tiempo que estuvo bloqueado (no cuenta contra el SLA)
            const { data: blockEvents } = await supabase
              .from('activity_logs')
              .select('action, created_at')
              .eq('project_id', projectId)
              .in('action', ['blocked', 'unblocked'])
              .order('created_at', { ascending: true })

            let blockedMs = 0
            let blockStart: number | null = null
            for (const ev of blockEvents ?? []) {
              if (ev.action === 'blocked') {
                blockStart = new Date(ev.created_at).getTime()
              } else if (ev.action === 'unblocked' && blockStart !== null) {
                blockedMs += new Date(ev.created_at).getTime() - blockStart
                blockStart = null
              }
            }
            const blockedDays = Math.floor(blockedMs / 86400000)
            const daysElapsed = Math.max(0, Math.ceil((now - approvalDate) / (1000 * 60 * 60 * 24)) - blockedDays)
            const dueDate = (slaLog.details as any)?.sla_target_date
            const onTime = dueDate ? new Date() <= new Date(dueDate + 'T23:59:59') : undefined

            // Lead time: desde creación del request hasta hoy
            let leadTimeDays: number | undefined
            let approvalWaitDays: number | undefined
            if (current?.request_id) {
              const { data: req } = await supabase
                .from('requests')
                .select('created_at')
                .eq('id', current.request_id)
                .single()
              if (req) {
                const requestCreated = new Date(req.created_at).getTime()
                leadTimeDays = Math.ceil((now - requestCreated) / (1000 * 60 * 60 * 24))
                approvalWaitDays = Math.ceil((approvalDate - requestCreated) / (1000 * 60 * 60 * 24))
              }
            }

            await logActivity(projectId, 'sla_completed', {
              cycle_time_days: daysElapsed,
              due_date: dueDate,
              on_time: onTime,
              ...(blockedDays > 0 && { blocked_days: blockedDays }),
              ...(leadTimeDays !== undefined && { lead_time_days: leadTimeDays }),
              ...(approvalWaitDays !== undefined && { approval_wait_days: approvalWaitDays }),
            })
          }
        }
      } else if (updates.is_blocked === true) {
        await logActivity(projectId, 'blocked', { reason: updates.blocked_reason })
        // Notify all assigned users
        const flows: any[] = (current as any)?.project_flows ?? []
        const assignedIds = [...new Set(flows.map(f => f.assigned_to).filter(Boolean) as string[])]
        for (const userId of assignedIds) {
          await sendNotification({
            userId,
            type:      'project_blocked',
            title:     'Proyecto bloqueado',
            message:   current?.title,
            projectId,
          })
        }
      } else if (updates.is_blocked === false) {
        await logActivity(projectId, 'unblocked', {})
      } else if (updates.priority && current?.priority !== updates.priority) {
        await logActivity(projectId, 'priority_changed', { from: current?.priority, to: updates.priority })
      } else if (updates.title || updates.description) {
        const changed = Object.keys(updates).filter(k => k !== 'updated_at')
        await logActivity(projectId, 'edited', { fields: changed })
      }

      // Due date change — runs independently (can co-occur with other edits)
      if ('due_date' in updates && (updates.due_date ?? null) !== (current?.due_date ?? null)) {
        await logActivity(projectId, 'due_date_changed', {
          from: current?.due_date ?? null,
          to: updates.due_date ?? null,
        })
      }

      await loadProjects()
    } catch (err: any) {
      console.error('Error updating project:', err)
      throw err
    }
  }

  const updateFlowDetails = async (flowId: string, updates: { progress?: number; assigned_to?: string }) => {
    try {
      // Find current flow for assignment logging
      let projectId: string | undefined
      let currentFlow: ProjectFlow | undefined
      for (const p of projects) {
        const flow = (p as any).project_flows?.find((f: ProjectFlow) => f.id === flowId)
        if (flow) { projectId = p.id; currentFlow = flow; break }
      }

      const { error } = await supabase
        .from('project_flows')
        .update({ ...updates })
        .eq('id', flowId)

      if (error) throw error

      // Log assignment change
      if (projectId && currentFlow && 'assigned_to' in updates) {
        const from = currentFlow.assigned_to ?? null
        const to = updates.assigned_to ?? null
        if (from !== to) {
          await logActivity(projectId, from ? 'reassigned' : 'assigned', {
            from,
            to,
            flow_type: currentFlow.flow_type,
          })
          // Notify newly assigned user
          if (to) {
            const project = projects.find(p => p.id === projectId)
            await sendNotification({
              userId:    to,
              type:      'project_assigned',
              title:     'Proyecto asignado a vos',
              message:   project?.title,
              projectId,
            })
          }
        }
      }

      await loadProjects()
    } catch (err: any) {
      console.error('Error updating flow details:', err)
      throw err
    }
  }

  const updateProjectFlow = async (flowId: string, newPhase: string) => {
    try {
      // Optimistic update: reflect immediately in UI
      const newProgress = PHASE_PROGRESS[newPhase] ?? 0
      setProjects(prev => prev.map(p => ({
        ...p,
        project_flows: (p as any).project_flows?.map((f: ProjectFlow) =>
          f.id === flowId ? { ...f, current_phase: newPhase, progress: newProgress } : f
        ),
      })))

      // Encontrar la fase actual para registrar el cambio
      let projectId: string | undefined
      let fromPhase: string | undefined
      for (const p of projects) {
        const flow = (p as any).project_flows?.find((f: ProjectFlow) => f.id === flowId)
        if (flow) { projectId = p.id; fromPhase = flow.current_phase; break }
      }

      const { error } = await supabase
        .from('project_flows')
        .update({ current_phase: newPhase, progress: newProgress })
        .eq('id', flowId)

      if (error) throw error

      if (projectId) {
        // Calcular tiempo en la fase anterior
        const { data: lastLog } = await supabase
          .from('activity_logs')
          .select('created_at')
          .eq('project_id', projectId)
          .in('action', ['phase_changed', 'sla_started', 'created'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const duration_ms = lastLog
          ? Date.now() - new Date(lastLog.created_at).getTime()
          : undefined

        await logActivity(projectId, 'phase_changed', { from: fromPhase, to: newPhase, duration_ms })
      }

      await loadProjects()
    } catch (err: any) {
      console.error('Error updating project flow:', err)
      throw err
    }
  }

  const createProject = async (projectData: {
    title: string
    description: string
    project_type: 'development' | 'administrative' | 'dual'
    priority: 'low' | 'medium' | 'high' | 'urgent'
    start_date?: string
    due_date?: string
    area?: string
    requester_name?: string
  }) => {
    try {
        // Generate next INT{YY}-XXX number (resets each year)
      const yearSuffix = new Date().getFullYear().toString().slice(2)
      const intPrefix = `INT${yearSuffix}-`
      const { data: lastInt } = await supabase
        .from('projects')
        .select('project_number')
        .like('project_number', `${intPrefix}%`)
        .order('project_number', { ascending: false })
        .limit(1)
      const lastNum = lastInt?.[0]?.project_number
        ? parseInt(lastInt[0].project_number.replace(intPrefix, ''), 10)
        : 0
      const projectNumber = `${intPrefix}${String(lastNum + 1).padStart(3, '0')}`

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert([{
          title: projectData.title.trim(),
          description: projectData.description.trim(),
          project_type: projectData.project_type,
          priority: projectData.priority,
          status: 'active',
          is_blocked: false,
          start_date: projectData.start_date || null,
          due_date: projectData.due_date || null,
          sla_target_date: projectData.due_date || null,
          project_number: projectNumber,
        }])
        .select()
        .single()

      if (projectError) throw projectError

      const flows = []
      if (projectData.project_type === 'development' || projectData.project_type === 'dual') {
        flows.push({ project_id: project.id, flow_type: 'development', current_phase: 'backlog', progress: 0 })
      }
      if (projectData.project_type === 'administrative' || projectData.project_type === 'dual') {
        flows.push({ project_id: project.id, flow_type: 'administrative', current_phase: 'backlog', progress: 0 })
      }

      const { error: flowsError } = await supabase.from('project_flows').insert(flows)
      if (flowsError) throw flowsError

      // If an area (or requester name) was provided, create a stub request and link it
      if (projectData.area) {
        const { data: stubRequest } = await supabase
          .from('requests')
          .insert([{
            request_number: projectNumber,
            requester_name: projectData.requester_name?.trim() || '—',
            requester_area: projectData.area,
            request_type: 'INT',
            origin: 'Interno',
            description: projectData.description.trim(),
            needs_code: false,
            status: 'approved',
            project_id: project.id,
          }])
          .select()
          .single()

        if (stubRequest) {
          await supabase
            .from('projects')
            .update({ request_id: stubRequest.id })
            .eq('id', project.id)
        }
      }

      await logActivity(project.id, 'created', { title: project.title })
      await loadProjects()
      return project
    } catch (err: any) {
      console.error('Error creating project:', err)
      throw err
    }
  }

  const deleteProject = async (projectId: string) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', projectId)
      if (error) throw error
      await logActivity(projectId, 'project_deleted', {})
      await loadProjects()
    } catch (err: any) {
      console.error('Error deleting project:', err)
      throw err
    }
  }

  const loadMore = () => {
    const newLimit = limit + 100
    setLimit(newLimit)
    loadProjects(statusFilter, newLimit)
  }

  const bulkUpdateProjects = async (ids: string[], updates: Partial<Project>) => {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .in('id', ids)
      if (error) throw error
      await loadProjects()
    } catch (err: any) {
      console.error('Error bulk updating projects:', err)
      throw err
    }
  }

  return {
    projects,
    loading,
    error,
    hasMore,
    loadMore,
    statusFilter,
    setStatusFilter,
    reload: () => loadProjects(statusFilter),
    updateProject,
    updateProjectFlow,
    updateFlowDetails,
    createProject,
    deleteProject,
    bulkUpdateProjects,
  }
}
