import { Link } from 'react-router-dom'

export function Brand({ sidebar = false }: { sidebar?: boolean }) {
  return (
    <Link
      to="/"
      className={
        sidebar
          ? 'mx-auto block w-32 max-w-full shrink-0'
          : 'flex w-fit items-center gap-3 text-xl font-semibold tracking-tight'
      }
      aria-label="Toki home"
    >
      <svg
        viewBox="110 395 1040 460"
        width="1040"
        height="460"
        className={sidebar ? 'block h-auto w-full' : 'h-14 w-auto'}
        aria-hidden="true"
      >
        <image href="/images/toki-logo.png" width="1254" height="1254" />
      </svg>
    </Link>
  )
}
