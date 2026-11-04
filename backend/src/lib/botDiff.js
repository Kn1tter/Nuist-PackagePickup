/** 人机难度：简单 / 普通 / 困难 / 普通 yjz / 全解放 yjz（后两者分开，不混用车体） */

export const BOT_DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: '简单',
    label: '人机·简单',
    tankType: 'default',
    tankAngleNoise: 18,
    tankPowerNoise: 22,
    tankMissChance: 0.38,
    poolAngleNoise: 0.22,
    poolPowerNoise: 0.18,
    poolMissChance: 0.4,
  },
  normal: {
    id: 'normal',
    name: '普通',
    label: '人机·普通',
    tankType: 'default',
    tankAngleNoise: 8,
    tankPowerNoise: 12,
    tankMissChance: 0.14,
    poolAngleNoise: 0.1,
    poolPowerNoise: 0.1,
    poolMissChance: 0.15,
  },
  hard: {
    id: 'hard',
    name: '困难',
    label: '人机·困难',
    tankType: 'default',
    tankAngleNoise: 2.5,
    tankPowerNoise: 4,
    tankMissChance: 0.04,
    poolAngleNoise: 0.035,
    poolPowerNoise: 0.04,
    poolMissChance: 0.04,
  },
  yjz: {
    id: 'yjz',
    name: '普通 yjz',
    label: '人机·普通 yjz',
    /** 必中 + 默认车体 */
    tankType: 'default',
    tankAngleNoise: 0,
    tankPowerNoise: 0,
    tankMissChance: 0,
    poolAngleNoise: 0,
    poolPowerNoise: 0,
    poolMissChance: 0,
    perfect: true,
  },
  yjz_full: {
    id: 'yjz_full',
    name: '全解放 yjz',
    label: '人机·全解放 yjz',
    /** 必中 + 全解放车体 */
    tankType: 'yjz',
    tankAngleNoise: 0,
    tankPowerNoise: 0,
    tankMissChance: 0,
    poolAngleNoise: 0,
    poolPowerNoise: 0,
    poolMissChance: 0,
    perfect: true,
  },
};

const LEGACY = {
  yjz_lib: 'yjz_full',
  full: 'yjz_full',
};

export function normalizeBotDiff(raw) {
  let id = String(raw || 'normal').toLowerCase();
  if (LEGACY[id]) id = LEGACY[id];
  return BOT_DIFFICULTIES[id] || BOT_DIFFICULTIES.normal;
}

export function botDiffPublic() {
  return Object.values(BOT_DIFFICULTIES).map((d) => ({
    id: d.id,
    name: d.name,
    label: d.label,
    tankType: d.tankType || 'default',
  }));
}
