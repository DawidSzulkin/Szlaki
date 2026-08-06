export class RouteController {
  static STAGE_COLORS = ['#e63946', '#2a9d8f', '#e76f51', '#457b9d', '#9b5de5', '#f15bb5'];

  /**
   * Filtruje punkty POI pod kątem profilu marszu
   */
  static getPoisForProfile(allPois, profile) {
    return allPois.filter(poi => poi.profiles && poi.profiles.includes(profile));
  }

  /**
   * Zwraca etapy dzienne na podstawie profilu i liczby dni
   */
  static getVariantStages(daysCount, filteredPois) {
    if (!filteredPois || filteredPois.length < 2) return [];

    const totalKm = filteredPois[filteredPois.length - 1].km;
    const targetKmPerDay = totalKm / daysCount;

    let selectedIndices = [0];

    for (let day = 1; day < daysCount; day++) {
      const targetKm = day * targetKmPerDay;
      let bestIndex = selectedIndices[selectedIndices.length - 1] + 1;
      let minDiff = Math.abs(filteredPois[bestIndex].km - targetKm);

      for (let i = bestIndex + 1; i < filteredPois.length - (daysCount - day); i++) {
        const diff = Math.abs(filteredPois[i].km - targetKm);
        if (diff < minDiff) {
          minDiff = diff;
          bestIndex = i;
        }
      }

      selectedIndices.push(bestIndex);
    }

    selectedIndices.push(filteredPois.length - 1);

    const stages = [];
    for (let i = 0; i < daysCount; i++) {
      const startPoi = filteredPois[selectedIndices[i]];
      const endPoi = filteredPois[selectedIndices[i + 1]];
      const distanceKm = Math.round((endPoi.km - startPoi.km) * 10) / 10;

      stages.push({
        day: i + 1,
        startPoi,
        endPoi,
        startName: startPoi.name,
        endName: endPoi.name,
        distanceKm,
        color: this.STAGE_COLORS[i % this.STAGE_COLORS.length]
      });
    }

    return stages;
  }
}