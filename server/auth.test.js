import test from 'node:test'
import assert from 'node:assert/strict'
import { createPasswordAuth } from './auth.js'

function createContext() {
  const values = new Map()
  const options = new Map()
  return {
    values,
    options,
    ctx: {
      cookies: {
        get(name) {
          return values.get(name)
        },
        set(name, value, cookieOptions) {
          values.set(name, value)
          options.set(name, cookieOptions)
        },
      },
      throw(status, message) {
        const error = new Error(message)
        error.status = status
        throw error
      },
    },
  }
}

test('password auth creates a persistent HttpOnly session', () => {
  const auth = createPasswordAuth({ password: 'correct-password', maxAgeDays: 365 })
  const { ctx, options } = createContext()

  assert.equal(auth.verify('wrong-password'), false)
  assert.equal(auth.verify('correct-password'), true)
  assert.equal(auth.isAuthenticated(ctx), false)

  auth.setSession(ctx)
  assert.equal(auth.isAuthenticated(ctx), true)
  assert.equal(options.get('cpe_dashboard_auth').httpOnly, true)
  assert.equal(options.get('cpe_dashboard_auth').sameSite, 'strict')
  assert.equal(options.get('cpe_dashboard_auth').maxAge, 365 * 24 * 60 * 60 * 1000)
})

test('password auth can clear a session', () => {
  const auth = createPasswordAuth({ password: 'correct-password' })
  const { ctx } = createContext()
  auth.setSession(ctx)
  auth.clearSession(ctx)
  assert.equal(auth.isAuthenticated(ctx), false)
})
