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
      model: 'claude-3-5-sonnet-20241022',
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

    const textParts = message.content
      .filter((part): part is { type: 'text'; text: string } =>
        part.type === 'text' && 'text' in part)
      .map((part) => (part as { type: 'text'; text: string }).text)
      .join('\n')

    if (textParts) {
      console.log('[SCREENER] Raw response:', textParts)
      const cleanJson = textParts.replace(/```json/g, '').replace(/```/g, '').trim()
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/)
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
