import { ICON_PATHS } from '../../../core/src/utils/iconPaths.ts'

export function MaterialIcon({
  name,
  className,
}: {
  readonly name: string
  readonly className?: string
}) {
  const path = ICON_PATHS[name]
  const classes = ['dsh-shikitor-material-icon', className].filter(Boolean).join(' ')
  if (path === undefined) return <span className={classes}>{name}</span>
  return (
    <svg
      aria-hidden="true"
      className={classes}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d={path} />
    </svg>
  )
}
