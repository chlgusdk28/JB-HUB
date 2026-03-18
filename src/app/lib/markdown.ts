function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function toSafeLink(href: string) {
  const trimmed = href.trim()
  const normalized = trimmed.toLowerCase()
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('mailto:')) {
    return escapeHtmlAttribute(trimmed)
  }

  return '#'
}

function renderInlineMarkdown(value: string) {
  let output = escapeHtml(value)
  output = output.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_full, text: string, href: string) =>
      `<a href="${toSafeLink(href)}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`,
  )
  output = output.replace(/`([^`]+)`/g, '<code>$1</code>')
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  output = output.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return output
}

export function renderMarkdownHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let inCodeBlock = false
  let inUnorderedList = false
  let inOrderedList = false
  let paragraphLines: string[] = []
  let blockquoteLines: string[] = []

  const closeLists = () => {
    if (inUnorderedList) {
      html.push('</ul>')
      inUnorderedList = false
    }
    if (inOrderedList) {
      html.push('</ol>')
      inOrderedList = false
    }
  }

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return
    }

    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(' '))}</p>`)
    paragraphLines = []
  }

  const flushBlockquote = () => {
    if (blockquoteLines.length === 0) {
      return
    }

    const content = blockquoteLines.map((line) => `<p>${renderInlineMarkdown(line)}</p>`).join('')
    html.push(`<blockquote>${content}</blockquote>`)
    blockquoteLines = []
  }

  const flushTextBlocks = () => {
    flushParagraph()
    flushBlockquote()
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushTextBlocks()
      closeLists()
      if (inCodeBlock) {
        html.push('</code></pre>')
      } else {
        html.push('<pre><code>')
      }
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      html.push(`${escapeHtml(line)}\n`)
      continue
    }

    if (!trimmed) {
      flushTextBlocks()
      closeLists()
      continue
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushTextBlocks()
      closeLists()
      html.push('<hr />')
      continue
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (headingMatch) {
      flushTextBlocks()
      closeLists()
      const level = headingMatch[1].length
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`)
      continue
    }

    const blockquoteMatch = /^>\s?(.*)$/.exec(trimmed)
    if (blockquoteMatch) {
      flushParagraph()
      closeLists()
      blockquoteLines.push(blockquoteMatch[1])
      continue
    }

    const orderedMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed)
    if (orderedMatch) {
      flushTextBlocks()
      if (inUnorderedList) {
        html.push('</ul>')
        inUnorderedList = false
      }
      if (!inOrderedList) {
        html.push('<ol>')
        inOrderedList = true
      }
      html.push(`<li>${renderInlineMarkdown(orderedMatch[2])}</li>`)
      continue
    }

    const unorderedMatch = /^[-*]\s+(.+)$/.exec(trimmed)
    if (unorderedMatch) {
      flushTextBlocks()
      if (inOrderedList) {
        html.push('</ol>')
        inOrderedList = false
      }
      if (!inUnorderedList) {
        html.push('<ul>')
        inUnorderedList = true
      }
      html.push(`<li>${renderInlineMarkdown(unorderedMatch[1])}</li>`)
      continue
    }

    flushBlockquote()
    closeLists()
    paragraphLines.push(trimmed)
  }

  if (inCodeBlock) {
    html.push('</code></pre>')
  }

  flushTextBlocks()
  closeLists()
  return html.join('')
}
