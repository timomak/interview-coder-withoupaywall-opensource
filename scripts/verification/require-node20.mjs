const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10)

if (nodeMajor !== 20) {
  console.error(
    `InterviewCopilot verification requires Node 20; received ${process.version}.`
  )
  process.exit(1)
}

console.log(`Node runtime accepted: ${process.version}`)
