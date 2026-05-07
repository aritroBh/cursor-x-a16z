import Anthropic from '@anthropic-ai/sdk'

const CLAUDE_MODEL = 'claude-sonnet-4-5'
const STEP_ACTIONS = ['click', 'type', 'scroll', 'wait']
const SYSTEM_PROMPT =
  'You are a software tutor. Given the user\'s intent, current screen state, and their learning history, generate a precise step-by-step tutorial. Return ONLY valid JSON. Coordinates must be percentages of screen dimensions. Keep instructions under 15 words each for Silent mode, conversational for Ultra mode.'

function anthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null
  }
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  })
}

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] || text.match(/\{[\s\S]*\}/)?.[0] || text
  return JSON.parse(candidate)
}

function clampCoordinate(value: any, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(100, Math.max(0, value))
}

function isStepAction(value: any): boolean {
  return typeof value === 'string' && STEP_ACTIONS.includes(value)
}

function normalizeSequence(value: any, fallback: any): any {
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const maybeSequence = value
  const steps =
    Array.isArray(maybeSequence.steps) && maybeSequence.steps.length > 0 ? maybeSequence.steps : fallback.steps

  return {
    levelTitle:
      typeof maybeSequence.levelTitle === 'string' && maybeSequence.levelTitle.trim()
        ? maybeSequence.levelTitle
        : fallback.levelTitle,
    estimatedMinutes:
      typeof maybeSequence.estimatedMinutes === 'number' && Number.isFinite(maybeSequence.estimatedMinutes)
        ? Math.max(1, Math.round(maybeSequence.estimatedMinutes))
        : fallback.estimatedMinutes,
    steps: steps.map((step: any, index: number) => {
      const partial = step
      const fallbackStep = fallback.steps[Math.min(index, fallback.steps.length - 1)]

      return {
        id: typeof partial.id === 'string' ? partial.id : `step-${index + 1}`,
        instruction:
          typeof partial.instruction === 'string' && partial.instruction.trim()
            ? partial.instruction
            : fallbackStep.instruction,
        targetLabel:
          typeof partial.targetLabel === 'string' && partial.targetLabel.trim()
            ? partial.targetLabel
            : fallbackStep.targetLabel,
        x: clampCoordinate(partial.x ?? partial.targetX, fallbackStep.x),
        y: clampCoordinate(partial.y ?? partial.targetY, fallbackStep.y),
        action: isStepAction(partial.action) ? partial.action : fallbackStep.action,
        typeText: typeof partial.typeText === 'string' ? partial.typeText : undefined,
        waitForMs: typeof partial.waitForMs === 'number' && Number.isFinite(partial.waitForMs) ? Math.max(0, partial.waitForMs) : undefined
      }
    })
  }
}

function fallbackSequence(userIntent: string, screenState: any, mode: string): any {
  const coordinates = screenState.coordinates || []
  const short = mode === 'silent'

  if (/blender/i.test(userIntent) && /mesh/i.test(userIntent)) {
    return {
      levelTitle: 'Add a Mesh in Blender',
      estimatedMinutes: 2,
      steps: [
        {
          id: 'open-add-menu',
          instruction: short ? 'Open Add.' : 'Start with the Add menu in the top-left.',
          targetLabel: 'Add menu',
          x: coordinates.find((item) => /add/i.test(item.label))?.x ?? 4,
          y: coordinates.find((item) => /add/i.test(item.label))?.y ?? 3,
          action: 'click'
        },
        {
          id: 'choose-mesh',
          instruction: short ? 'Choose Mesh.' : 'Now choose Mesh from that menu.',
          targetLabel: 'Mesh',
          x: coordinates.find((item) => /mesh/i.test(item.label))?.x ?? 6,
          y: coordinates.find((item) => /mesh/i.test(item.label))?.y ?? 14,
          action: 'click'
        },
        {
          id: 'choose-cube',
          instruction: short ? 'Select Cube.' : 'Pick Cube as your first simple mesh.',
          targetLabel: 'Cube',
          x: coordinates.find((item) => /cube/i.test(item.label))?.x ?? 10,
          y: coordinates.find((item) => /cube/i.test(item.label))?.y ?? 20,
          action: 'click'
        },
        {
          id: 'confirm-viewport',
          instruction: short ? 'Check viewport.' : 'Look in the viewport and confirm the cube appeared.',
          targetLabel: 'Viewport',
          x: 50,
          y: 50,
          action: 'wait',
          waitForMs: 800
        },
        {
          id: 'select-move-tool',
          instruction: short ? 'Select move.' : 'Select the move tool so you can position it.',
          targetLabel: 'Move tool',
          x: coordinates.find((item) => /move/i.test(item.label))?.x ?? 2,
          y: coordinates.find((item) => /move/i.test(item.label))?.y ?? 24,
          action: 'click'
        }
      ]
    }
  }

  const generatedSteps = coordinates.slice(0, 5).map((coordinate: any, index: number) => ({
    id: `step-${index + 1}`,
    instruction: short ? `Click ${coordinate.label}.` : `Next, click ${coordinate.label}.`,
    targetLabel: coordinate.label,
    x: coordinate.x,
    y: coordinate.y,
    action: 'click'
  }))

  return {
    levelTitle: userIntent || 'Specter Tutorial',
    estimatedMinutes: Math.max(1, Math.ceil(generatedSteps.length / 3)),
    steps:
      generatedSteps.length > 0
        ? generatedSteps
        : [
            {
              id: 'step-1',
              instruction: short ? 'Start here.' : 'Start with the main control on screen.',
              targetLabel: 'Main target',
              x: 50,
              y: 50,
              action: 'click'
            }
          ]
  }
}

export async function planSteps(userIntent: string, screenState: any, sessionHistory: any[], mode: string): Promise<any> {
  console.log('[PLANNER] Intent:', userIntent)
  console.log('[PLANNER] Screen app detected:', screenState?.app)

  const fallback = fallbackSequence(userIntent, screenState, mode)
  const client = anthropicClient()

  if (!client) {
    console.warn('[Specter] ANTHROPIC_API_KEY missing; using planner fallback.')
    return fallback
  }

  try {
    console.log('[PLANNER] Calling Claude...')
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(
            {
              userIntent,
              screenState,
              sessionHistory,
              mode,
              requiredShape: {
                steps: [
                  {
                    id: 'string',
                    instruction: 'string',
                    targetLabel: 'string',
                    x: 0,
                    y: 0,
                    action: 'click | type | scroll | wait',
                    typeText: 'optional string',
                    waitForMs: 'optional number'
                  }
                ],
                levelTitle: 'string',
                estimatedMinutes: 'number'
              }
            },
            null,
            2
          )
        }
      ]
    })

    const rawText = message.content
      .filter((part): part is { type: 'text'; text: string } =>
        part.type === 'text' && 'text' in part)
      .map((part) => (part as { type: 'text'; text: string }).text)
      .join('\n')

    console.log('[PLANNER] Raw response:', rawText)
    const steps = normalizeSequence(extractJson(rawText), fallback)
    return steps
  } catch (error) {
    console.error('[Specter] Failed to plan steps:', error)
    return fallback
  }
}

export async function converse(userMessage: string, screenState: any, conversationHistory: any[]): Promise<string> {
  const client = anthropicClient()
  if (!client) {
    return 'I can help with that once the Claude API key is configured. For now, keep following the cursor.'
  }

  try {
    const history = conversationHistory.slice(-8).map((msg) => ({
      role: msg.role,
      content: msg.content
    }))

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system:
        'You are a concise, encouraging software tutor answering a mid-session question. Use the screen state, keep the user moving, and return plain text only.',
      messages: [
        ...history,
        {
          role: 'user',
          content: JSON.stringify(
            {
              question: userMessage,
              screenState
            },
            null,
            2
          )
        }
      ]
    })

    const text = message.content
      .filter((part): part is { type: 'text'; text: string } =>
        part.type === 'text' && 'text' in part)
      .map((part) => (part as { type: 'text'; text: string }).text)
      .join('\n')
      .trim()

    return text || 'Yes. Keep going with the next highlighted step.'
  } catch (error) {
    console.error('[Specter] Failed to answer follow-up:', error)
    return 'I hit a temporary issue answering that. Keep going with the highlighted next step.'
  }
}
