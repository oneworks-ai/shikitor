const cursorLayers = new WeakMap<HTMLElement, HTMLElement>()

function cursorLayer(target: HTMLElement) {
  const cached = cursorLayers.get(target)
  if (cached?.isConnected) return cached
  const layer = target.querySelector<HTMLElement>('.shikitor-cursors')
  if (layer) cursorLayers.set(target, layer)
  return layer
}

/**
 * Publish the caret position for the cursor layer. The position variables are
 * written on the `.shikitor-cursors` element rather than the editor root:
 * custom properties inherit, so a root-level write restyles every line and
 * token under the editor on each caret move, while the only consumers are
 * the caret elements inside that layer.
 */
export function setCursorGeometry(
  target: HTMLElement,
  position: { x: number; y: number }
) {
  const host = cursorLayer(target) ?? target
  const top = `${position.y}px`
  const left = `${position.x}px`
  if (host.style.getPropertyValue('--shikitor-cursor-t') !== top) {
    host.style.setProperty('--shikitor-cursor-t', top)
  }
  if (host.style.getPropertyValue('--shikitor-cursor-l') !== left) {
    host.style.setProperty('--shikitor-cursor-l', left)
  }
}
