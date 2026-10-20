/**
 * Returns only syntactically complete top-level JSON fields. This is intended
 * for live previews; callers must still strictly parse and validate the final
 * document before persisting domain data.
 */
export function completedTopLevelJsonFields(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let index = source.indexOf('{')
  if (index < 0) return result
  index += 1

  while (index < source.length) {
    index = skipWhitespaceAndCommas(source, index)
    if (source[index] === '}') break
    const keyToken = scanString(source, index)
    if (!keyToken) break
    let key: string
    try { key = JSON.parse(source.slice(index, keyToken.end)) as string } catch { break }
    index = skipWhitespace(source, keyToken.end)
    if (source[index] !== ':') break
    index = skipWhitespace(source, index + 1)
    const valueEnd = scanJsonValue(source, index)
    if (valueEnd === null) break
    try { result[key] = JSON.parse(source.slice(index, valueEnd)) as unknown } catch { break }
    index = valueEnd
  }
  return result
}

function skipWhitespace(source: string, start: number) {
  let index = start
  while (index < source.length && /\s/.test(source[index])) index += 1
  return index
}

function skipWhitespaceAndCommas(source: string, start: number) {
  let index = start
  while (index < source.length && (source[index] === ',' || /\s/.test(source[index]))) index += 1
  return index
}

function scanString(source: string, start: number): { end: number } | null {
  if (source[start] !== '"') return null
  let escaped = false
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (char === '"') return { end: index + 1 }
  }
  return null
}

function scanJsonValue(source: string, start: number): number | null {
  const first = source[start]
  if (first === '"') return scanString(source, start)?.end ?? null
  if (first === '{' || first === '[') {
    const stack = [first]
    let inString = false
    let escaped = false
    for (let index = start + 1; index < source.length; index += 1) {
      const char = source[index]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') { inString = true; continue }
      if (char === '{' || char === '[') stack.push(char)
      else if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '['
        if (stack.pop() !== expected) return null
        if (stack.length === 0) return index + 1
      }
    }
    return null
  }
  const match = source.slice(start).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,}])/)
  return match ? start + match[0].length : null
}
