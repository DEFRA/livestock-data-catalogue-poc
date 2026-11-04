export function referenceValue(catalogue, listName, code) {
  const value = catalogue.referenceLists.get(listName)?.get(code)
  if (!value) {
    throw new Error(`No ${listName} value has the code ${code}`)
  }
  return value
}

export function nameFor(catalogue, listName, code) {
  return referenceValue(catalogue, listName, code).name
}
