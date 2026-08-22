/**
 * Scroll offsets of the projected document.
 *
 * The offsets used to be published as custom properties on the editor root.
 * Custom properties inherit, so every scroll frame restyled every line and
 * token of a large projection although only a few small layers (the caret
 * layer, popups, selection overlays) consume them. The offsets are now
 * written on elements that opt in with the `shikitor-follows-scroll` class,
 * and the full line projection is moved with a transform on its `<pre>`
 * instead of a scroll position. Renderers that keep a small DOM (less-DOM,
 * viewport-virtual, serialized HTML) still receive the variables on the root
 * so existing stylesheets keep working there.
 */

export const SCROLL_FOLLOWER_CLASS = 'shikitor-follows-scroll'

interface ProjectionScroll {
  left: number
  top: number
}

const states = new WeakMap<HTMLElement, ProjectionScroll>()
const applied = new WeakMap<HTMLElement, ProjectionScroll>()

export function getProjectionScroll(target: HTMLElement): ProjectionScroll {
  return states.get(target) ?? { left: 0, top: 0 }
}

function writeOffsets(element: HTMLElement, scroll: ProjectionScroll) {
  const previous = applied.get(element)
  if (previous?.top === scroll.top && previous?.left === scroll.left) return
  applied.set(element, { left: scroll.left, top: scroll.top })
  element.style.setProperty('--shikitor-scroll-t', `${scroll.top}px`)
  element.style.setProperty('--shikitor-scroll-l', `${scroll.left}px`)
  element.style.setProperty('--shikitor-offset-x', `${-scroll.left}px`)
  element.style.setProperty('--shikitor-offset-y', `${-scroll.top}px`)
}

/** Give a new follower (for example a popup) the current offsets. */
export function applyProjectionScrollTo(target: HTMLElement, element: HTMLElement) {
  element.classList.add(SCROLL_FOLLOWER_CLASS)
  writeOffsets(element, getProjectionScroll(target))
}

/**
 * Publish the projected document's scroll offsets and move the projection.
 * Partial updates keep the other axis.
 */
export function setProjectionScroll(
  target: HTMLElement,
  output: HTMLElement,
  next: Partial<ProjectionScroll>
) {
  const current = getProjectionScroll(target)
  const scroll = {
    left: next.left ?? current.left,
    top: next.top ?? current.top
  }
  states.set(target, scroll)
  const followers = target.getElementsByClassName(SCROLL_FOLLOWER_CLASS)
  for (let index = 0; index < followers.length; index++) {
    writeOffsets(followers[index] as HTMLElement, scroll)
  }
  if (output.dataset.renderKind === 'tokens-full') {
    const pre = output.firstElementChild as HTMLElement | null
    if (pre) {
      const transform = scroll.left || scroll.top
        ? `translate(${-scroll.left}px, ${-scroll.top}px)`
        : ''
      if (pre.style.transform !== transform) pre.style.transform = transform
    }
    if (output.scrollTop) output.scrollTop = 0
    if (output.scrollLeft) output.scrollLeft = 0
    return
  }
  // Small projections keep the root variables for compatibility (less-DOM
  // paints the current line from a root pseudo-element, for instance).
  writeOffsets(target, scroll)
  output.scrollTop = scroll.top
  output.scrollLeft = scroll.left
}

/**
 * Horizontal offset owned by a visual projection (folded or replaced rows
 * can be wider than the textarea's own scroll range). Stored as a data
 * attribute: attribute changes on the root do not restyle its descendants.
 */
export function setVisualScrollLeft(target: HTMLElement, value: number | undefined) {
  if (value === undefined) {
    if (target.hasAttribute('data-shikitor-visual-scroll-l')) {
      target.removeAttribute('data-shikitor-visual-scroll-l')
    }
    return
  }
  const next = String(value)
  if (target.getAttribute('data-shikitor-visual-scroll-l') !== next) {
    target.setAttribute('data-shikitor-visual-scroll-l', next)
  }
}

export function readVisualScrollLeft(target: HTMLElement): number | undefined {
  const value = target.getAttribute('data-shikitor-visual-scroll-l')
  if (value === null) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
