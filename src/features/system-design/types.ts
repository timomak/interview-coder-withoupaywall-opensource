export const SYSTEM_DESIGN_SECTIONS = [
  "clarify",
  "estimate",
  "architecture",
  "data-apis",
  "deep-dives-trade-offs"
] as const

export type SystemDesignSectionId =
  (typeof SYSTEM_DESIGN_SECTIONS)[number]

export const ARCHITECTURE_NODE_TYPES = [
  "client",
  "gateway",
  "service",
  "datastore",
  "cache",
  "queue",
  "stream",
  "worker",
  "external"
] as const

export type ArchitectureNodeType =
  (typeof ARCHITECTURE_NODE_TYPES)[number]

export interface ArchitectureNode {
  readonly id: string
  readonly type: ArchitectureNodeType
  readonly label: string
  readonly detail: string
}

export interface ArchitectureEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly label: string
}

export interface ArchitectureGraph {
  readonly nodes: readonly ArchitectureNode[]
  readonly edges: readonly ArchitectureEdge[]
}

export interface MaterialCalculation {
  readonly name: string
  readonly expression: string
  readonly result: number
  readonly unit: string
  readonly assumption: string
}
