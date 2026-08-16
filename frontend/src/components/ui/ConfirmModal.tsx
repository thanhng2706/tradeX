import { useState, type ReactNode } from 'react'

export default function ConfirmModal({
  title,
  description,
  confirmLabel = 'Delete',
  confirmingLabel = 'Deleting…',
  danger = true,
  onClose,
  onConfirm,
}: {
  title: string
  description: ReactNode
  confirmLabel?: string
  confirmingLabel?: string
  danger?: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)

  async function handleConfirm() {
    setConfirming(true)
    try {
      await onConfirm()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
        <p className="text-gray-500 text-sm mb-6">{description}</p>
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className={`flex-1 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </button>
          <button
            onClick={onClose}
            className="px-4 text-sm text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
