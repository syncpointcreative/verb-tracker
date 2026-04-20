import type { ReactNode } from 'react'

interface BriefSection {
  id: string
  title: string
  content: string
  sort_order: number
}

function renderContent(content: string) {
  const lines = content.split('\n')
  const elements: ReactNode[] = []
  let listBuffer: string[] = []

  const flushList = (key: string) => {
    if (listBuffer.length) {
      elements.push(
        <ul key={key} className="list-disc ml-5 space-y-1 mb-2">
          {listBuffer.map((item, i) => (
            <li key={i} className="text-sm text-gray-700">{item}</li>
          ))}
        </ul>
      )
      listBuffer = []
    }
  }

  lines.forEach((line, i) => {
    if (line.startsWith('• ') || line.startsWith('- ')) {
      listBuffer.push(line.slice(2))
    } else {
      flushList(`list-${i}`)
      if (line === '') {
        elements.push(<div key={i} className="h-2" />)
      } else if (line.startsWith('**') && line.endsWith('**')) {
        elements.push(
          <p key={i} className="text-sm font-bold text-gray-900 mt-3 mb-1">
            {line.slice(2, -2)}
          </p>
        )
      } else {
        elements.push(
          <p key={i} className="text-sm text-gray-700 leading-relaxed">
            {line}
          </p>
        )
      }
    }
  })
  flushList('list-end')

  return elements
}

export default function BriefPanel({ sections }: { sections: BriefSection[] }) {
  if (!sections.length) {
    return (
      <div className="py-16 text-center text-gray-400">
        <p className="text-sm">No creator brief available for this client yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {sections.map(section => (
        <div key={section.id} className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
            {section.title}
          </h3>
          <div className="space-y-0.5">
            {renderContent(section.content)}
          </div>
        </div>
      ))}
    </div>
  )
}
