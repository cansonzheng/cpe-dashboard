import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSms, sortSmsNewestFirst } from './cpe-client.js'

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
