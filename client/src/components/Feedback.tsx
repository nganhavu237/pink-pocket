export function ErrorMessage({
  message,
  retry,
}: {
  message: string
  retry?: () => void
}) {
  return (
    <div
      role="alert"
      className="my-4 rounded-xl border border-[#b75d73] bg-secondary p-4 text-sm"
    >
      <p>{message}</p>
      {retry && (
        <button type="button" className="mt-2 underline" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  )
}
export function LoadingState() {
  return (
    <p role="status" className="py-12 text-center text-sm text-muted">
      Loading…
    </p>
  )
}
export function EmptyState({ message }: { message: string }) {
  return <p className="py-12 text-center text-sm text-muted">{message}</p>
}
