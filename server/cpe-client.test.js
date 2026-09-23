import test from 'node:test'
import assert from 'node:assert/strict'
import { CpeClient, parseSms, sortSmsNewestFirst } from './cpe-client.js'

test('parseSms decodes the CPE Base64 record format', () => {
  const raw = '312 0 10000 2026/09/23 09:16:48 测试短信内容'
  const message = parseSms(Buffer.from(raw).toString('base64'))

  assert.deepEqual(message, {
    id: '312',
    read: false,
    sender: '10000',
    receivedAt: '2026/09/23 09:16:48',
    content: '测试短信内容',
  })
})

test('parseSms preserves malformed records for diagnostics', () => {
  const message = parseSms(Buffer.from('bad data').toString('base64'))
  assert.deepEqual(message, { raw: 'bad data', malformed: true })
})

test('sortSmsNewestFirst puts the latest message first', () => {
  const messages = [
    { id: '310', receivedAt: '2026/09/19 17:05:55' },
    { id: '312', receivedAt: '2026/09/23 09:16:48' },
    { id: '311', receivedAt: '2026/09/23 09:14:58' },
  ]

  assert.deepEqual(
    sortSmsNewestFirst(messages).map((message) => message.id),
    ['312', '311', '310'],
  )
})

test('SMS mutations use the original device command payloads', async () => {
  const client = Object.create(CpeClient.prototype)
  const payloads = []
  client.authenticatedRequest = async (payload) => {
    payloads.push(payload)
    return { success: true, message: '0' }
  }

  await client.markSmsRead('312')
  await client.markAllSmsRead()
  await client.deleteSms(['311', '312'])
  await client.clearInbox()

  assert.deepEqual(payloads, [
    { cmd: 12, index: '312', method: 'POST' },
    { cmd: 12, index: 'READ ALL', method: 'POST' },
    { cmd: 14, index: '311,312', subcmd: 0, method: 'POST' },
    { cmd: 14, index: 'DELETE ALL', subcmd: 0, method: 'POST' },
  ])
})
