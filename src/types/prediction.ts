export type PredictionConfidenceLabel = "high" | "medium" | "low" | "insufficient";
export type VibeTrendDirection = "up" | "down" | "stable" | "unknown";

export interface PredictionResponse {
  status: "success";
  data: {
    venueId: string;
    predictions: {
      bestTimeToVisit: {
        dayOfWeek: string;
        hourWindow: string;
        basis: string;
      } | null;
      peakCrowdWindow: {
        tonight: string | null;
        thisWeekend: string | null;
      };
      vibeTrend: {
        direction: VibeTrendDirection;
        description: string;
      };
      crowdProfileForecast: {
        malePercent: number | null;
        basis: string;
      } | null;
    };
    dataQuality: {
      checkInCount: number;
      hasBestTimeData: boolean;
      confidenceLabel: PredictionConfidenceLabel;
    };
    attribution: string;
    warning: string | null;
  };
  meta: {
    venueId: string;
    generatedAt: string;
    model: string;
  };
}
