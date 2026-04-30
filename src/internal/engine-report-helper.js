export function readEmbeddedEngineReport(engine) {
  const session = engine?.getCurrentLayoutSession?.() ?? null;
  const report = session?.getSimulationReport?.()
    ?? engine?.getLastSimulationReport?.()
    ?? undefined;
  const reader = session?.getSimulationReportReader?.()
    ?? engine?.getLastSimulationReportReader?.()
    ?? null;

  return {
    session,
    report,
    reader,
    profile: session?.getProfileSnapshot?.() ?? {},
    interactionMap: reader?.get?.("interactionMap")
      ?? report?.artifacts?.interactionMap
      ?? []
  };
}
