import assert from 'node:assert/strict'
import test from 'node:test'
import { extractVerificationCode, getVerificationMessages } from './verification-code.js'

test('extracts codes near the keyword and preserves leading zeroes', () => {
  assert.equal(extractVerificationCode('【服务】您的验证码为：012345，5分钟内有效。'), '012345')
  assert.equal(extractVerificationCode('【服务】654321是您的验证码，请勿泄露。'), '654321')
  assert.equal(extractVerificationCode('订单12345678，验证码：4321。'), '4321')
  assert.equal(extractVerificationCode('【服务2026】验证码：12345678'), '12345678')
})

test('ignores ordinary messages, missing codes, and numbers embedded in phone numbers', () => {
  for (const content of [undefined, '', '您的余额为1234元', '验证码已过期', '验证码请咨询13800138000']) {
    assert.equal(extractVerificationCode(content), '')
  }
})

test('lists matching messages with bracket names or the sender as fallback', () => {
  assert.deepEqual(getVerificationMessages([
    { id: '1', sender: '10001', content: '【 示例服务 】验证码为012345' },
    { id: '2', sender: '106123', content: '验证码：9876' },
    { id: '3', sender: '10000', content: '本月使用1234MB' },
  ]), [
    { id: '1', name: '示例服务', code: '012345' },
    { id: '2', name: '106123', code: '9876' },
  ])
  assert.deepEqual(getVerificationMessages([]), [])
})
