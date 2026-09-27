'use strict';

// 核算编排：取出具名材料档，调用物理内核完成速率与总量计算，并完成 SI->工程单位换算。
// 这一层不含 HTTP、不含路由，便于直接对其做守恒关系的自动化测试。

const { massLossRateKgPerM2S, toGramsPerM2Day } = require('./physics/equivalent');
const { penetrationRateMPerS, toMmPerYear } = require('./physics/depth');
const { totalCurrent, cumulativeMassLossKg } = require('./physics/totals');
const { GRAMS_PER_KG } = require('./physics/constants');

class CorrosionService {
  constructor(repository) {
    this.repository = repository;
    // 1 A/m² 下的单位速率，按电化学当量 (M, z) 复用；
    // 速率与电流密度成正比，实际结果按电流密度线性放大。
    this._unitRates = new Map();
  }

  _unitRatesFor(material) {
    const key = `${material.molarMassKgPerMol}/${material.valence}`;
    let unit = this._unitRates.get(key);
    if (!unit) {
      const massRate = massLossRateKgPerM2S(
        material.molarMassKgPerMol,
        1,
        material.valence
      );
      unit = {
        massRate,
        penetration: penetrationRateMPerS(massRate, material.densityKgPerM3),
      };
      this._unitRates.set(key, unit);
    }
    return unit;
  }

  calculate(input) {
    // 只从具名档取参，参数严格属于该档，不与其他档混杂。
    const material = this.repository.get(input.materialName);
    const unit = this._unitRatesFor(material);

    const massRateKgM2S = unit.massRate * input.currentDensityAmpPerM2;
    const penetrationMS = unit.penetration * input.currentDensityAmpPerM2;

    const result = {
      materialName: material.name,
      input: {
        currentDensityAmpPerM2: input.currentDensityAmpPerM2,
      },
      rates: {
        massLossKgPerM2S: massRateKgM2S,
        massLossGPerM2Day: toGramsPerM2Day(massRateKgM2S),
        penetrationMPerS: penetrationMS,
        penetrationMmPerYear: toMmPerYear(penetrationMS),
      },
    };

    if (input.areaM2 !== undefined) {
      result.input.areaM2 = input.areaM2;
      result.totals = {
        totalCurrentAmp: totalCurrent(
          input.currentDensityAmpPerM2,
          input.areaM2
        ),
      };
    }

    if (input.areaM2 !== undefined && input.durationDays !== undefined) {
      result.input.durationDays = input.durationDays;
      const massKg = cumulativeMassLossKg(
        massRateKgM2S,
        input.areaM2,
        input.durationDays
      );
      result.totals.cumulativeMassLossKg = massKg;
      result.totals.cumulativeMassLossG = massKg * GRAMS_PER_KG;
    }

    return result;
  }
}

module.exports = { CorrosionService };
