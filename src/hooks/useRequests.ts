import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Request } from '../types/database.types'
import { DEFAULT_CHECKLIST } from '../lib/checklist-defaults'

import { logActivity } from './useActivityLog'
import { calcSlaFormalDays, calcTargetDate } from '../lib/sla-config'
import { sendNotification } from '../lib/notifications'

export function useRequests() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('requests')
        .select('*, projects(status)')
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error
      setRequests(data || [])
    } catch (err) {
      console.error('Error loading requests:', err)
    } finally {
      setLoading(false)
    }
  }

  const createRequest = async (requestData: Partial<Request>) => {
    try {
      // Convert empty date strings to null to avoid DB type errors
      const cleanedData = {
        ...requestData,
        request_date: requestData.request_date || null,
        requested_date: requestData.requested_date || null,
      }
      const { data, error } = await supabase
        .from('requests')
        .insert([cleanedData])
        .select()
        .single()

      if (error) throw error
      await loadRequests()
      return data
    } catch (err) {
      console.error('Error creating request:', err)
      throw err
    }
  }

  const approveRequest = async (requestId: string, projectData: {
    project_type: 'development' | 'administrative' | 'dual'
    priority: 'low' | 'medium' | 'high' | 'urgent'
    title?: string
    start_date?: string
    due_date?: string
    assigned_dev?: string
    assigned_admin?: string
  }) => {
    try {
      // 1. Obtener el request
      const { data: request, error: requestError } = await supabase
        .from('requests')
        .select('*')
        .eq('id', requestId)
        .single()

      if (requestError) throw requestError

      // 2. Calculate SLA target date (null for low priority = backlog)
      const slaFormalDays = calcSlaFormalDays(request.request_type, request.needs_code)
      const slaTargetDate = calcTargetDate(slaFormalDays, projectData.priority)

      // 3. Crear el proyecto
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert([{
          request_id: requestId,
          title: projectData.title?.trim() || `${request.request_type} - ${request.requester_area}`,
          description: request.description,
          project_type: projectData.project_type,
          priority: projectData.priority,
          status: 'active',
          is_blocked: false,
          start_date: projectData.start_date || null,
          due_date: projectData.due_date || null,
          sla_target_date: slaTargetDate,
        }])
        .select()
        .single()

      if (projectError) throw projectError

      // Log SLA start only for non-low priority (low = backlog, no SLA committed)
      if (projectData.priority !== 'low') {
        await logActivity(project.id, 'sla_started', {
          sla_formal_days: slaFormalDays,
          sla_target_date: slaTargetDate,
          request_number: request.request_number,
        })
      }

      // 3. Crear los flujos según el tipo de proyecto
      const flows = []

      if (projectData.project_type === 'development' || projectData.project_type === 'dual') {
        flows.push({
          project_id: project.id,
          flow_type: 'development',
          current_phase: 'backlog',
          progress: 0,
          assigned_to: projectData.assigned_dev || null,
        })
      }

      if (projectData.project_type === 'administrative' || projectData.project_type === 'dual') {
        flows.push({
          project_id: project.id,
          flow_type: 'administrative',
          current_phase: 'backlog',
          progress: 0,
          assigned_to: projectData.assigned_admin || null,
        })
      }

      const { data: createdFlows, error: flowsError } = await supabase
        .from('project_flows')
        .insert(flows)
        .select()

      if (flowsError) throw flowsError

      // 3b. Crear checklist items por defecto para cada flujo y fase
      const checklistItems: {
        project_flow_id: string
        phase: string
        description: string
        completed: boolean
        order_index: number
      }[] = []

      for (const flow of createdFlows || []) {
        const flowDefaults = DEFAULT_CHECKLIST[flow.flow_type as 'development' | 'administrative'] || {}
        for (const [phase, descriptions] of Object.entries(flowDefaults)) {
          descriptions.forEach((description, idx) => {
            checklistItems.push({
              project_flow_id: flow.id,
              phase,
              description,
              completed: false,
              order_index: idx,
            })
          })
        }
      }

      if (checklistItems.length > 0) {
        const { error: checklistError } = await supabase
          .from('checklist_items')
          .insert(checklistItems)
        if (checklistError) throw checklistError
      }

      // 3c. Notificar a los responsables asignados
      const notifyUsers = [...new Set([
        projectData.assigned_dev?.trim(),
        projectData.assigned_admin?.trim(),
      ].filter(Boolean) as string[])]

      for (const userId of notifyUsers) {
        await sendNotification({
          userId,
          type:      'project_assigned',
          title:     'Proyecto asignado a vos',
          message:   project.title,
          projectId: project.id,
        })
      }

      // 4. Actualizar el request como aprobado
      const { error: updateError } = await supabase
        .from('requests')
        .update({
          status: 'approved',
          project_id: project.id,
        })
        .eq('id', requestId)

      if (updateError) throw updateError

      await loadRequests()
    } catch (err) {
      console.error('Error approving request:', err)
      throw err
    }
  }

  const rejectRequest = async (requestId: string, reason: string) => {
    try {
      const { error } = await supabase
        .from('requests')
        .update({ 
          status: 'rejected',
          rejection_reason: reason 
        })
        .eq('id', requestId)

      if (error) throw error
      await loadRequests()
    } catch (err) {
      console.error('Error rejecting request:', err)
      throw err
    }
  }

  const getRequestByNumber = async (requestNumber: string) => {
    try {
      const { data, error } = await supabase
        .from('requests')
        .select('*')
        .eq('request_number', requestNumber)
        .single()

      if (error) throw error
      return data
    } catch (err) {
      console.error('Error getting request:', err)
      return null
    }
  }

  return {
    requests,
    loading,
    createRequest,
    approveRequest,
    rejectRequest,
    getRequestByNumber,
    reload: loadRequests
  }
}