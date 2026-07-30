export class ComposerVisibilityController {
  private restoreHiddenOnClose = false

  open(currentlyVisible: boolean): { readonly reveal: boolean } {
    this.restoreHiddenOnClose ||= !currentlyVisible
    return { reveal: !currentlyVisible }
  }

  close(): { readonly hide: boolean } {
    const hide = this.restoreHiddenOnClose
    this.restoreHiddenOnClose = false
    return { hide }
  }
}
