/** Read cached program metadata without querying the GL driver or touching materials. */
export interface DiagnosticProgram {
  id: number
  name?: string
  type?: string
  cacheKey?: string
}
export function describePrograms(programs: readonly DiagnosticProgram[], afterId = -1) {
  return programs
    .filter((program) => program.id > afterId)
    .map((program) => ({
      id: program.id,
      name: program.name || program.type || 'Unnamed shader',
      type: program.type,
      variant: program.cacheKey?.slice(0, 400),
    }))
}
export function latestProgramId(programs: readonly DiagnosticProgram[]): number {
  let latest = -1
  for (const program of programs) latest = Math.max(latest, program.id)
  return latest
}
