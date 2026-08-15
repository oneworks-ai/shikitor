import type { InlineReplacement } from '@shikitor/core'

const linkClass = 'messenger-skill-link'
const markdownLinkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g

export interface MessengerSkillReference {
  href: string
  icon: string
  title: string
}

export function getMessengerSkillMarkdown(reference: MessengerSkillReference) {
  return `[${reference.title}](${reference.href})`
}

function getSkillLinkMatches(
  value: string,
  references: Readonly<Record<string, MessengerSkillReference>>
) {
  return Array.from(value.matchAll(markdownLinkPattern)).flatMap(match => {
    const [source, title, href] = match
    const reference = Object.values(references).find(item => (
      item.title === title && item.href === href
    ))
    if (!reference || match.index === undefined) return []
    return [{
      href,
      icon: reference.icon,
      sourceEnd: match.index + source.length,
      sourceStart: match.index,
      title
    }]
  })
}

export function getMessengerSkillInlineReplacements(
  value: string,
  references: Readonly<Record<string, MessengerSkillReference>>
): InlineReplacement[] {
  return getSkillLinkMatches(value, references).map(match => ({
    start: match.sourceStart,
    end: match.sourceEnd,
    inlineSize: `calc(1em + ${match.title.length}ch)`,
    blockSize: '1em',
    interaction: 'atomic',
    properties: {
      class: `${linkClass} ${linkClass}--atomic`,
      'data-skill-href': match.href,
      'data-skill-icon': match.icon,
      'data-skill-title': match.title
    }
  }))
}
