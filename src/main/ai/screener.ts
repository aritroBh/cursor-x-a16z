import Anthropic from '@anthropic-ai/sdk'

function anthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return null
  }
  return new Anthropic({ apiKey: key })
}

export async function analyzeScreen(base64PNG: string): Promise<any> {
  console.log('[SCREENER] Got base64, length:', base64PNG?.length)
  const anthropic = anthropicClient()

  if (!anthropic) {
    console.warn('[Specter] ANTHROPIC_API_KEY missing; skipping screen analysis.')
    return null
  }

  try {
    console.log('[SCREENER] Calling Claude Vision...')
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system:
        'You are a UI state analyzer. Given a screenshot, return ONLY valid JSON matching the ScreenState schema. Identify clickable elements and their approximate screen coordinates as percentages (0-100) of screen width/height.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64PNG
              }
            },
            {
              type: 'text',
              text: 'Analyze this screenshot and return the UI state as JSON.'
            }
          ]
        }
      ]
    })

    const content = message.content[0]
    if (content.type === 'text') {
      console.log('[SCREENER] Raw response:', content.text)
      const jsonMatch = content.text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        console.log('[SCREENER] Parsed state:', JSON.stringify(parsed))
        return parsed
      }
    }
    return null
  } catch (error) {
    console.error('[SCREENER] Error:', error)
    return null
  }
}
