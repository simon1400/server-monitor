import { ChevronRight, Hourglass, FileText } from 'lucide-react'
import type { ProjectSummary } from '../../types/billing'
import { formatAmount, daysSince } from './format'

export default function ProjectCard({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }) {
  const age = project.oldestUnbilledDate ? daysSince(project.oldestUnbilledDate) : null
  const ageCls = age == null ? '' : age > 60 ? 'text-accent-red font-medium' : age > 30 ? 'text-accent-yellow font-medium' : 'text-text-muted'
  const hasUnbilled = project.unbilledCount > 0

  return (
    <button
      onClick={onOpen}
      className={`w-full text-left bg-bg-card rounded-xl border p-3 sm:p-4 transition-colors hover:bg-bg-card-hover ${
        age != null && age > 60 ? 'border-accent-red/40' : age != null && age > 30 ? 'border-accent-yellow/40' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary truncate">{project.name}</h3>
          {project.client && <p className="text-xs text-text-muted truncate">{project.client}</p>}
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted shrink-0 mt-1" />
      </div>

      <div className="mt-3">
        <div className={`text-xl font-bold whitespace-nowrap ${hasUnbilled ? 'text-text-primary' : 'text-text-muted'}`}>
          {formatAmount(project.unbilledTotal, project.currency)}
        </div>
        <div className="text-xs text-text-muted">
          {hasUnbilled ? `${project.unbilledCount} unbilled item${project.unbilledCount === 1 ? '' : 's'}` : 'nothing unbilled'}
        </div>
      </div>

      {(age != null || project.invoicedTotal > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs">
          {age != null && (
            <span className={`flex items-center gap-1 ${ageCls}`}>
              <Hourglass className="w-3 h-3" /> oldest unbilled: {age} day{age === 1 ? '' : 's'}
            </span>
          )}
          {project.invoicedTotal > 0 && (
            <span className="flex items-center gap-1 text-accent-yellow">
              <FileText className="w-3 h-3" /> unpaid {formatAmount(project.invoicedTotal, project.currency)}
            </span>
          )}
        </div>
      )}
    </button>
  )
}
