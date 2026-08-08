export class RouteController {
  // Paleta bez odcieni zieleni (unikamy mylenia z oznakowaniem szlaków)
  static STAGE_COLORS = ['#e63946', '#457b9d', '#7209b7', '#f77f00', '#9d0208', '#6a4c93'];

  static getStageColor(index) {
    return this.STAGE_COLORS[index % this.STAGE_COLORS.length];
  }

  static getPoisForProfile(allPois, profile) {
    return allPois.filter(poi => poi.profiles && poi.profiles.includes(profile));
  }

  static getVariantStages(daysCount, filteredPois) {
    if (!filteredPois || filteredPois.length < 2) return [];

    const startPoi = filteredPois[0];
    const endPoi = filteredPois[filteredPois.length - 1];

    const isWildMode = filteredPois.some(p => p.profiles && p.profiles.includes('wild'));

    const validSleepPois = filteredPois.filter(poi => {
      if (poi.id === startPoi.id || poi.id === endPoi.id) return true;
      if (isWildMode) {
        return poi.type === 'sleep_indoor' || poi.type === 'sleep_outdoor';
      }
      return poi.type === 'sleep_indoor';
    });

    const stages = [];
    let currentStart = startPoi;

    for (let day = 1; day <= daysCount; day++) {
      if (day === daysCount) {
        stages.push(this.buildStage(day, currentStart, endPoi, daysCount));
        break;
      }

      const remainingDays = daysCount - day + 1;
      // Zabezpieczenie przed wartościami ujemnymi (Math.abs) po odwróceniu szlaku
      const remainingKm = Math.abs(endPoi.km - currentStart.km);
      const targetDailyKm = remainingKm / remainingDays;
      
      // Zabezpieczenie przed kierunkiem szlaku 
      const isReversed = endPoi.km < currentStart.km;
      const targetKm = isReversed ? currentStart.km - targetDailyKm : currentStart.km + targetDailyKm;

      const candidates = validSleepPois.filter(poi => {
          if (isReversed) {
              return poi.km < currentStart.km && poi.km > endPoi.km;
          } else {
              return poi.km > currentStart.km && poi.km < endPoi.km;
          }
      });

      if (candidates.length === 0) {
        stages.push(this.buildStage(day, currentStart, endPoi, daysCount));
        break;
      }

      let bestEndPoi = candidates[0];
      let minDiff = Math.abs(candidates[0].km - targetKm);

      for (let j = 1; j < candidates.length; j++) {
        const diff = Math.abs(candidates[j].km - targetKm);
        if (diff < minDiff) {
          minDiff = diff;
          bestEndPoi = candidates[j];
        }
      }

      stages.push(this.buildStage(day, currentStart, bestEndPoi, daysCount));
      currentStart = bestEndPoi;
    }

    return stages;
  }

  static buildStage(day, startPoi, endPoi, totalDays) {
    // Zabezpieczenie przed wyświetlaniem ujemnego dystansu
    const distanceKm = Math.abs(Math.round((endPoi.km - startPoi.km) * 10) / 10);
    return {
      day: day,
      startPoi: startPoi,
      endPoi: endPoi,
      startName: startPoi.name,
      endName: endPoi.name,
      distanceKm,
      color: this.getStageColor(day - 1)
    };
  }
}