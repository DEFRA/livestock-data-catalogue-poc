import neostandard from 'neostandard'

export default neostandard({
  env: ['node'],
  ignores: [...neostandard.resolveIgnoresFromGitignore()],
  noJsx: true,
  noStyle: true
})
