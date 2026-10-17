/**
 * dsh-pending-review-glow — Host half.
 *
 * Tracks three per-Session facts and serves them over one read-only route:
 *
 *  - pending : an approval is open (audit `approval/asked` .. `approval/decided`,
 *              cross-checked on the `approval/request` waterfall via prepend)
 *  - running : the agent is working (`api-session/status` emit, sessionId+running)
 *  - finished: when a Session last went running -> idle (`api-session/status`)
 *
 * All sources are EMIT events, so no listener ordering can hide a transition.
 * The approval waterfall listener is delegated with `next()` and returns the
 * outcome unchanged: this plugin never claims, vetoes or retimes an ask.
 *
 * Zero imports: nothing can fail to resolve at activation.
 */

export const name = 'pending-review-glow'

export const inject = ['webServer']

const ROUTE_PREFIX = '/pending-review-glow'
const ROUTE_STATE = '/pending-review-glow/state'

const ASKED = 'approval/asked'
const DECIDED = 'approval/decided'

/** Keep the finished table from growing without bound. */
const FINISHED_LIMIT = 200

function stringOf(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function toolOf(data) {
  if (!data || typeof data !== 'object') return undefined
  return stringOf(data.tool) || stringOf(data.toolName) || stringOf(data.name) || undefined
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  /** Session id -> open audit asks and the first tool name. */
  const asks = new Map()
  /** Session id -> live request seen on the approval waterfall. */
  const live = new Map()
  /** Session ids whose agent is currently working. */
  const running = new Set()
  /** Session id -> ms timestamp of the last running -> idle transition. */
  const finished = new Map()

  let revision = 0
  let seen = 0
  let askedTotal = 0
  let decidedTotal = 0
  /** Ring of the most recent approval-related events, for diagnosis. */
  const recent = []

  const note = (type, sessionId) => {
    recent.push({ type, sessionId, at: Date.now() })
    if (recent.length > 10) recent.shift()
  }

  const touch = () => {
    revision += 1
  }

  const snapshot = () => {
    // Only genuine approval sources belong here. A running Session is NOT
    // pending: it is reported separately in `running`, and mixing the two made
    // every working row paint red (red outranks yellow).
    const ids = new Set()
    asks.forEach((_entry, id) => ids.add(id))
    live.forEach((_entry, id) => ids.add(id))

    const pending = []
    ids.forEach((sessionId) => {
      const audit = asks.get(sessionId)
      const direct = live.get(sessionId)
      pending.push({
        sessionId,
        count: audit ? audit.count : 0,
        tool: (audit && audit.tool) || (direct && direct.tool) || undefined,
        since: (audit && audit.since) || (direct && direct.since) || Date.now(),
      })
    })

    const finishedList = []
    finished.forEach((at, sessionId) => finishedList.push({ sessionId, at }))

    return {
      revision,
      seen,
      asks: askedTotal,
      count: pending.length,
      pending,
      running: Array.from(running),
      finished: finishedList,
      decided: decidedTotal,
      recent,
    }
  }

  // ------------------------------------------------- pending (audit source)
  ctx.on('session/event', (session, event) => {
    try {
      const type = event && event.type
      if (type !== ASKED && type !== DECIDED && type !== 'turn/end') return
      const sessionId = session && session.id
      if (typeof sessionId !== 'string' || sessionId.length === 0) return

      // A request is turn-enclosed, so a turn that ended cannot still be
      // waiting on an approval: any leftover count here is stale.
      if (type === 'turn/end') {
        note(type, sessionId)
        let dirty = false
        if (asks.delete(sessionId)) dirty = true
        if (live.delete(sessionId)) dirty = true
        if (dirty) touch()
        return
      }

      if (type === ASKED) {
        askedTotal += 1
        note(type, sessionId)
        const current = asks.get(sessionId)
        asks.set(sessionId, {
          count: (current ? current.count : 0) + 1,
          tool: (current && current.tool) || toolOf(event.data),
          since: (current && current.since) || Date.now(),
        })
        touch()
        return
      }

      decidedTotal += 1
      note(type, sessionId)
      const current = asks.get(sessionId)
      if (!current) return
      if (current.count <= 1) asks.delete(sessionId)
      else asks.set(sessionId, { count: current.count - 1, tool: current.tool, since: current.since })
      touch()
    } catch {
      /* an unexpected payload must never break the feed */
    }
  })

  // --------------------------------------------------------- running / done
  ctx.on('api-session/status', (sessionId, isRunning) => {
    try {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      if (isRunning === true) {
        running.add(sessionId)
        finished.delete(sessionId)
        touch()
        return
      }
      if (running.delete(sessionId)) {
        finished.set(sessionId, Date.now())
        if (finished.size > FINISHED_LIMIT) {
          const oldest = finished.keys().next()
          if (!oldest.done) finished.delete(oldest.value)
        }
        touch()
      }
    } catch {
      /* ignore */
    }
  })

  ctx.on('api-session/removed', (sessionId) => {
    try {
      if (typeof sessionId !== 'string') return
      let dirty = false
      if (asks.delete(sessionId)) dirty = true
      if (live.delete(sessionId)) dirty = true
      if (running.delete(sessionId)) dirty = true
      if (finished.delete(sessionId)) dirty = true
      if (dirty) touch()
    } catch {
      /* ignore */
    }
  })

  // -------------------------------------------- approval waterfall (prepend)
  ctx.on(
    'approval/request',
    async (request, next) => {
      let key
      try {
        const agent = request && request.agent
        const id = agent && agent.id
        if (typeof id === 'string' && id.length > 0) {
          seen += 1
          key = id
          live.set(id, { tool: stringOf(request.toolName), since: Date.now() })
          touch()
        }
      } catch {
        key = undefined
      }
      try {
        return await next()
      } finally {
        if (key !== undefined) {
          live.delete(key)
          touch()
        }
      }
    },
    true,
  )

  // ------------------------------------------------------------------- route
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: (request, response) => {
          let status = 200
          let body = '{}'
          try {
            const pathname = new URL(request.url || '/', 'http://dsh.internal').pathname
            if (pathname !== ROUTE_STATE) {
              status = 404
              body = 'not found'
            } else if (request.method !== 'GET' && request.method !== 'HEAD') {
              status = 405
              body = ''
            } else {
              body = JSON.stringify(snapshot())
            }
          } catch {
            status = 500
            body = ''
          }
          try {
            response.writeHead(status, {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
            })
            response.end(request.method === 'HEAD' ? undefined : body)
          } catch {
            /* client gone */
          }
        },
      }),
    'pending-review-glow: state route',
  )
}
