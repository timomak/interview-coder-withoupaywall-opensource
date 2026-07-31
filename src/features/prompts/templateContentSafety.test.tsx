import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { InertTemplateContent } from "./PromptStudio"

it("renders untrusted instructions inertly", () => {
  const content = '<script>window.pwned=true</script><a href="https://attacker.invalid">open</a>'
  const rendered = render(<InertTemplateContent content={content} />)
  expect(screen.getByText(content)).toHaveAttribute("data-content-role", "inert-text")
  expect(rendered.container.querySelector("script")).toBeNull()
  expect(rendered.container.querySelector("a")).toBeNull()
  expect(rendered.container.innerHTML).toContain("&lt;script&gt;")
  expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined()
})
