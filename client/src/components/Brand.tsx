import { Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Brand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-3 font-semibold tracking-tight text-xl"
      aria-label="Pink Pocket home"
    >
      <span className="rounded-xl bg-primary p-2.5">
        <Wallet size={22} aria-hidden="true" />
      </span>
      Pink Pocket<span className="text-[#a64b68]">.</span>
    </Link>
  )
}
