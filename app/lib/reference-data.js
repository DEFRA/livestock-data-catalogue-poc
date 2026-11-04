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

// Every value in a reference collection or code list, in the list's order
export function referenceValues(catalogue, listName) {
  const values = catalogue.referenceLists.get(listName)
  if (!values) {
    throw new Error(`There is no ${listName} list`)
  }
  return [...values.values()]
}
