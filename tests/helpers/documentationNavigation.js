export async function openDocumentation(ui) {
  if (!document.querySelector('.all-documentation-action')) {
    await ui.click(document.querySelector('.primary-nav button'))
  }
  await ui.waitFor(() => document.querySelector('.all-documentation-action'))
  await ui.click(document.querySelector('.all-documentation-action'))
  await ui.waitFor(() => document.querySelector('.notes-panel'))
}
