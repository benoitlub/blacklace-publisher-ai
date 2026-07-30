app.post('/execute', async (c) => {
  const { mission } = await c.req.json();
  // Exécuter la mission TERRA/Yaelbali
  const harvest = await runTerraHarvest(mission);
  return c.json({ status: 'completed', summary: 'Publisher Harvest', output: harvest });
});
