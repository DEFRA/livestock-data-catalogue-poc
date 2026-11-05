// The Kit loads this file with require(). Exporting the defaults as
// 'module.exports' makes require() return them, rather than a module
// namespace with the defaults under "default".
// The prototype keeps nothing in the session, so there are no defaults
const sessionDataDefaults = {}

export { sessionDataDefaults as 'module.exports' }
