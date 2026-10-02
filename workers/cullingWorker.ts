// Off-Main-Thread Culling & Spatial Index Worker
self.onmessage = (event: MessageEvent) => {
  const { type, cameraPos, cameraForward, objects } = event.data || {};
  if (type !== 'EVALUATE_BATCH' || !Array.isArray(objects)) return;

  const visibleIds: string[] = [];
  const culledIds: string[] = [];

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const dx = obj.position[0] - cameraPos.x;
    const dy = obj.position[1] - cameraPos.y;
    const dz = obj.position[2] - cameraPos.z;
    const dist = Math.hypot(dx, dy, dz);
    const radius = Math.hypot(obj.size[0], obj.size[1], obj.size[2]) * 0.55;
    const dot = dx * cameraForward.x + dy * cameraForward.y + dz * cameraForward.z;

    if (dot < -radius - 0.5 && dist > radius + 1.5) {
      culledIds.push(obj.id);
    } else {
      visibleIds.push(obj.id);
    }
  }

  self.postMessage({
    type: 'BATCH_RESULT',
    visibleIds,
    culledIds
  });
};
