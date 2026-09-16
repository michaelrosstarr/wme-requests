import { PostHog } from 'posthog-node'

let posthogClient: PostHog | null = null

export function getPostHogClient() {
  const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN
  const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

  if (!apiKey || !apiHost) {
    if (import.meta.env.DEV) {
      const missing = !apiKey ? 'VITE_PUBLIC_POSTHOG_PROJECT_TOKEN' : 'VITE_PUBLIC_POSTHOG_HOST'
      throw new Error(
        `${missing} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missing} is configured`,
      )
    }
    return null
  }

  if (!posthogClient) {
    posthogClient = new PostHog(apiKey, {
      host: apiHost,
      flushAt: 1,
      flushInterval: 0,
      enableExceptionAutocapture: true,
    })
  }
  return posthogClient
}

function requestContext(request: Request) {
  return {
    distinctId: request.headers.get('X-PostHog-Distinct-Id'),
    sessionId: request.headers.get('X-PostHog-Session-Id'),
  }
}

export async function captureServerEvent(
  request: Request,
  event: string,
  properties: Record<string, unknown>,
  fallbackDistinctId?: string,
) {
  const posthog = getPostHogClient()
  if (!posthog) return

  const context = requestContext(request)
  const distinctId = context.distinctId || fallbackDistinctId
  if (!distinctId) return

  try {
    posthog.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        $session_id: context.sessionId || undefined,
        source: 'api',
      },
    })
    await posthog.flush()
  } catch (error) {
    console.error('Failed to send PostHog event', error)
  }
}

export async function captureServerException(error: unknown, request: Request, fallbackDistinctId?: string) {
  const posthog = getPostHogClient()
  if (!posthog) return

  const context = requestContext(request)
  try {
    posthog.captureException(error, context.distinctId || fallbackDistinctId, {
      $session_id: context.sessionId || undefined,
      source: 'api',
    })
    await posthog.flush()
  } catch (captureError) {
    console.error('Failed to send PostHog exception', captureError)
  }
}
