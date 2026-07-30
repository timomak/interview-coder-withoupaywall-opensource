export interface WindowBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface DisplayGeometry {
  readonly id: string
  readonly workArea: WindowBounds
}

export type HudState = "compact-bar" | "compact-answer" | "expanded"

export function clampWindowBounds(
  bounds: WindowBounds,
  workArea: WindowBounds
): WindowBounds {
  const width = Math.min(Math.max(1, Math.round(bounds.width)), workArea.width)
  const height = Math.min(Math.max(1, Math.round(bounds.height)), workArea.height)
  return {
    x: Math.min(
      Math.max(Math.round(bounds.x), workArea.x),
      workArea.x + workArea.width - width
    ),
    y: Math.min(
      Math.max(Math.round(bounds.y), workArea.y),
      workArea.y + workArea.height - height
    ),
    width,
    height
  }
}

function distanceSquared(bounds: WindowBounds, display: DisplayGeometry): number {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const area = display.workArea
  const nearestX = Math.max(area.x, Math.min(centerX, area.x + area.width))
  const nearestY = Math.max(area.y, Math.min(centerY, area.y + area.height))
  return (centerX - nearestX) ** 2 + (centerY - nearestY) ** 2
}

export function nearestDisplay(
  bounds: WindowBounds,
  displays: readonly DisplayGeometry[]
): DisplayGeometry {
  if (displays.length === 0) throw new Error("At least one display is required")
  return [...displays].sort(
    (left, right) =>
      distanceSquared(bounds, left) - distanceSquared(bounds, right) ||
      left.id.localeCompare(right.id)
  )[0]
}

export class DisplayGeometryStore {
  private readonly remembered = new Map<string, WindowBounds>()

  remember(displayId: string, state: HudState, bounds: WindowBounds): void {
    this.remembered.set(`${displayId}:${state}`, { ...bounds })
  }

  restore(
    preferredDisplayId: string,
    state: HudState,
    fallback: WindowBounds,
    displays: readonly DisplayGeometry[]
  ): WindowBounds {
    const preferred =
      displays.find(({ id }) => id === preferredDisplayId) ??
      nearestDisplay(fallback, displays)
    const remembered =
      this.remembered.get(`${preferred.id}:${state}`) ?? fallback
    return clampWindowBounds(remembered, preferred.workArea)
  }
}
