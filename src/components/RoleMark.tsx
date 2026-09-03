import type { AgentRole } from '../../shared/agents'
import { DoopMark } from './Logo'

/** A role's badge: a filled circle in the role's crew colour with the white
 *  Doop mark inside, as on the marketing site's team section. `size` is the
 *  circle's diameter; the mark takes about half of it. An unknown role gets a
 *  neutral ink circle so a stale card still reads. */
export function RoleMark({ role, size = 14 }: { role?: Pick<AgentRole, 'color'>; size?: number }) {
  return (
    <span
      className="inline-grid flex-none place-items-center rounded-full align-middle"
      style={{ width: size, height: size, background: role?.color ?? 'var(--ink-faint)' }}
      aria-hidden
    >
      <DoopMark size={Math.round(size * 0.55)} color="#fff" className="block" />
    </span>
  )
}
