import type { Language } from './i18n';

export interface CollectorTier {
  tier: number;
  game: string;
  gameTitle: string;
  nameEn: string;
  nameHu: string;
  icon: string;
  percentage: number;
  ownedCount: number;
  totalCount: number;
  minPercentage: number;
  nextTierMin: number;
  color: string;
  bg: string;
  border: string;
  badgeStyle: React.CSSProperties;
}

export interface SellerTier {
  tier: number;
  nameEn: string;
  nameHu: string;
  icon: string;
  itemsSold: number;
  minSales: number;
  nextTierSales: number;
  ratingAvg: number;
  isOwner: boolean;
  color: string;
  bg: string;
  border: string;
  badgeStyle: React.CSSProperties;
}

export function formatGameTitle(game: string): string {
  const g = (game || 'riftbound').toLowerCase();
  if (g === 'cyberpunk') return 'Cyberpunk';
  if (g === 'riftbound') return 'Riftbound';
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/**
 * Calculates a game-specific collector tier based on unique cards owned in that game.
 */
export function getCollectorTier(
  ownedInGameCount: number,
  totalInGameCount: number,
  game: string = 'riftbound'
): CollectorTier {
  const gameTitle = formatGameTitle(game);
  const total = Math.max(1, totalInGameCount);
  const owned = Math.max(0, ownedInGameCount);
  const percentage = Math.min(100, Math.round((owned / total) * 100));

  if (percentage >= 100) {
    return {
      tier: 6,
      game,
      gameTitle,
      nameEn: `Mythic ${gameTitle} Completionist`,
      nameHu: `Mitikus ${gameTitle} Teljesítő (100%)`,
      icon: '🌌',
      percentage,
      ownedCount: owned,
      totalCount: total,
      minPercentage: 100,
      nextTierMin: 100,
      color: '#e879f9',
      bg: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(236, 72, 153, 0.25) 100%)',
      border: 'rgba(232, 121, 249, 0.6)',
      badgeStyle: {
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(236, 72, 153, 0.25) 100%)',
        borderColor: 'rgba(232, 121, 249, 0.6)',
        color: '#f0abfc',
        boxShadow: '0 0 16px rgba(217, 70, 239, 0.35)',
      },
    };
  }

  if (percentage >= 90) {
    return {
      tier: 5,
      game,
      gameTitle,
      nameEn: `Master ${gameTitle} Collector`,
      nameHu: `Mester ${gameTitle} Gyűjtő`,
      icon: '👑',
      percentage,
      ownedCount: owned,
      totalCount: total,
      minPercentage: 90,
      nextTierMin: 100,
      color: '#fbbf24',
      bg: 'rgba(245, 158, 11, 0.2)',
      border: 'rgba(245, 158, 11, 0.5)',
      badgeStyle: {
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(234, 179, 8, 0.2) 100%)',
        borderColor: 'rgba(245, 158, 11, 0.5)',
        color: '#fde047',
        boxShadow: '0 0 14px rgba(245, 158, 11, 0.25)',
      },
    };
  }

  if (percentage >= 75) {
    return {
      tier: 4,
      game,
      gameTitle,
      nameEn: `Diamond ${gameTitle} Collector`,
      nameHu: `Gyémánt ${gameTitle} Gyűjtő`,
      icon: '💎',
      percentage,
      ownedCount: owned,
      totalCount: total,
      minPercentage: 75,
      nextTierMin: 90,
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.18)',
      border: 'rgba(56, 189, 248, 0.45)',
      badgeStyle: {
        background: 'rgba(56, 189, 248, 0.18)',
        borderColor: 'rgba(56, 189, 248, 0.45)',
        color: '#7dd3fc',
        boxShadow: '0 0 12px rgba(56, 189, 248, 0.25)',
      },
    };
  }

  if (percentage >= 50) {
    return {
      tier: 3,
      game,
      gameTitle,
      nameEn: `Gold ${gameTitle} Collector`,
      nameHu: `Arany ${gameTitle} Gyűjtő`,
      icon: '🥇',
      percentage,
      ownedCount: owned,
      totalCount: total,
      minPercentage: 50,
      nextTierMin: 75,
      color: '#facc15',
      bg: 'rgba(250, 204, 21, 0.15)',
      border: 'rgba(250, 204, 21, 0.4)',
      badgeStyle: {
        background: 'rgba(250, 204, 21, 0.15)',
        borderColor: 'rgba(250, 204, 21, 0.4)',
        color: '#fde047',
      },
    };
  }

  if (percentage >= 25) {
    return {
      tier: 2,
      game,
      gameTitle,
      nameEn: `Silver ${gameTitle} Collector`,
      nameHu: `Ezüst ${gameTitle} Gyűjtő`,
      icon: '🥈',
      percentage,
      ownedCount: owned,
      totalCount: total,
      minPercentage: 25,
      nextTierMin: 50,
      color: '#e2e8f0',
      bg: 'rgba(226, 232, 240, 0.12)',
      border: 'rgba(226, 232, 240, 0.35)',
      badgeStyle: {
        background: 'rgba(226, 232, 240, 0.12)',
        borderColor: 'rgba(226, 232, 240, 0.35)',
        color: '#f1f5f9',
      },
    };
  }

  if (percentage >= 10) {
    return {
      tier: 1,
      game,
      gameTitle,
      nameEn: `Bronze ${gameTitle} Collector`,
      nameHu: `Bronz ${gameTitle} Gyűjtő`,
      icon: '🥉',
      percentage,
      ownedCount: owned,
      totalCount: total,
      minPercentage: 10,
      nextTierMin: 25,
      color: '#fdba74',
      bg: 'rgba(251, 146, 60, 0.12)',
      border: 'rgba(251, 146, 60, 0.35)',
      badgeStyle: {
        background: 'rgba(251, 146, 60, 0.12)',
        borderColor: 'rgba(251, 146, 60, 0.35)',
        color: '#fed7aa',
      },
    };
  }

  return {
    tier: 0,
    game,
    gameTitle,
    nameEn: `Novice ${gameTitle} Collector`,
    nameHu: `Kezdő ${gameTitle} Gyűjtő`,
    icon: '🌱',
    percentage,
    ownedCount: owned,
    totalCount: total,
    minPercentage: 0,
    nextTierMin: 10,
    color: '#a1a1aa',
    bg: 'rgba(255, 255, 255, 0.06)',
    border: 'rgba(255, 255, 255, 0.15)',
    badgeStyle: {
      background: 'rgba(255, 255, 255, 0.06)',
      borderColor: 'rgba(255, 255, 255, 0.15)',
      color: '#d4d4d8',
    },
  };
}

/**
 * Calculates a seller tier based on items sold count.
 * Users with >= 1 sold item receive the "Verified Seller" badge.
 */
export function getSellerTier(
  itemsSold: number = 0,
  ratingAvg: number = 5.0,
  isOwner: boolean = false
): SellerTier {
  const sold = Math.max(0, itemsSold);

  if (isOwner) {
    return {
      tier: 99,
      nameEn: 'Store Founder',
      nameHu: 'Boltalapító',
      icon: '👑',
      itemsSold: sold,
      minSales: 0,
      nextTierSales: 0,
      ratingAvg,
      isOwner: true,
      color: '#fbbf24',
      bg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(234, 179, 8, 0.25) 100%)',
      border: 'rgba(245, 158, 11, 0.6)',
      badgeStyle: {
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(234, 179, 8, 0.25) 100%)',
        borderColor: 'rgba(245, 158, 11, 0.6)',
        color: '#fef08a',
        boxShadow: '0 0 16px rgba(245, 158, 11, 0.35)',
      },
    };
  }

  if (sold >= 100) {
    return {
      tier: 5,
      nameEn: 'Diamond Merchant',
      nameHu: 'Gyémánt Kereskedő',
      icon: '💎',
      itemsSold: sold,
      minSales: 100,
      nextTierSales: 100,
      ratingAvg,
      isOwner: false,
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.2)',
      border: 'rgba(56, 189, 248, 0.5)',
      badgeStyle: {
        background: 'rgba(56, 189, 248, 0.2)',
        borderColor: 'rgba(56, 189, 248, 0.5)',
        color: '#7dd3fc',
        boxShadow: '0 0 14px rgba(56, 189, 248, 0.3)',
      },
    };
  }

  if (sold >= 50) {
    return {
      tier: 4,
      nameEn: 'Gold Merchant',
      nameHu: 'Arany Kereskedő',
      icon: '🥇',
      itemsSold: sold,
      minSales: 50,
      nextTierSales: 100,
      ratingAvg,
      isOwner: false,
      color: '#facc15',
      bg: 'rgba(250, 204, 21, 0.18)',
      border: 'rgba(250, 204, 21, 0.45)',
      badgeStyle: {
        background: 'rgba(250, 204, 21, 0.18)',
        borderColor: 'rgba(250, 204, 21, 0.45)',
        color: '#fef08a',
      },
    };
  }

  if (sold >= 20) {
    return {
      tier: 3,
      nameEn: 'Silver Merchant',
      nameHu: 'Ezüst Kereskedő',
      icon: '🥈',
      itemsSold: sold,
      minSales: 20,
      nextTierSales: 50,
      ratingAvg,
      isOwner: false,
      color: '#e2e8f0',
      bg: 'rgba(226, 232, 240, 0.15)',
      border: 'rgba(226, 232, 240, 0.4)',
      badgeStyle: {
        background: 'rgba(226, 232, 240, 0.15)',
        borderColor: 'rgba(226, 232, 240, 0.4)',
        color: '#f8fafc',
      },
    };
  }

  if (sold >= 5) {
    return {
      tier: 2,
      nameEn: 'Bronze Merchant',
      nameHu: 'Bronz Kereskedő',
      icon: '🥉',
      itemsSold: sold,
      minSales: 5,
      nextTierSales: 20,
      ratingAvg,
      isOwner: false,
      color: '#fdba74',
      bg: 'rgba(251, 146, 60, 0.15)',
      border: 'rgba(251, 146, 60, 0.4)',
      badgeStyle: {
        background: 'rgba(251, 146, 60, 0.15)',
        borderColor: 'rgba(251, 146, 60, 0.4)',
        color: '#fed7aa',
      },
    };
  }

  if (sold >= 1) {
    return {
      tier: 1,
      nameEn: 'Verified Seller',
      nameHu: 'Hitelesített Eladó',
      icon: '⭐',
      itemsSold: sold,
      minSales: 1,
      nextTierSales: 5,
      ratingAvg,
      isOwner: false,
      color: '#34d399',
      bg: 'rgba(16, 185, 129, 0.15)',
      border: 'rgba(16, 185, 129, 0.45)',
      badgeStyle: {
        background: 'rgba(16, 185, 129, 0.15)',
        borderColor: 'rgba(16, 185, 129, 0.45)',
        color: '#6ee7b7',
        boxShadow: '0 0 10px rgba(16, 185, 129, 0.2)',
      },
    };
  }

  return {
    tier: 0,
    nameEn: 'New Seller',
    nameHu: 'Új Eladó',
    icon: '🌱',
    itemsSold: 0,
    minSales: 0,
    nextTierSales: 1,
    ratingAvg,
    isOwner: false,
    color: '#a1a1aa',
    bg: 'rgba(255, 255, 255, 0.06)',
    border: 'rgba(255, 255, 255, 0.15)',
    badgeStyle: {
      background: 'rgba(255, 255, 255, 0.06)',
      borderColor: 'rgba(255, 255, 255, 0.15)',
      color: '#d4d4d8',
    },
  };
}

export function getTierBadgeLabel(badge: CollectorTier | SellerTier, lang: Language): string {
  return lang === 'hu' ? badge.nameHu : badge.nameEn;
}
