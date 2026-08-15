import type { Shikitor } from '../../editor'
import type { ShikitorDiffTextEdit } from './actions'

export async function applyDiffTextEdit(
  shikitor: Shikitor,
  input: HTMLTextAreaElement,
  edit: ShikitorDiffTextEdit
) {
  if (edit.start === edit.end && edit.text.length === 0) return
  const previous = input.value
  input.focus({ preventScroll: true })
  input.setSelectionRange(edit.start, edit.end)
  try {
    if (document.execCommand('insertText', false, edit.text) && input.value !== previous) return
  } catch {
    // Fall through to the editor's cross-browser text editing primitive.
  }
  await shikitor.setRangeText(edit, edit.text)
}

