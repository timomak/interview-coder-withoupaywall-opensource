import {
  ARCHITECTURE_NODE_TYPES,
  type ArchitectureGraph
} from "./types"

const SAFE_ID = /^[a-z][a-z0-9-]{0,63}$/
const UNSAFE_TEXT = /[<>{}]|\b(?:javascript|data):/i
const VENDOR_LABEL = /\b(?:aws|amazon|azure|gcp|google cloud|dynamodb|s3|lambda|kinesis|cloudfront)\b/i

function unsafeText(value: string): boolean {
  return (
    UNSAFE_TEXT.test(value) ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
}

export function validateArchitectureGraph(
  value: ArchitectureGraph
): readonly string[] {
  const errors: string[] = []
  if (value.nodes.length < 1 || value.nodes.length > 40) {
    errors.push("graph must contain 1-40 nodes")
  }
  if (value.edges.length > 80) errors.push("graph must contain at most 80 edges")
  const nodeIds = new Set<string>()
  for (const node of value.nodes) {
    if (!SAFE_ID.test(node.id) || nodeIds.has(node.id)) {
      errors.push(`invalid or duplicate node id: ${node.id}`)
    }
    nodeIds.add(node.id)
    if (!ARCHITECTURE_NODE_TYPES.includes(node.type)) {
      errors.push(`unsupported node type: ${String(node.type)}`)
    }
    if (
      node.label.trim().length === 0 ||
      node.label.length > 80 ||
      unsafeText(node.label) ||
      VENDOR_LABEL.test(node.label)
    ) {
      errors.push(`unsafe or vendor-specific node label: ${node.id}`)
    }
    if (node.detail.length > 400 || unsafeText(node.detail)) {
      errors.push(`unsafe node detail: ${node.id}`)
    }
  }
  const edgeIds = new Set<string>()
  for (const edge of value.edges) {
    if (!SAFE_ID.test(edge.id) || edgeIds.has(edge.id)) {
      errors.push(`invalid or duplicate edge id: ${edge.id}`)
    }
    edgeIds.add(edge.id)
    if (
      !nodeIds.has(edge.from) ||
      !nodeIds.has(edge.to) ||
      edge.from === edge.to
    ) {
      errors.push(`invalid edge endpoints: ${edge.id}`)
    }
    if (edge.label.length > 80 || unsafeText(edge.label)) {
      errors.push(`unsafe edge label: ${edge.id}`)
    }
  }
  return errors
}

export function architectureText(graph: ArchitectureGraph): string {
  return [
    ...graph.nodes
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => `${node.label} (${node.type}): ${node.detail}`),
    ...graph.edges
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((edge) => `${edge.from} to ${edge.to}: ${edge.label}`)
  ].join("\n")
}
