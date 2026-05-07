import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { LearningGraph, Node, Edge, Branch, Step, Session } from './types'
import { createDefaultBandtState, normalizeBandtState } from '../ai/bandit'

const DEFAULT_APP_NAME = 'Specter'
const STEP_ACTIONS = ['click', 'type', 'scroll', 'wait']

export function createDefaultGraph(appName = DEFAULT_APP_NAME): LearningGraph {
  return {
    userId: process.env.SPECTER_USER_ID || 'local-user',
    app: appName,
    nodes: {},
    edges: [],
    branches: {},
    sessions: [],
    bandtState: createDefaultBandtState()
  }
}

function graphPath(appName: string): string {
  const safeName = appName.replace(/[^a-z0-9._-]/gi, '_')
  return join(homedir(), 'Library', 'Application Support', 'Specter', `${safeName}.json`)
}

function isRecord(value: any): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringValue(value: any, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function nonNegativeNumber(value: any, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function _positiveNumber(value: any, fallback = 1): number {
  const normalized = nonNegativeNumber(value, fallback)
  return normalized > 0 ? normalized : fallback
}

function percentNumber(value: any, fallback = 50): number {
  return Math.min(100, nonNegativeNumber(value, fallback))
}

function nonNegativeInteger(value: any, fallback = 0): number {
  return Math.round(nonNegativeNumber(value, fallback))
}

function stringArray(value: any): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function normalizeAction(value: any): Step['action'] {
  return typeof value === 'string' && STEP_ACTIONS.includes(value) ? (value as Step['action']) : 'click'
}

function normalizeNode(nodeId: string, value: any): Node {
  const node = isRecord(value) ? value : {}
  return {
    id: stringValue(node.id, nodeId),
    title: stringValue(node.title, nodeId.replace(/[-_]/g, ' ')),
    description: typeof node.description === 'string' ? node.description : '',
    prerequisites: stringArray(node.prerequisites),
    completed: Boolean(node.completed),
    attempts: nonNegativeInteger(node.attempts),
    avgStepTimeMs: nonNegativeNumber(node.avgStepTimeMs),
    lastStepIndex: nonNegativeInteger(node.lastStepIndex)
  }
}

function normalizeEdge(value: any): Edge | null {
  if (!isRecord(value) || typeof value.from !== 'string' || typeof value.to !== 'string') {
    return null
  }
  return { from: value.from, to: value.to }
}

function normalizeBranch(branchId: string, value: any): Branch {
  const branch = isRecord(value) ? value : {}
  const forkedFrom = isRecord(branch.forkedFrom) ? branch.forkedFrom : {}
  const status = branch.status === 'completed' ? 'completed' : 'active'

  return {
    id: stringValue(branch.id, branchId),
    forkedFrom: {
      nodeId: stringValue(forkedFrom.nodeId, ''),
      stepIndex: nonNegativeInteger(forkedFrom.stepIndex)
    },
    nodesCovered: stringArray(branch.nodesCovered),
    status
  }
}

function normalizeStep(value: any): Step {
  const step = isRecord(value) ? value : {}
  return {
    x: percentNumber(step.x),
    y: percentNumber(step.y),
    action: normalizeAction(step.action),
    typeText: typeof step.typeText === 'string' ? step.typeText : undefined,
    delayMs: nonNegativeInteger(step.delayMs),
    narration: typeof step.narration === 'string' ? step.narration : undefined
  }
}

function normalizeSession(sessionId: string, value: any): Session {
  const session = isRecord(value) ? value : {}
  return {
    id: stringValue(session.id, sessionId),
    timestamp: stringValue(session.timestamp, new Date().toISOString()),
    nodesVisited: stringArray(session.nodesVisited),
    branchId: typeof session.branchId === 'string' ? session.branchId : undefined,
    steps: Array.isArray(session.steps) ? session.steps.map(normalizeStep) : []
  }
}

export function normalizeGraph(graph: any, appName: string): LearningGraph {
  const fallback = createDefaultGraph(appName)

  const nodes = isRecord(graph.nodes)
    ? Object.fromEntries(Object.entries(graph.nodes).map(([id, node]) => [id, normalizeNode(id, node)]))
    : fallback.nodes

  const branches = isRecord(graph.branches)
    ? Object.fromEntries(Object.entries(graph.branches).map(([id, branch]) => [id, normalizeBranch(id, branch)]))
    : fallback.branches

  const edges = Array.isArray(graph.edges)
    ? (graph.edges.map(normalizeEdge).filter((edge) => Boolean(edge)) as Edge[])
    : fallback.edges

  const sessions = Array.isArray(graph.sessions)
    ? graph.sessions.map((session: any, index: number) => normalizeSession(`session-${index + 1}`, session))
    : fallback.sessions

  return {
    ...fallback,
    ...graph,
    userId: typeof graph.userId === 'string' && graph.userId.trim() ? graph.userId : fallback.userId,
    app: typeof graph.app === 'string' && graph.app.trim() ? graph.app : appName,
    nodes,
    edges,
    branches,
    sessions,
    bandtState: normalizeBandtState(graph.bandtState)
  }
}

export function loadGraph(appName = DEFAULT_APP_NAME): LearningGraph {
  const filePath = graphPath(appName)
  if (!existsSync(filePath)) {
    return createDefaultGraph(appName)
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    return normalizeGraph(parsed, appName)
  } catch (error) {
    console.error('[Specter] Failed to load learning graph:', error)
    return createDefaultGraph(appName)
  }
}

export function saveGraph(graph: LearningGraph): void {
  const filePath = graphPath(graph.app || DEFAULT_APP_NAME)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(normalizeGraph(graph, graph.app), null, 2) + '\n', 'utf8')
}
