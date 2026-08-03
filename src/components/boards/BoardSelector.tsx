interface Props {
  currentBoard: 'development' | 'administrative'
  onChange: (board: 'development' | 'administrative') => void
}

export default function BoardSelector({ currentBoard, onChange }: Props) {
  return (
    <div className="flex gap-2 bg-gray-100 p-1 rounded-lg inline-flex">
      <button
        onClick={() => onChange('development')}
        className={`px-4 py-2 rounded-md font-medium text-sm transition ${
          currentBoard === 'development'
            ? 'bg-white text-primary shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        💻 Development
      </button>
      <button
        onClick={() => onChange('administrative')}
        className={`px-4 py-2 rounded-md font-medium text-sm transition ${
          currentBoard === 'administrative'
            ? 'bg-white text-primary shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        📋 Administrative
      </button>
    </div>
  )
}