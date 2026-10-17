/**
 * dsh-pending-review-glow — browser half.
 *
 * CLASSIC SCRIPT: registers a lazy factory with the page module loader (id must
 * equal the package name). The factory returns the Cordis plugin.
 *
 * Three row states, one visual language (inset ring + tinted fill), differing in
 * colour and motion:
 *
 *   pending  (red)    breathing   an approval is waiting for you
 *   running  (yellow) steady      the agent is working
 *   finished (green)  breathing   a run just ended, nothing to approve, and the
 *                                 row has not been opened since it ended
 *
 * "Opened since it ended" is tracked in localStorage by the row's own
 * pointerdown, so clicking the row clears the green for good (until the next
 * run finishes).
 */
window.__ModuleLoader__.load({
  id: 'dsh-pending-review-glow',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const ROUTE = '/pending-review-glow/state'
    /** Fast while the page is visible; slow in the background. */
    const POLL_VISIBLE_MS = 400
    const POLL_HIDDEN_MS = 3000
    const REASSERT_MS = 2000
    const ATTR = 'data-dsh-session-state'
    const ACK_KEY = 'dsh-pending-review-glow:ack'
    const SLOT = 'sidebar.workspaces.session.row.action'
    const SLOT_ID = 'pending-review-glow'

    const zh = (function () {
      try {
        return String((navigator && navigator.language) || '').toLowerCase().indexOf('zh') === 0
      } catch (error) {
        return false
      }
    })()
    const LABEL = {
      pending: zh ? '待审核' : 'Pending review',
      running: zh ? '运行中' : 'Running',
      finished: zh ? '已完成' : 'Finished',
    }
    const DOT_COLOR = {
      pending: 'var(--dsw-alias-state-danger, #f43f5e)',
      running: 'var(--dsw-alias-state-warning, #f59e0b)',
      finished: 'var(--dsw-alias-state-success, #22c55e)',
    }

    const CSS =
      '@keyframes dsh-prg-red{0%,100%{box-shadow:inset 0 0 0 1px rgba(244,63,94,.35);background-color:rgba(244,63,94,.06)}50%{box-shadow:inset 0 0 0 2px rgba(244,63,94,.95),0 0 12px rgba(244,63,94,.35);background-color:rgba(244,63,94,.18)}}' +
      '@keyframes dsh-prg-green{0%,100%{box-shadow:inset 0 0 0 1px rgba(34,197,94,.30);background-color:rgba(34,197,94,.05)}50%{box-shadow:inset 0 0 0 2px rgba(34,197,94,.90),0 0 12px rgba(34,197,94,.30);background-color:rgba(34,197,94,.16)}}' +
      '@keyframes dsh-prg-dot{0%,100%{opacity:.45}50%{opacity:1}}' +
      '[' + ATTR + '="pending"]{border-radius:8px;animation:dsh-prg-red 1.5s ease-in-out infinite!important}' +
      '[' + ATTR + '="running"]{border-radius:8px;box-shadow:inset 0 0 0 2px rgba(245,158,11,.85)!important;background-color:rgba(245,158,11,.14)!important}' +
      '[' + ATTR + '="finished"]{border-radius:8px;animation:dsh-prg-green 1.5s ease-in-out infinite!important}' +
      '@media (prefers-reduced-motion:reduce){' +
      '[' + ATTR + '="pending"]{animation:none!important;box-shadow:inset 0 0 0 2px rgba(244,63,94,.9)!important;background-color:rgba(244,63,94,.12)!important}' +
      '[' + ATTR + '="finished"]{animation:none!important;box-shadow:inset 0 0 0 2px rgba(34,197,94,.85)!important;background-color:rgba(34,197,94,.12)!important}' +
      '}'

    const state = { pending: new Set(), running: new Set(), finished: new Map(), revision: -1 }
    const listeners = new Set()

    function readAck() {
      const map = new Map()
      try {
        const raw = window.localStorage.getItem(ACK_KEY)
        const parsed = raw ? JSON.parse(raw) : null
        if (parsed && typeof parsed === 'object') {
          Object.keys(parsed).forEach(function (key) {
            const value = parsed[key]
            if (typeof value === 'number') map.set(key, value)
          })
        }
      } catch (error) {
        /* storage unavailable: session-only behaviour */
      }
      return map
    }

    const ack = readAck()

    function ackSession(sessionId) {
      if (typeof sessionId !== 'string') return
      const now = Date.now()
      const previous = ack.get(sessionId) || 0
      // Idempotent: repeated calls (paint ticks, double clicks) stay quiet.
      if (now - previous < 1000) return
      ack.set(sessionId, now)
      try {
        const flat = {}
        ack.forEach(function (value, key) {
          flat[key] = value
        })
        window.localStorage.setItem(ACK_KEY, JSON.stringify(flat))
      } catch (error) {
        /* ignore */
      }
      // Re-render the subscribers so a row that just became "seen" drops the
      // green immediately instead of waiting for the next poll.
      notify()
    }

    function notify() {
      listeners.forEach(function (listener) {
        try {
          listener()
        } catch (error) {
          /* one bad subscriber must not stop the rest */
        }
      })
    }

    function setOf(value) {
      const out = new Set()
      if (Array.isArray(value)) {
        value.forEach(function (item) {
          const id = typeof item === 'string' ? item : item && item.sessionId
          if (typeof id === 'string' && id.length > 0) out.add(id)
        })
      }
      return out
    }

    function apply(payload) {
      if (!payload || typeof payload !== 'object') return
      if (typeof payload.revision === 'number' && payload.revision === state.revision) return
      if (typeof payload.revision === 'number') state.revision = payload.revision
      state.pending = setOf(payload.pending)
      state.running = setOf(payload.running)
      const finished = new Map()
      if (Array.isArray(payload.finished)) {
        payload.finished.forEach(function (item) {
          if (item && typeof item.sessionId === 'string' && typeof item.at === 'number') {
            finished.set(item.sessionId, item.at)
          }
        })
      }
      state.finished = finished
      notify()
    }

    function nextDelay() {
      try {
        return document.hidden ? POLL_HIDDEN_MS : POLL_VISIBLE_MS
      } catch (error) {
        return POLL_VISIBLE_MS
      }
    }

    function startPolling() {
      let stopped = false
      let timer
      let inFlight = false
      const tick = function () {
        if (stopped || inFlight) return
        inFlight = true
        let request
        try {
          request = fetch(ROUTE, { headers: { accept: 'application/json' }, cache: 'no-store' })
        } catch (error) {
          request = undefined
        }
        if (!request) {
          inFlight = false
          timer = setTimeout(tick, nextDelay())
          return
        }
        request
          .then(function (response) {
            return response && response.ok ? response.json() : undefined
          })
          .then(function (payload) {
            if (!stopped && payload !== undefined) apply(payload)
          })
          .catch(function () {
            /* transient: keep the previous set and retry */
          })
          .then(function () {
            inFlight = false
            if (!stopped) timer = setTimeout(tick, nextDelay())
          })
      }

      const onVisible = function () {
        try {
          if (!document.hidden) {
            if (timer !== undefined) clearTimeout(timer)
            tick()
          }
        } catch (error) {
          /* ignore */
        }
      }
      try {
        document.addEventListener('visibilitychange', onVisible)
      } catch (error) {
        /* ignore */
      }

      tick()
      return function () {
        stopped = true
        if (timer !== undefined) clearTimeout(timer)
        try {
          document.removeEventListener('visibilitychange', onVisible)
        } catch (error) {
          /* ignore */
        }
      }
    }

    /** Raw state of one session, ignoring DOM selection. */
    function stateOf(sessionId) {
      if (state.pending.has(sessionId)) return 'pending'
      if (state.running.has(sessionId)) return 'running'
      const at = state.finished.get(sessionId)
      if (at === undefined) return 'idle'
      const ackedAt = ack.get(sessionId) || 0
      return ackedAt >= at ? 'idle' : 'finished'
    }

    function useSessionState(sessionId) {
      const pair = React.useState(0)
      const force = pair[1]
      React.useEffect(
        function () {
          const listener = function () {
            force(function (value) {
              return value + 1
            })
          }
          listeners.add(listener)
          return function () {
            listeners.delete(listener)
          }
        },
        [sessionId],
      )
      return stateOf(sessionId)
    }

    function rowOf(node) {
      let element = node
      for (let depth = 0; depth < 10; depth += 1) {
        const parent = element && element.parentElement
        if (!parent) return undefined
        element = parent
        let rect
        try {
          rect = element.getBoundingClientRect()
        } catch (error) {
          return undefined
        }
        if (rect.height >= 20 && rect.height <= 72 && rect.width >= 100) return element
      }
      return undefined
    }

    /** High-confidence "this row is the open one" signals only. */
    function isSelectedRow(row) {
      try {
        if (!row || !row.getAttribute) return false
        if (row.getAttribute('aria-selected') === 'true') return true
        const current = row.getAttribute('aria-current')
        if (current === 'true' || current === 'page') return true
        const className = row.getAttribute('class') || ''
        return /(^|[\s_-])(active|selected)([\s_-]|$)/.test(className)
      } catch (error) {
        return false
      }
    }

    function RowProbe(props) {
      const sessionId = props && props.sessionId
      const kind = useSessionState(sessionId)
      const probe = React.useRef(null)

      React.useEffect(
        function () {
          const node = probe.current
          if (!node) return undefined
          let row = rowOf(node)
          const real = kind === 'idle' ? undefined : kind

          // Watching a Session finish counts as having seen it: acknowledge at
          // the moment the run ends while its row is the open one, so switching
          // to another row later does not resurrect the green.
          if (real === 'finished' && row && isSelectedRow(row)) ackSession(sessionId)

          const paint = function () {
            const current = rowOf(node)
            if (current && current !== row) row = current
            if (!row) return
            if (real === 'finished' && isSelectedRow(row)) ackSession(sessionId)
            try {
              if (real === undefined || isSelectedRow(row)) row.removeAttribute(ATTR)
              else row.setAttribute(ATTR, real)
            } catch (error) {
              /* detached */
            }
          }

          const onOpen = function () {
            ackSession(sessionId)
            paint()
          }

          if (row) {
            try {
              row.addEventListener('pointerdown', onOpen, true)
            } catch (error) {
              /* ignore */
            }
          }
          paint()
          const timer = setInterval(paint, REASSERT_MS)

          return function () {
            clearInterval(timer)
            if (row) {
              try {
                row.removeEventListener('pointerdown', onOpen, true)
                row.removeAttribute(ATTR)
              } catch (error) {
                /* detached */
              }
            }
          }
        },
        [kind, sessionId],
      )

      if (kind === 'idle') {
        return h('span', { ref: probe, 'aria-hidden': 'true', style: { display: 'none' } })
      }

      return h('span', { ref: probe, style: { display: 'inline-flex', alignItems: 'center' } }, [
        h('style', { key: 'style' }, CSS),
        h('span', {
          key: 'dot',
          title: LABEL[kind],
          'aria-label': LABEL[kind],
          role: 'img',
          style: {
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: DOT_COLOR[kind],
            animation: kind === 'running' ? 'none' : 'dsh-prg-dot 1.5s ease-in-out infinite',
          },
        }),
      ])
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(function () {
          return startPolling()
        }, 'pending-review-glow: state polling')

        ctx.slots.inject(SLOT, function () {
          return ctx.slots.register({ name: SLOT, id: SLOT_ID, order: 50 }, RowProbe)
        })
      },
    }
  },
})
