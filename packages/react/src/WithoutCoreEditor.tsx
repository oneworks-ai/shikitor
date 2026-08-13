import type { create, Shikitor, ShikitorOptions } from '@shikitor/core'
import type { EditorProps, EditorRef } from '@shikitor/react'
import React, { forwardRef, useCallback, useEffect, useRef } from 'react'

import { useDefault } from './hooks/useDefault'
import { useEvent } from './hooks/useEvent'

export interface WithoutCoreEditorProps extends EditorProps {
  create?: typeof create
}

// TODO abstract to @shikitor/utils
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: number
  return (...args: any[]) => {
    clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), delay)
  }
}

export const WithoutCoreEditor = forwardRef<
  EditorRef,
  WithoutCoreEditorProps
>(function WithoutCoreEditor(props, ref) {
  const {
    value,
    defaultValue,
    options,
    defaultOptions,
    plugins,
    create,
    style,
    className
  } = props
  const {
    onChange,
    onMounted,
    onColorChange,
    onKeydown,
    onKeyup,
    onFocused,
    onBlurred
  } = props
  const emitsRef = useRef({
    change: useEvent(onChange),
    mounted: useEvent(onMounted),
    colorChange: useEvent(onColorChange),
    keydown: useEvent(onKeydown),
    keyup: useEvent(onKeyup),
    focus: useEvent(onFocused),
    blur: useEvent(onBlurred)
  })
  const shikitorRef = useRef<Shikitor | null>(null)
  const eleRef = useRef<HTMLDivElement>(null)

  const mount = useCallback((shikitor: Shikitor) => {
    shikitorRef.current = shikitor
    if (ref) {
      if (typeof ref === 'function') {
        ref(shikitor)
      } else {
        ref.current = shikitor
      }
    }
    const emits = emitsRef.current
    shikitor.context.on('shikitor/change', emits.change)
    emits.mounted(shikitor)
  }, [ref])

  const vRefHandle = useCallback((v: string) => {
    const shikitor = shikitorRef.current
    if (!shikitor) return

    shikitor.value = v
  }, [])

  const { vRef: valueRef } = useDefault(value, defaultValue, vRefHandle)

  const optionRefHandle = useCallback((opts: Omit<ShikitorOptions, 'plugins'>) => {
    const shikitor = shikitorRef.current
    if (!shikitor) return

    shikitor.updateOptions(old => ({ ...old, ...opts }))
  }, [])

  const { vRef: optionsRef } = useDefault(options, defaultOptions, optionRefHandle)

  useEffect(() => {
    if (!eleRef.current) return
    const ele = eleRef.current

    const throttleChange = debounce(onColorChange ?? (() => void 0), 20)
    const observer = new MutationObserver(mutationsList => {
      for (const mutation of mutationsList) {
        const target = mutation.target as HTMLElement
        if (mutation.attributeName === 'style') {
          const bg = target.style.backgroundColor
          const fg = target.style.color
          throttleChange({ bg, fg })
        }
      }
    })
    observer.observe(ele, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [onColorChange])
  useEffect(() => {
    if (!eleRef.current) return
    const ele = eleRef.current

    const abortController = new AbortController()
    const abortSignal = abortController.signal
    const options = optionsRef.current
    const emits = emitsRef.current
    const overrideOpts = {
      ...options,
      onKeydown: e => {
        emits.keydown(e)
        options?.onKeydown?.(e)
      },
      onKeyup: e => {
        emits.keyup(e)
        options?.onKeyup?.(e)
      },
      onFocused: () => {
        emits.focus()
        options?.onFocused?.()
      },
      onBlurred: () => {
        emits.blur()
        options?.onBlurred?.()
      },
      plugins
    } satisfies ShikitorOptions
    if (valueRef.current) {
      overrideOpts.value = valueRef.current
    }
    create?.(ele, overrideOpts, { abort: abortSignal })
      .then(mount)
      .catch(e => {
        if (e instanceof Error && e.message === 'Aborted') return
        console.error(e)
      })
    return () => {
      abortController.abort()
      shikitorRef.current?.[Symbol.dispose]()
    }
  }, [create, mount, optionsRef, plugins, valueRef])
  return (
    <div
      ref={eleRef}
      style={style}
      className={className}
    />
  )
})
