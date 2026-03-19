type AnsiSegment = {
  text: string
  className: string
}

const ANSI_PATTERN = /\u001B\[([0-9;]*)m/g

function colorClass(code: number) {
  switch (code) {
    case 30:
      return 'text-black dark:text-zinc-950'
    case 31:
      return 'text-red-600 dark:text-red-400'
    case 32:
      return 'text-emerald-600 dark:text-emerald-400'
    case 33:
      return 'text-amber-600 dark:text-amber-300'
    case 34:
      return 'text-blue-600 dark:text-blue-400'
    case 35:
      return 'text-fuchsia-600 dark:text-fuchsia-400'
    case 36:
      return 'text-cyan-600 dark:text-cyan-400'
    case 37:
      return 'text-zinc-200 dark:text-zinc-100'
    case 90:
      return 'text-zinc-500 dark:text-zinc-400'
    case 91:
      return 'text-red-500 dark:text-red-300'
    case 92:
      return 'text-emerald-500 dark:text-emerald-300'
    case 93:
      return 'text-amber-500 dark:text-amber-200'
    case 94:
      return 'text-blue-500 dark:text-blue-300'
    case 95:
      return 'text-fuchsia-500 dark:text-fuchsia-300'
    case 96:
      return 'text-cyan-500 dark:text-cyan-300'
    case 97:
      return 'text-white'
    default:
      return ''
  }
}

export function ansiToSegments(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  const state = {
    color: '',
    bold: false,
    dim: false,
  }

  let cursor = 0

  function currentClassName() {
    return [state.color, state.bold ? 'font-semibold' : '', state.dim ? 'opacity-70' : '']
      .filter(Boolean)
      .join(' ')
  }

  for (const match of input.matchAll(ANSI_PATTERN)) {
    const index = match.index ?? 0

    if (index > cursor) {
      segments.push({
        text: input.slice(cursor, index),
        className: currentClassName(),
      })
    }

    const codes = match[1]
      .split(';')
      .filter(Boolean)
      .map((value) => Number.parseInt(value, 10))

    if (codes.length === 0) {
      state.color = ''
      state.bold = false
      state.dim = false
    }

    for (const code of codes) {
      if (code === 0) {
        state.color = ''
        state.bold = false
        state.dim = false
      } else if (code === 1) {
        state.bold = true
      } else if (code === 2) {
        state.dim = true
      } else if (code === 22) {
        state.bold = false
        state.dim = false
      } else if (code === 39) {
        state.color = ''
      } else {
        const nextColor = colorClass(code)
        if (nextColor) {
          state.color = nextColor
        }
      }
    }

    cursor = index + match[0].length
  }

  if (cursor < input.length) {
    segments.push({
      text: input.slice(cursor),
      className: currentClassName(),
    })
  }

  return segments
}
