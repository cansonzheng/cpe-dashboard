export function extractVerificationCode(content) {
  if (typeof content !== 'string' || !content.includes('验证码')) return ''
  const text = content.replace(/【[^】]*】/g, '')
  const keyword = text.indexOf('验证码')
  const candidates = [...text.matchAll(/(?<!\d)\d{4,8}(?!\d)/g)]
  candidates.sort((a, b) => {
    const distance = (match) => match.index >= keyword
      ? match.index - keyword - 3
      : keyword - match.index - match[0].length
    return distance(a) - distance(b) || b.index - a.index
  })
  return candidates[0]?.[0] || ''
}

export function getVerificationMessages(messages) {
  return messages.flatMap((message) => {
    if (message.read !== false) return []
    const code = extractVerificationCode(message.content)
    if (!code) return []
    return [{
      id: message.id,
      code,
      name: message.content.match(/【([^】]+)】/)?.[1]?.trim() || message.sender,
    }]
  })
}
