import '../gutter-decorations.scss'

export type GutterDecorationPosition = 'left' | 'right'

export function insertGutterDecorationSlot(
  number: HTMLElement,
  position: GutterDecorationPosition
) {
  const slot = document.createElement('span')
  slot.className = `shikitor-gutter-decoration-slot shikitor-gutter-decoration-slot--${position}`
  slot.dataset.position = position
  if (position === 'left') number.before(slot)
  else number.after(slot)
  return slot
}
